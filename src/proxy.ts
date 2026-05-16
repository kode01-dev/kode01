import createMiddleware from 'next-intl/middleware';
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { routing } from './i18n/routing';
import { updateSession } from '@/lib/supabase/proxy';
import { applyProxyRateLimit } from '@/lib/security/rate-limit-middleware';
import { applyProxyBotProtection } from '@/lib/security/bot-middleware';
import { isBlockedBotUserAgent } from '@/lib/security/bot-detection';
import { BOT_FLAG_COOKIE_NAME, getRequestIpAddress } from '@/lib/security/bot-request';
import { logBotActivityDirect, logSecurityEvent } from '@/lib/security/security-log';
import { hasTrustedCsrfSource, isMutatingHttpMethod } from '@/lib/security/csrf';
import { getRequestHostFromHeaders } from '@/lib/http/request-host';
import {
  getTrustedSubdomainOrigins,
  isAdminSubdomainHost,
  isDashboardSubdomainHost,
} from '@/lib/routing/subdomains';
import {
  CANONICAL_APEX_HOST,
  CANONICAL_WWW_HOST,
  getCanonicalRootLocaleRedirectUrl,
} from '@/lib/routing/canonical-root-locale-redirect';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { hasVerifiedMfaMethod, isAal2 } from '@/lib/auth/mfa';
import { isAdminRole } from '@/lib/auth/roles';
import { securityErrorResponse } from '@/lib/security/api-errors';

const intlProxy = createMiddleware(routing);
const CSRF_EXEMPT_API_PREFIXES = ['/api/webhooks/', '/api/cron/'] as const;
const SECURITY_CONTRACT_VERSION = 'v1';

type ProxyRoutingResult =
  | { type: 'rewrite'; pathname: string }
  | { type: 'not_found' }
  | null;

function getPathLocale(pathname: string): string | null {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  if (!firstSegment) return null;
  return routing.locales.includes(firstSegment as (typeof routing.locales)[number]) ? firstSegment : null;
}

function stripLocalePrefix(pathname: string, locale: string | null): string {
  if (!locale) return pathname;
  if (pathname === `/${locale}`) return '/';
  if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1) || '/';
  return pathname;
}

function getDuplicateLocaleRedirectUrl(request: NextRequest): URL | null {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const [firstSegment, secondSegment] = segments;
  const locales = routing.locales as readonly string[];

  if (!firstSegment || !secondSegment) return null;
  if (!locales.includes(firstSegment) || !locales.includes(secondSegment)) return null;

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = `/${secondSegment}${segments.length > 2 ? `/${segments.slice(2).join('/')}` : ''}`;
  return redirectUrl;
}

function getRequestLocale(request: NextRequest): string {
  const localeFromPath = getPathLocale(request.nextUrl.pathname);
  if (localeFromPath) return localeFromPath;

  const localeCookie = request.cookies.get('NEXT_LOCALE')?.value;
  if (
    localeCookie &&
    routing.locales.includes(localeCookie as (typeof routing.locales)[number])
  ) {
    return localeCookie;
  }

  return routing.defaultLocale;
}

function resolveSubdomainRoute(request: NextRequest): ProxyRoutingResult {
  const host = getRequestHostFromHeaders(request.headers);
  if (!host) return null;

  const locale = getRequestLocale(request);
  const pathLocale = getPathLocale(request.nextUrl.pathname);
  const normalizedPath = stripLocalePrefix(request.nextUrl.pathname, pathLocale);

  if (isDashboardSubdomainHost(host)) {
    if (/^\/buyer(?:\/|$)/.test(normalizedPath)) {
      return { type: 'not_found' };
    }

    if (normalizedPath === '/' || normalizedPath === '/dashboard') {
      return { type: 'rewrite', pathname: `/${locale}/dashboard` };
    }

    // Vendor sub-routes without slug (logged-in user's own dashboard)
    // e.g. dashboard.kode01.com/vendor/products → /{locale}/vendor/products
    const vendorOwnRoutes = /^\/vendor\/(products|orders|analytics|payouts|reviews|licenses|settings|affiliates|bundles|followers|sponsored-blog)(\/|$)/;
    const vendorOwnMatch = normalizedPath.match(vendorOwnRoutes);
    if (vendorOwnMatch) {
      return { type: 'rewrite', pathname: `/${locale}${normalizedPath}` };
    }

    // Vendor slug route (overview page)
    // e.g. dashboard.kode01.com/vendor/my-slug → /{locale}/vendor/my-slug
    const vendorMatch = normalizedPath.match(/^\/vendor\/([^/]+)\/?$/);
    if (vendorMatch) {
      return { type: 'rewrite', pathname: `/${locale}/vendor/${vendorMatch[1]}` };
    }

    // Client sub-routes without slug
    const clientOwnRoutes = /^\/client\/(orders|reviews|settings)(\/|$)/;
    const clientOwnMatch = normalizedPath.match(clientOwnRoutes);
    if (clientOwnMatch) {
      return { type: 'rewrite', pathname: `/${locale}${normalizedPath}` };
    }

    const clientMatch = normalizedPath.match(/^\/client\/([^/]+)\/?$/);
    if (clientMatch) {
      return { type: 'rewrite', pathname: `/${locale}/client/${clientMatch[1]}` };
    }

    // Vendor root without slug (redirect to dashboard entry which resolves the slug)
    if (normalizedPath === '/vendor' || normalizedPath === '/vendor/') {
      return { type: 'rewrite', pathname: `/${locale}/vendor` };
    }

    return null;
  }

  if (isAdminSubdomainHost(host)) {
    if (normalizedPath === '/settings' || normalizedPath.startsWith('/settings/')) {
      const suffix = normalizedPath.slice('/settings'.length);
      return { type: 'rewrite', pathname: `/${locale}/dashboard/settings${suffix}` };
    }

    if (
      normalizedPath === '/dashboard/settings' ||
      normalizedPath.startsWith('/dashboard/settings/')
    ) {
      return { type: 'rewrite', pathname: `/${locale}${normalizedPath}` };
    }

    if (normalizedPath === '/' || normalizedPath === '/admin') {
      return { type: 'rewrite', pathname: `/${locale}/admin` };
    }

    if (/^\/admin(?:\/|$)/.test(normalizedPath)) {
      return { type: 'rewrite', pathname: `/${locale}${normalizedPath}` };
    }

    return {
      type: 'rewrite',
      pathname: `/${locale}/admin${normalizedPath === '/' ? '' : normalizedPath}`,
    };
  }

  return null;
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
}

function isApiRoute(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isAdminMfaProtectedApiRoute(normalizedPath: string, method: string): boolean {
  if (normalizedPath === '/api/admin' || normalizedPath.startsWith('/api/admin/')) {
    return true;
  }

  // Admin-only write endpoint hosted outside /api/admin for legacy compatibility.
  if (normalizedPath === '/api/footer-social-links' && method.toUpperCase() === 'PATCH') {
    return true;
  }

  return false;
}

function isCsrfExemptApiPath(pathname: string): boolean {
  return CSRF_EXEMPT_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAdminMfaBypassPath(normalizedPath: string, isAdminHost: boolean): boolean {
  if (normalizedPath === '/dashboard/settings' || normalizedPath.startsWith('/dashboard/settings/')) {
    return true;
  }

  if (isAdminHost && (normalizedPath === '/settings' || normalizedPath.startsWith('/settings/'))) {
    return true;
  }

  if (normalizedPath === '/api/admin/mfa' || normalizedPath.startsWith('/api/admin/mfa/')) {
    return true;
  }

  if (normalizedPath === '/admin/mfa' || normalizedPath.startsWith('/admin/mfa/')) {
    return true;
  }

  if (isAdminHost && (normalizedPath === '/mfa' || normalizedPath.startsWith('/mfa/'))) {
    return true;
  }

  return false;
}

function getCanonicalHostRedirectUrl(request: NextRequest): URL | null {
  const host = getRequestHostFromHeaders(request.headers);
  if (host !== CANONICAL_WWW_HOST) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.host = CANONICAL_APEX_HOST;
  redirectUrl.protocol = 'https:';
  return redirectUrl;
}

type SessionMfaStatus = {
  hasSession: boolean;
  mfaVerified: boolean;
  isAdmin: boolean;
};

function applyRequestDiagnostics(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-security-contract-version', SECURITY_CONTRACT_VERSION);
  return response;
}

async function getCurrentSessionMfaStatus(request: NextRequest): Promise<SessionMfaStatus> {
  if (!hasSupabaseAuthCookie(request)) {
    return { hasSession: false, mfaVerified: false, isAdmin: false };
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;

  try {
    const env = getSupabasePublicEnv();
    supabaseUrl = env.supabaseUrl;
    supabaseAnonKey = env.supabaseAnonKey;
  } catch {
    return { hasSession: false, mfaVerified: false, isAdmin: false };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No cookie writes needed for this read-only MFA status check.
      },
    },
  });

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return { hasSession: false, mfaVerified: false, isAdmin: false };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);

  if (assuranceError || !assurance) {
    return {
      hasSession: true,
      mfaVerified: false,
      isAdmin: isAdminRole(profile?.role),
    };
  }

  const mfaVerified =
    isAal2(assurance.currentLevel) ||
    hasVerifiedMfaMethod(assurance.currentAuthenticationMethods);

  return {
    hasSession: true,
    mfaVerified,
    isAdmin: isAdminRole(profile?.role),
  };
}

function buildUnauthenticatedRedirectUrl(
  request: NextRequest,
  locale: string,
  normalizedPath: string,
  isAdminHost: boolean,
): URL {
  const redirectUrl = request.nextUrl.clone();
  const normalizedTarget = normalizedPath === '/' && isAdminHost ? '/admin' : normalizedPath;
  const targetWithSearch = `${normalizedTarget}${request.nextUrl.search}`;

  redirectUrl.pathname = `/${locale}`;
  redirectUrl.search = '';
  redirectUrl.searchParams.set('auth', 'required');
  redirectUrl.searchParams.set('next', targetWithSearch);

  return redirectUrl;
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const requestIdHeader = request.headers.get('x-request-id')?.trim();
  const requestId = requestIdHeader && requestIdHeader.length > 0 ? requestIdHeader : crypto.randomUUID();
  const duplicateLocaleRedirectUrl = getDuplicateLocaleRedirectUrl(request);
  if (duplicateLocaleRedirectUrl) {
    return applyRequestDiagnostics(NextResponse.redirect(duplicateLocaleRedirectUrl, 307), requestId);
  }

  const canonicalRootLocaleRedirectUrl = getCanonicalRootLocaleRedirectUrl({
    host: getRequestHostFromHeaders(request.headers),
    method: request.method,
    pathname: request.nextUrl.pathname,
    url: request.nextUrl.toString(),
  });
  if (canonicalRootLocaleRedirectUrl) {
    return applyRequestDiagnostics(NextResponse.redirect(canonicalRootLocaleRedirectUrl, 308), requestId);
  }

  const canonicalRedirectUrl = getCanonicalHostRedirectUrl(request);
  if (canonicalRedirectUrl) {
    return applyRequestDiagnostics(NextResponse.redirect(canonicalRedirectUrl, 308), requestId);
  }

  const requesterIp = getRequestIpAddress(request);
  const userAgent = request.headers.get('user-agent');
  const pathname = request.nextUrl.pathname;
  const isServerActionRequest =
    request.method === 'POST' &&
    request.headers.has('next-action');
  const pathLocale = getPathLocale(pathname);
  const normalizedPath = stripLocalePrefix(pathname, pathLocale);
  const requestLocale = pathLocale ?? getRequestLocale(request);
  const host = getRequestHostFromHeaders(request.headers);
  const isAdminHost = isAdminSubdomainHost(host);
  const isProtectedDashboardPageRoute =
    !normalizedPath.startsWith('/api') &&
    (
      isAdminHost ||
      /^\/admin(?:\/|$)/.test(normalizedPath) ||
      /^\/vendor(?:\/|$)/.test(normalizedPath)
    );
  const blockedByCookie = request.cookies.get(BOT_FLAG_COOKIE_NAME)?.value === '1';
  const blockedByUa = isBlockedBotUserAgent(userAgent);

  if (blockedByCookie || blockedByUa) {
    const reason = blockedByCookie ? 'cookie_flag' : 'blocked_ua';
    event.waitUntil(
      Promise.all([
        logBotActivityDirect({
          source: 'proxy_middleware',
          reason,
          path: pathname,
          ipAddress: requesterIp,
          userAgent,
          blocked: true,
          details: {
            blockedByCookie,
            blockedByUa,
          },
        }),
        logSecurityEvent({
          eventType: 'security.bot_blocked',
          ipAddress: requesterIp,
          userAgent,
          path: pathname,
          metadata: {
            reason,
          },
        }),
      ]),
    );
  }

  const botBlockedResponse = applyProxyBotProtection(request);
  if (botBlockedResponse) {
    return applyRequestDiagnostics(botBlockedResponse, requestId);
  }

  const rateLimitedResponse = await applyProxyRateLimit(request);
  if (rateLimitedResponse) {
    if (rateLimitedResponse.status === 429) {
      event.waitUntil(
        logSecurityEvent({
          eventType: 'security.rate_limit_exceeded',
          ipAddress: requesterIp,
          userAgent,
          path: pathname,
          metadata: {
            action: rateLimitedResponse.headers.get('X-RateLimit-Action'),
            limit: rateLimitedResponse.headers.get('X-RateLimit-Limit'),
            remaining: rateLimitedResponse.headers.get('X-RateLimit-Remaining'),
            resetAt: rateLimitedResponse.headers.get('X-RateLimit-Reset'),
            degraded: rateLimitedResponse.headers.get('X-RateLimit-Degraded') === '1',
          },
        }),
      );
    }
    return applyRequestDiagnostics(rateLimitedResponse, requestId);
  }

  const isAdminApiRoute = isAdminMfaProtectedApiRoute(normalizedPath, request.method);
  const hasSessionCookie = hasSupabaseAuthCookie(request);
  const isMutatingRequest = isMutatingHttpMethod(request.method);
  const shouldEnforceCsrfForServerActions = isServerActionRequest;
  const shouldEnforceCsrfForApiRoutes =
    isApiRoute(normalizedPath) && !isCsrfExemptApiPath(normalizedPath);
  const shouldEnforceCsrf =
    hasSessionCookie &&
    isMutatingRequest &&
    (shouldEnforceCsrfForServerActions || shouldEnforceCsrfForApiRoutes);

  const trustedCsrfOrigins = shouldEnforceCsrf
    ? getTrustedSubdomainOrigins(host, request.nextUrl.origin)
    : [];

  if (
    shouldEnforceCsrf &&
    !hasTrustedCsrfSource(request.headers, request.nextUrl.origin, trustedCsrfOrigins)
  ) {
    event.waitUntil(
      logSecurityEvent({
        eventType: 'security.csrf_blocked',
        ipAddress: requesterIp,
        userAgent,
        path: pathname,
        metadata: {
          method: request.method,
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
          sec_fetch_site: request.headers.get('sec-fetch-site'),
          trusted_origin_count: trustedCsrfOrigins.length,
        },
      }),
    );
    if (isApiRoute(normalizedPath)) {
      return applyRequestDiagnostics(
        securityErrorResponse({
          status: 403,
          code: 'CSRF_BLOCKED',
          message: 'CSRF validation failed.',
          requestId,
        }),
        requestId,
      );
    }
    return applyRequestDiagnostics(new NextResponse('Forbidden', { status: 403 }), requestId);
  }

  let sessionMfaStatus: SessionMfaStatus | null = null;

  if (isProtectedDashboardPageRoute) {
    sessionMfaStatus = await getCurrentSessionMfaStatus(request);
    if (!sessionMfaStatus.hasSession) {
      const redirectUrl = buildUnauthenticatedRedirectUrl(
        request,
        requestLocale,
        normalizedPath,
        isAdminHost,
      );
      return applyRequestDiagnostics(NextResponse.redirect(redirectUrl), requestId);
    }
  }

  const isAdminPageRoute =
    !normalizedPath.startsWith('/api') &&
    (isAdminHost || /^\/admin(?:\/|$)/.test(normalizedPath));
  const shouldEnforceAdminMfa =
    (isAdminApiRoute || isAdminPageRoute) &&
    !isAdminMfaBypassPath(normalizedPath, isAdminHost);

  if (shouldEnforceAdminMfa) {
    const mfaStatus = sessionMfaStatus ?? (await getCurrentSessionMfaStatus(request));

    if (mfaStatus.hasSession && mfaStatus.isAdmin && !mfaStatus.mfaVerified) {
      event.waitUntil(
        logSecurityEvent({
          eventType: 'security.mfa_blocked',
          ipAddress: requesterIp,
          userAgent,
          path: pathname,
          metadata: {
            method: request.method,
            normalized_path: normalizedPath,
            route_type: isAdminApiRoute ? 'api' : 'page',
            admin_host: isAdminHost,
          },
        }),
      );

      if (isAdminApiRoute) {
        return applyRequestDiagnostics(
          securityErrorResponse({
            status: 403,
            code: 'MFA_REQUIRED',
            message: 'Admin MFA verification is required for this endpoint.',
            requestId,
          }),
          requestId,
        );
      }

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = isAdminHost ? '/mfa' : `/${requestLocale}/admin/mfa`;
      redirectUrl.search = '';
      redirectUrl.searchParams.set('from', normalizedPath === '/' ? '/admin' : normalizedPath);
      return applyRequestDiagnostics(NextResponse.redirect(redirectUrl), requestId);
    }
  }

  if (isServerActionRequest) {
    return applyRequestDiagnostics(NextResponse.next(), requestId);
  }

  if (request.nextUrl.pathname.startsWith('/api')) {
    return applyRequestDiagnostics(NextResponse.next(), requestId);
  }

  const subdomainRoute = resolveSubdomainRoute(request);
  if (subdomainRoute?.type === 'not_found') {
    return applyRequestDiagnostics(new NextResponse('Not Found', { status: 404 }), requestId);
  }

  if (subdomainRoute?.type === 'rewrite') {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = subdomainRoute.pathname;
    const response = NextResponse.rewrite(rewriteUrl);
    const updated = await updateSession(request, response);
    return applyRequestDiagnostics(updated, requestId);
  }

  const response = intlProxy(request);
  const updated = await updateSession(request, response);
  return applyRequestDiagnostics(updated, requestId);
}

export default middleware;

export const config = {
  matcher: ['/((?!trpc|_next|_vercel|.*\\..*).*)'],
};

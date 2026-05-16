import { NextResponse } from 'next/server';
import { toRateLimitExceededResponse } from './rate-limit-http';
import { checkRateLimit } from './rate-limiter';
import { buildRateLimitKey, getRequestPathname, getRequesterIp } from './rate-limit-request';
import { ENDPOINT_RATE_LIMIT_ACTIONS, type RateLimitAction } from './rate-limit-schemas';
import { isIpWhitelisted } from './whitelist';

const DEFAULT_WEBHOOK_EXEMPTIONS = ['/api/invoices/webhook', '/api/services/webhook', '/api/webhooks/stripe'];
const GLOBAL_PAGE_DASHBOARD_EXEMPT_PREFIXES = ['/admin', '/dashboard', '/buyer', '/vendor'];
const GLOBAL_API_EXEMPT_PATHS = new Set(['/api/csp-report']);
const WEBHOOK_EXEMPTION_PATH_PATTERN = /^\/api\/[a-z0-9/_-]{1,120}$/i;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return defaultValue;
}

function getWebhookExemptionsFromEnv(): string[] {
  const raw = process.env.RATE_LIMIT_WEBHOOK_EXEMPTIONS;
  if (!raw) return DEFAULT_WEBHOOK_EXEMPTIONS;
  const parsed = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => {
      if (!value) return false;
      if (!WEBHOOK_EXEMPTION_PATH_PATTERN.test(value)) return false;
      // Prevent broad exemptions such as "/api" that could disable most API limits.
      return value.includes('webhook');
    });
  return parsed.length > 0 ? parsed : DEFAULT_WEBHOOK_EXEMPTIONS;
}

function isWebhookExempt(pathname: string): boolean {
  const normalizedPath = pathname.toLowerCase();
  const exemptions = getWebhookExemptionsFromEnv();
  return exemptions.some((path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`));
}

function getEndpointAction(pathname: string): RateLimitAction | null {
  for (const [prefix, action] of Object.entries(ENDPOINT_RATE_LIMIT_ACTIONS)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return action;
    }
  }
  return null;
}

function isFrameworkPrefetchRequest(request: Request): boolean {
  const purpose = request.headers.get('purpose')?.toLowerCase();
  const secPurpose = request.headers.get('sec-purpose')?.toLowerCase();

  if (purpose === 'prefetch' || secPurpose === 'prefetch') return true;
  if (request.headers.has('next-router-prefetch')) return true;
  if (request.headers.get('x-middleware-prefetch') === '1') return true;

  return false;
}

function stripLocalePrefix(pathname: string): string {
  const normalized = pathname.replace(/^\/(en|fr)(?=\/|$)/, '');
  return normalized || '/';
}

function isDashboardLikePath(pathname: string): boolean {
  const normalizedPath = stripLocalePrefix(pathname);
  return GLOBAL_PAGE_DASHBOARD_EXEMPT_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}

function shouldSkipGlobalPageRateLimit(request: Request, pathname: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const method = request.method.toUpperCase();
  if (method === 'HEAD' || method === 'OPTIONS') return true;
  if (isFrameworkPrefetchRequest(request)) return true;
  if (isDashboardLikePath(pathname)) return true;
  return false;
}

function shouldSkipGlobalApiRateLimit(requesterIp: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  // Avoid shared "unknown" bucket causing false positives for real users.
  if (requesterIp === 'unknown') return true;
  return false;
}

export async function applyProxyRateLimit(request: Request & { nextUrl?: URL }): Promise<NextResponse | null> {
  const pathname = getRequestPathname(request);
  const requesterIp = getRequesterIp(request);
  const isApiRequest = pathname.startsWith('/api');

  // Skip security checks for whitelisted IPs (e.g. security audits)
  if (isIpWhitelisted(requesterIp)) {
    return null;
  }

  if (isWebhookExempt(pathname)) {
    return null;
  }

  if (!isApiRequest) {
    if (!shouldSkipGlobalPageRateLimit(request, pathname)) {
      // Avoid shared "unknown" bucket causing false positives for real users.
      if (requesterIp === 'unknown') return null;

      const result = await checkRateLimit({
        action: 'GLOBAL_PAGE',
        key: buildRateLimitKey(['rate-limit', 'global-page', requesterIp]),
      });
      if (!result.allowed) return toRateLimitExceededResponse(result);
    }
    return null;
  }

  const globalApiEnabled = parseBooleanEnv(
    process.env.RATE_LIMIT_GLOBAL_API_ENABLED,
    process.env.NODE_ENV === 'production',
  );
  if (
    globalApiEnabled &&
    !GLOBAL_API_EXEMPT_PATHS.has(pathname.toLowerCase()) &&
    !shouldSkipGlobalApiRateLimit(requesterIp)
  ) {
    const globalApiResult = await checkRateLimit({
      action: 'GLOBAL_API',
      key: buildRateLimitKey(['rate-limit', 'global-api', requesterIp]),
    });
    if (!globalApiResult.allowed) return toRateLimitExceededResponse(globalApiResult);
  }

  const endpointAction = getEndpointAction(pathname);
  if (!endpointAction) return null;

  const endpointResult = await checkRateLimit({
    action: endpointAction,
    key: buildRateLimitKey(['rate-limit', endpointAction, requesterIp]),
  });
  if (!endpointResult.allowed) return toRateLimitExceededResponse(endpointResult);

  return null;
}

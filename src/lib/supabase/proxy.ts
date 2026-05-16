import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabasePublicEnv, isMissingSupabasePublicEnvError } from './env'
import { getSupabaseSessionCookiePolicy } from './cookie-options'
import { getTrustedClientIpFromHeaders } from '@/lib/security/request-ip'
import { logSecurityEvent } from '@/lib/security/security-log'

const SESSION_EXPIRED_LOG_THROTTLE_COOKIE = 'kode01_auth_session_expired_log'
const LEGACY_SESSION_EXPIRED_LOG_THROTTLE_COOKIE = 'thiki_auth_session_expired_log'
const SESSION_EXPIRED_LOG_THROTTLE_SECONDS = 60 * 5
let hasLoggedMissingSupabaseProxyEnv = false

function isFrameworkPrefetchRequest(request: NextRequest): boolean {
    const purpose = request.headers.get('purpose')?.toLowerCase()
    const secPurpose = request.headers.get('sec-purpose')?.toLowerCase()

    if (purpose === 'prefetch' || secPurpose === 'prefetch') return true
    if (request.headers.has('next-router-prefetch')) return true
    if (request.headers.get('x-middleware-prefetch') === '1') return true

    return false
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
    return request.cookies
        .getAll()
        .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
}

function hasSessionExpiredLogThrottleCookie(request: NextRequest): boolean {
    return (
        request.cookies.get(SESSION_EXPIRED_LOG_THROTTLE_COOKIE)?.value === '1'
        || request.cookies.get(LEGACY_SESSION_EXPIRED_LOG_THROTTLE_COOKIE)?.value === '1'
    )
}

function setSessionExpiredLogThrottleCookie(response: NextResponse, sharedCookieDomain?: string) {
    response.cookies.set({
        name: SESSION_EXPIRED_LOG_THROTTLE_COOKIE,
        value: '1',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_EXPIRED_LOG_THROTTLE_SECONDS,
        ...(sharedCookieDomain ? { domain: sharedCookieDomain } : {}),
    })

    response.cookies.set({
        name: LEGACY_SESSION_EXPIRED_LOG_THROTTLE_COOKIE,
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    })

    if (sharedCookieDomain) {
        response.cookies.set({
            name: LEGACY_SESSION_EXPIRED_LOG_THROTTLE_COOKIE,
            value: '',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 0,
            domain: sharedCookieDomain,
        })
    }
}

export async function updateSession(request: NextRequest, response: NextResponse) {
    let supabaseUrl: string;
    let supabaseAnonKey: string;

    try {
        const env = getSupabasePublicEnv();
        supabaseUrl = env.supabaseUrl;
        supabaseAnonKey = env.supabaseAnonKey;
    } catch (error) {
        if (isMissingSupabasePublicEnvError(error)) {
            if (!hasLoggedMissingSupabaseProxyEnv) {
                hasLoggedMissingSupabaseProxyEnv = true;
                console.error(
                    'Supabase public environment is missing; skipping proxy session refresh for public routing.',
                );
            }
            return response;
        }
        throw error;
    }

    // Skip expensive auth revalidation for framework prefetches and anonymous visitors.
    if (isFrameworkPrefetchRequest(request) || !hasSupabaseAuthCookie(request)) {
        return response;
    }

    const supabaseResponse = response;
    const sessionCookiePolicy = getSupabaseSessionCookiePolicy(
        request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    );

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
            cookieOptions: {
                ...sessionCookiePolicy,
            },
        }
    )

    // Refresh session cookies on every matched request.
    const {
        data: { user },
        error: getUserError,
    } = await supabase.auth.getUser()

    if (!user && !hasSessionExpiredLogThrottleCookie(request)) {
        await logSecurityEvent({
            eventType: 'auth.session.expired',
            path: request.nextUrl.pathname,
            ipAddress: getTrustedClientIpFromHeaders(request.headers),
            userAgent: request.headers.get('user-agent'),
            metadata: {
                reason: getUserError ? 'supabase_get_user_error' : 'missing_user_after_auth_cookie',
                error_message: getUserError?.message ?? null,
            },
        })
        setSessionExpiredLogThrottleCookie(supabaseResponse, sessionCookiePolicy.domain)
    }

    return supabaseResponse
}

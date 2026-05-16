import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';

type SupportedLocale = (typeof routing.locales)[number];

function getLocaleFromPath(pathname: string): SupportedLocale {
    const [firstSegment] = pathname.split('/').filter(Boolean);
    const matchedLocale = routing.locales.find((locale) => locale === firstSegment);
    return (matchedLocale ?? routing.defaultLocale) as SupportedLocale;
}

function splitPath(rawPath: string): { pathname: string; suffix: string } {
    const match = rawPath.match(/^([^?#]*)(.*)$/);
    return {
        pathname: match?.[1] ?? rawPath,
        suffix: match?.[2] ?? '',
    };
}

function localizePath(path: string, locale: SupportedLocale): string {
    const { pathname, suffix } = splitPath(path);
    const hasLocalePrefix = routing.locales.some(
        (supportedLocale) =>
            pathname === `/${supportedLocale}` || pathname.startsWith(`/${supportedLocale}/`),
    );

    if (hasLocalePrefix) return `${pathname}${suffix}`;
    if (pathname === '/') return `/${locale}${suffix}`;
    return `/${locale}${pathname}${suffix}`;
}

function getSafeNextPath(rawNext: string | null, locale: SupportedLocale): string | null {
    if (!rawNext) return null;
    if (!rawNext.startsWith('/')) return null;
    if (rawNext.startsWith('//')) return null;
    return localizePath(rawNext, locale);
}

function getConfirmationResultPath(
    locale: SupportedLocale,
    status: 'success' | 'error',
    reason?: string,
): string {
    const params = new URLSearchParams({ status });
    if (reason) {
        params.set('reason', reason);
    }

    return `/${locale}/auth/confirmed?${params.toString()}`;
}

function getPasswordResetPath(locale: SupportedLocale, reason?: string): string {
    const params = new URLSearchParams();
    if (reason) {
        params.set('status', 'error');
        params.set('reason', reason);
    }

    const suffix = params.toString();
    return `/${locale}/auth/reset-password${suffix ? `?${suffix}` : ''}`;
}

function isPasswordResetPath(path: string | null): boolean {
    return Boolean(path && /\/auth\/reset-password(?:[?#]|$)/.test(path));
}

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const locale = getLocaleFromPath(request.nextUrl.pathname);
    const code = requestUrl.searchParams.get('code');
    const tokenHash = requestUrl.searchParams.get('token_hash');
    const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
    const nextPath = getSafeNextPath(requestUrl.searchParams.get('next'), locale);
    const isPasswordRecovery = type === 'recovery' || isPasswordResetPath(nextPath);
    const successPath = nextPath ?? (isPasswordRecovery
        ? getPasswordResetPath(locale)
        : getConfirmationResultPath(locale, 'success'));

    const supabase = await createClient();
    let errorMessage: string | null = null;

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        errorMessage = error?.message ?? null;
    } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
        });
        errorMessage = error?.message ?? null;
    } else {
        errorMessage = 'Missing auth confirmation token.';
    }

    if (!errorMessage) {
        return NextResponse.redirect(new URL(successPath, requestUrl.origin));
    }

    console.error('Auth email confirmation failed:', errorMessage);
    const fallbackPath = isPasswordRecovery
        ? getPasswordResetPath(locale, 'verification_failed')
        : getConfirmationResultPath(locale, 'error', 'verification_failed');
    return NextResponse.redirect(new URL(fallbackPath, requestUrl.origin));
}

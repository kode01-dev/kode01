import { normalizeHostHeader } from '@/lib/http/request-host';

const SHARED_AUTH_ROOT_DOMAIN = 'kode01.com';

export type SupabaseSessionCookiePolicy = {
  domain?: string;
  path: string;
  sameSite: 'lax' | 'strict';
  secure: boolean;
  httpOnly: boolean;
  maxAge: number;
};

export function getSharedSupabaseCookieDomain(rawHost: string | null | undefined): string | undefined {
  const host = normalizeHostHeader(rawHost);
  if (!host) return undefined;

  if (host === SHARED_AUTH_ROOT_DOMAIN || host.endsWith(`.${SHARED_AUTH_ROOT_DOMAIN}`)) {
    return `.${SHARED_AUTH_ROOT_DOMAIN}`;
  }

  return undefined;
}

export function getSupabaseSessionCookiePolicy(rawHost: string | null | undefined): SupabaseSessionCookiePolicy {
  const domain = getSharedSupabaseCookieDomain(rawHost);
  const maxAgeSeconds = 60 * 60 * 24;

  return {
    ...(domain ? { domain } : {}),
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: maxAgeSeconds,
  };
}


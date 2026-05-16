import { routing } from '@/i18n/routing';
import { normalizeHostHeader } from '@/lib/http/request-host';

export const CANONICAL_APEX_HOST = 'kode01.com';
export const CANONICAL_WWW_HOST = 'www.kode01.com';

type CanonicalRootLocaleRedirectInput = {
  host: string | null | undefined;
  method: string;
  pathname: string;
  url: string;
};

export function getCanonicalRootLocaleRedirectUrl({
  host,
  method,
  pathname,
  url,
}: CanonicalRootLocaleRedirectInput): URL | null {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return null;
  }

  if (pathname !== '/') {
    return null;
  }

  const normalizedHost = normalizeHostHeader(host);
  if (normalizedHost !== CANONICAL_APEX_HOST && normalizedHost !== CANONICAL_WWW_HOST) {
    return null;
  }

  const redirectUrl = new URL(url);
  redirectUrl.protocol = 'https:';
  redirectUrl.host = CANONICAL_APEX_HOST;
  redirectUrl.pathname = `/${routing.defaultLocale}`;
  return redirectUrl;
}

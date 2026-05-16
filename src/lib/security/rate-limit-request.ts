import { getTrustedClientIpFromHeaders } from './request-ip';

type HeaderReader = {
  headers: Headers;
  nextUrl?: URL;
};

export function getRequestPathname(request: Request | HeaderReader): string {
  if ('nextUrl' in request && request.nextUrl) {
    return request.nextUrl.pathname;
  }
  try {
    return new URL((request as Request).url).pathname;
  } catch {
    return '/';
  }
}

export function getRequesterIp(request: Request | HeaderReader): string {
  return getTrustedClientIpFromHeaders(request.headers) ?? 'unknown';
}

export function sanitizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:@/-]/g, '_').slice(0, 160);
}

export function buildRateLimitKey(parts: string[]): string {
  return parts.map(sanitizeKeyPart).join(':');
}

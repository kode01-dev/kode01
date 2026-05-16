import 'server-only';

import { getAppBaseUrl } from '@/lib/env/server';

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function normalizeForwardedProtocol(value: string | null): 'http' | 'https' | null {
  const protocol = firstHeaderValue(value)?.toLowerCase().replace(/:$/, '');
  return protocol === 'http' || protocol === 'https' ? protocol : null;
}

function normalizeForwardedHost(value: string | null): string | null {
  const host = firstHeaderValue(value);
  if (!host || /[\s/\\]/.test(host)) return null;
  return host.toLowerCase();
}

export function getRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const host = normalizeForwardedHost(
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
  );
  const protocol = normalizeForwardedProtocol(request.headers.get('x-forwarded-proto')) ?? requestUrl.protocol.replace(/:$/, '');

  if (host && (protocol === 'http' || protocol === 'https')) {
    try {
      return new URL(`${protocol}://${host}`).origin;
    } catch {
      // Fall through to request URL and configured app base URL.
    }
  }

  if (requestUrl.origin && requestUrl.origin !== 'null') {
    return requestUrl.origin;
  }

  return getAppBaseUrl();
}

import 'server-only';

import { getAppBaseUrl } from '@/lib/env/server';

const PUBLIC_STORAGE_PATH_PREFIX = '/storage/v1/object/public/';
const LOOPBACK_STORAGE_URL_PATTERN =
  /\bhttps?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|(?:[a-z0-9-]+\.)+local)(?::\d{1,5})?(\/storage\/v1\/object\/public\/[^\s)"'>]+)/gi;

function isLoopbackLikeHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.local')
  );
}

function getCanonicalAppOrigin(): string | null {
  try {
    return new URL(getAppBaseUrl()).origin;
  } catch {
    return null;
  }
}

export function normalizePublicStorageUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const canonicalOrigin = getCanonicalAppOrigin();
  if (!canonicalOrigin) return value;

  try {
    const parsed = new URL(value);
    if (!parsed.pathname.startsWith(PUBLIC_STORAGE_PATH_PREFIX)) {
      return value;
    }

    if (!isLoopbackLikeHostname(parsed.hostname)) {
      return value;
    }

    return `${canonicalOrigin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

export function normalizeLoopbackStorageUrlsInText(value: string): string {
  if (!value) return value;

  const canonicalOrigin = getCanonicalAppOrigin();
  if (!canonicalOrigin) return value;

  return value.replace(LOOPBACK_STORAGE_URL_PATTERN, (_match, path: string) => {
    return `${canonicalOrigin}${path}`;
  });
}

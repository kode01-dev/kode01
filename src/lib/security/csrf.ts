const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TRUSTED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

function toOrigin(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;
  try {
    return new URL(rawValue).origin;
  } catch {
    return null;
  }
}

export function isMutatingHttpMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function buildTrustedOriginSet(
  expectedOrigin: string,
  allowedOrigins: readonly string[],
): Set<string> {
  const trustedOrigins = new Set<string>();
  const normalizedExpectedOrigin = toOrigin(expectedOrigin);
  if (normalizedExpectedOrigin) {
    trustedOrigins.add(normalizedExpectedOrigin);
  }

  for (const candidate of allowedOrigins) {
    const normalizedCandidate = toOrigin(candidate);
    if (normalizedCandidate) {
      trustedOrigins.add(normalizedCandidate);
    }
  }

  return trustedOrigins;
}

export function hasTrustedCsrfSource(
  headers: Pick<Headers, 'get' | 'has'>,
  expectedOrigin: string,
  allowedOrigins: readonly string[] = [],
): boolean {
  const trustedOrigins = buildTrustedOriginSet(expectedOrigin, allowedOrigins);

  if (headers.has('origin')) {
    const origin = toOrigin(headers.get('origin'));
    return Boolean(origin && trustedOrigins.has(origin));
  }

  if (headers.has('referer')) {
    const refererOrigin = toOrigin(headers.get('referer'));
    return Boolean(refererOrigin && trustedOrigins.has(refererOrigin));
  }

  const secFetchSite = headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (!secFetchSite) {
    return false;
  }

  return TRUSTED_FETCH_SITES.has(secFetchSite);
}

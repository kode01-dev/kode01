export function normalizeHostHeader(rawHost: string | null | undefined): string | null {
  if (!rawHost) return null;

  const host = rawHost.split(',')[0]?.trim().toLowerCase();
  if (!host) return null;

  if (host.startsWith('[')) {
    const closingBracketIndex = host.indexOf(']');
    return closingBracketIndex >= 0 ? host.slice(0, closingBracketIndex + 1) : host;
  }

  return host.replace(/:\d+$/, '');
}

export function getRequestHostFromHeaders(headers: Pick<Headers, 'get'>): string | null {
  return normalizeHostHeader(headers.get('x-forwarded-host') ?? headers.get('host'));
}


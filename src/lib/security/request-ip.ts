type HeaderReader = {
  get(name: string): string | null;
};

const TRUSTED_PLATFORM_IP_HEADERS = [
  // Platform-provided headers should be trusted first.
  'x-vercel-forwarded-for',
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
] as const;

const SPOOFABLE_FALLBACK_IP_HEADERS = [
  'x-forwarded-for',
  'x-client-ip',
] as const;

function stripQuotes(value: string): string {
  return value.replace(/^"+|"+$/g, '');
}

function normalizeIpCandidate(rawValue: string): string {
  const trimmed = stripQuotes(rawValue.trim());
  if (!trimmed) return '';

  if (trimmed.startsWith('[')) {
    const closingBracketIndex = trimmed.indexOf(']');
    if (closingBracketIndex > 1) {
      return trimmed.slice(1, closingBracketIndex);
    }
  }

  const ipv4WithPortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPortMatch) {
    return ipv4WithPortMatch[1];
  }

  return trimmed;
}

function isValidIPv4(value: string): boolean {
  const octets = value.split('.');
  if (octets.length !== 4) return false;

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    if (octet.length > 1 && octet.startsWith('0')) return false;

    const parsed = Number.parseInt(octet, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
  });
}

function isValidIPv6(value: string): boolean {
  const candidate = value.toLowerCase();
  if (!candidate.includes(':')) return false;
  if (candidate.includes('%')) return false;

  try {
    // URL parsing validates IPv6 literals, including compressed and mapped forms.
    void new URL(`http://[${candidate}]/`);
    return true;
  } catch {
    return false;
  }
}

function isValidIpAddress(value: string): boolean {
  return isValidIPv4(value) || isValidIPv6(value);
}

function extractFirstValidIp(headerValue: string | null): string | null {
  if (!headerValue) return null;

  for (const segment of headerValue.split(',')) {
    const candidate = normalizeIpCandidate(segment);
    if (!candidate) continue;
    if (isValidIpAddress(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractLastValidIp(headerValue: string | null): string | null {
  if (!headerValue) return null;

  const segments = headerValue.split(',');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment) continue;
    const candidate = normalizeIpCandidate(segment);
    if (!candidate) continue;
    if (isValidIpAddress(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getTrustedClientIpFromHeaders(headers: HeaderReader): string | null {
  for (const headerName of TRUSTED_PLATFORM_IP_HEADERS) {
    const ip = extractFirstValidIp(headers.get(headerName));
    if (ip) return ip;
  }

  // In production, do not trust generic forwarding headers that can be spoofed
  // by end-users and would weaken IP-based rate limiting and allowlist checks.
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  for (const headerName of SPOOFABLE_FALLBACK_IP_HEADERS) {
    const ip = extractLastValidIp(headers.get(headerName));
    if (ip) return ip;
  }

  return null;
}

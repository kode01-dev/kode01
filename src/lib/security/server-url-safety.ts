import dns from 'node:dns/promises';
import { isIP } from 'node:net';

type ResolveHostname = (hostname: string) => Promise<string[]>;

export type ServerFetchUrlValidationFailure =
  | 'invalid_url'
  | 'invalid_protocol'
  | 'contains_credentials'
  | 'blocked_hostname'
  | 'blocked_ip_literal'
  | 'hostname_resolution_failed'
  | 'hostname_resolution_empty'
  | 'blocked_resolved_ip';

export type ValidateServerFetchUrlOptions = {
  allowDevelopmentLocalHttp?: boolean;
  resolveHostname?: ResolveHostname;
};

export type SafeFetchOptions = ValidateServerFetchUrlOptions & {
  dependency: string;
  timeoutMs: number;
  userAgent?: string;
  maxRedirects?: number;
};

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'host.docker.internal',
  'metadata.google.internal',
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
] as const;

function isDevelopmentLocalHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local');
}

function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return true;
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  return false;
}

function isBlockedIpv4Address(address: string): boolean {
  const parts = address.split('.');
  if (parts.length !== 4) return true;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) return true;

  const [a, b, c] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && b >= 18 && b <= 19) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function extractIpv4FromMappedIpv6(address: string): string | null {
  const marker = '::ffff:';
  const lower = address.toLowerCase();
  const markerIndex = lower.lastIndexOf(marker);
  if (markerIndex === -1) return null;
  const possibleIpv4 = address.slice(markerIndex + marker.length);
  return isIP(possibleIpv4) === 4 ? possibleIpv4 : null;
}

function isBlockedIpv6Address(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return true;

  const mappedIpv4 = extractIpv4FromMappedIpv6(normalized);
  if (mappedIpv4) return isBlockedIpv4Address(mappedIpv4);

  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (
    normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
  ) {
    return true;
  }
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('2001:db8')) return true;
  return false;
}

function isBlockedIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4Address(address);
  if (version === 6) return isBlockedIpv6Address(address);
  return true;
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function validateServerFetchUrl(
  rawUrl: string,
  options: ValidateServerFetchUrlOptions = {},
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('blocked_url:invalid_url');
  }

  const hostname = parsed.hostname.trim().toLowerCase().replace(/\.+$/, '');
  const allowDevelopmentLocalHttp =
    options.allowDevelopmentLocalHttp === true
    && process.env.NODE_ENV !== 'production'
    && parsed.protocol === 'http:'
    && isDevelopmentLocalHost(hostname);

  if (parsed.protocol !== 'https:' && !allowDevelopmentLocalHttp) {
    throw new Error('blocked_url:invalid_protocol');
  }

  if (parsed.username || parsed.password) {
    throw new Error('blocked_url:contains_credentials');
  }

  if (isBlockedHostname(hostname) && !allowDevelopmentLocalHttp) {
    throw new Error('blocked_url:blocked_hostname');
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedIpAddress(hostname) && !allowDevelopmentLocalHttp) {
      throw new Error('blocked_url:blocked_ip_literal');
    }
    return parsed;
  }

  let resolvedAddresses: string[];
  try {
    resolvedAddresses = await (options.resolveHostname ?? defaultResolveHostname)(hostname);
  } catch {
    throw new Error('blocked_url:hostname_resolution_failed');
  }

  if (resolvedAddresses.length === 0) {
    throw new Error('blocked_url:hostname_resolution_empty');
  }

  const blockedAddress = resolvedAddresses.find((address) => isBlockedIpAddress(address));
  if (blockedAddress) {
    throw new Error(`blocked_url:blocked_resolved_ip:${blockedAddress}`);
  }

  return parsed;
}

export async function fetchWithServerSideUrlSafety(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<{ response: Response; finalUrl: URL }> {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const safeUrl = await validateServerFetchUrl(currentUrl, options);
    const response = await fetch(safeUrl, {
      headers: options.userAgent ? { 'User-Agent': options.userAgent } : undefined,
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: 'manual',
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: safeUrl };
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`Egress blocked for ${options.dependency}: redirect missing location`);
    }

    if (redirectCount === maxRedirects) {
      throw new Error(`Egress blocked for ${options.dependency}: too many redirects`);
    }

    currentUrl = new URL(location, safeUrl).toString();
  }

  throw new Error(`Egress blocked for ${options.dependency}: too many redirects`);
}

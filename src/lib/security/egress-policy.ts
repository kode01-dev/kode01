import { isIP } from 'node:net';
import { getChinaSovereigntyBlockReasonForHostname } from '@/lib/security/data-sovereignty';

type EgressPolicyOptions = {
  dependency: string;
  extraAllowedHosts?: string[];
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

const DEFAULT_ALLOWED_HOST_PATTERNS = [
  'api.stripe.com',
  'api.brevo.com',
  'api.sendfox.com',
  'api.github.com',
  'huggingface.co',
  'api.firecrawl.dev',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
] as const;

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return defaultValue;
}

function normalizeHostPattern(rawValue: string): string | null {
  const trimmed = rawValue.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === '*') return trimmed;

  let candidate = trimmed;
  if (candidate.includes('://')) {
    try {
      candidate = new URL(candidate).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  const normalized = candidate.replace(/\.+$/, '');
  if (!normalized) return null;
  return normalized;
}

function getHostFromUrlInput(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  return parsed.hostname.trim().toLowerCase().replace(/\.+$/, '');
}

function getEnvUrlHost(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  try {
    return getHostFromUrlInput(rawValue);
  } catch {
    return null;
  }
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
  const lower = address.toLowerCase();
  const marker = '::ffff:';
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

function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return true;
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (isIP(hostname) !== 0) return isBlockedIpAddress(hostname);
  return false;
}

function isDevelopmentLocalHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return true;
  }

  return false;
}

function hostMatchesPattern(hostname: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
}

function buildAllowedHostPatterns(extraAllowedHosts: string[] = []): string[] {
  const env = process.env;
  const patterns = new Set<string>();

  for (const value of DEFAULT_ALLOWED_HOST_PATTERNS) {
    patterns.add(value);
  }

  const envUrlHosts = [
    getEnvUrlHost(env.NEXT_PUBLIC_SUPABASE_URL),
    getEnvUrlHost(env.SUPABASE_FUNCTIONS_URL),
    getEnvUrlHost(env.APP_BASE_URL),
    getEnvUrlHost(env.NEXT_PUBLIC_APP_URL),
    getEnvUrlHost(env.NOTIF_PROVIDER_URL),
    getEnvUrlHost(env.SENDFOX_API_BASE_URL),
    getEnvUrlHost(env.MODAL_AGENT_API_URL),
  ];
  for (const host of envUrlHosts) {
    if (host) patterns.add(host);
  }

  const explicitAllowlist = env.SERVER_EGRESS_ALLOWLIST
    ?.split(',')
    .map((entry) => normalizeHostPattern(entry))
    .filter((entry): entry is string => Boolean(entry)) ?? [];
  for (const pattern of explicitAllowlist) {
    patterns.add(pattern);
  }

  for (const host of extraAllowedHosts) {
    const normalized = normalizeHostPattern(host);
    if (normalized) patterns.add(normalized);
  }

  if (env.NODE_ENV !== 'production') {
    patterns.add('localhost');
    patterns.add('127.0.0.1');
    patterns.add('::1');
  }

  return [...patterns];
}

function shouldEnforceEgressPolicy(): boolean {
  return parseBooleanEnv(process.env.SERVER_EGRESS_ENFORCE, process.env.NODE_ENV === 'production');
}

export function assertServerEgressAllowed(rawUrl: string, options: EgressPolicyOptions): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Egress blocked for ${options.dependency}: invalid URL "${rawUrl}"`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `Egress blocked for ${options.dependency}: unsupported protocol "${parsed.protocol}"`,
    );
  }

  const hostname = getHostFromUrlInput(parsed.toString());
  const isAllowedDevelopmentHost =
    process.env.NODE_ENV !== 'production' && isDevelopmentLocalHost(hostname);
  if (isBlockedHostname(hostname) && !isAllowedDevelopmentHost) {
    throw new Error(
      `Egress blocked for ${options.dependency}: private or blocked host "${hostname}"`,
    );
  }

  const sovereigntyReason = getChinaSovereigntyBlockReasonForHostname(hostname);
  if (sovereigntyReason) {
    throw new Error(
      `Egress blocked for ${options.dependency}: host "${hostname}" violates no-China policy (${sovereigntyReason})`,
    );
  }

  const allowedPatterns = buildAllowedHostPatterns(options.extraAllowedHosts ?? []);
  const isAllowed = allowedPatterns.some((pattern) => hostMatchesPattern(hostname, pattern));
  if (!isAllowed && shouldEnforceEgressPolicy()) {
    throw new Error(
      `Egress blocked for ${options.dependency}: host "${hostname}" is not present in SERVER_EGRESS_ALLOWLIST`,
    );
  }
}

import dns from 'node:dns/promises';
import { isIP } from 'node:net';

type WebhookEndpointValidationFailureReason =
  | 'empty'
  | 'invalid_url'
  | 'invalid_protocol'
  | 'invalid_port'
  | 'contains_credentials'
  | 'blocked_hostname'
  | 'blocked_ip_literal'
  | 'hostname_resolution_failed'
  | 'hostname_resolution_empty'
  | 'blocked_resolved_ip';

type WebhookEndpointValidationResult =
  | {
      ok: true;
      normalizedUrl: string;
      resolvedAddresses: string[];
    }
  | {
      ok: false;
      reason: WebhookEndpointValidationFailureReason;
      details?: string;
    };

type ValidateWebhookEndpointUrlOptions = {
  resolveHostname?: (hostname: string) => Promise<string[]>;
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
];

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isBlockedIpv4Address(address: string): boolean {
  const parts = address.split('.');
  if (parts.length !== 4) return true;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) return true;

  const [a, b, c] = octets;

  // Private, loopback, link-local, CGNAT, reserved, multicast, and docs/test ranges.
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
  if (mappedIpv4) {
    return isBlockedIpv4Address(mappedIpv4);
  }

  if (normalized === '::') return true;
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
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

async function resolveHostnameAddresses(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function isAllowedWebhookPort(protocol: string, port: string): boolean {
  if (!port) return true;
  const parsedPort = Number.parseInt(port, 10);
  const expectedPort = protocol === 'https:' ? 443 : 80;
  return Number.isInteger(parsedPort) && parsedPort === expectedPort;
}

export async function validateWebhookEndpointUrl(
  rawUrl: string,
  options?: ValidateWebhookEndpointUrlOptions,
): Promise<WebhookEndpointValidationResult> {
  const candidate = rawUrl.trim();
  if (!candidate) {
    return { ok: false, reason: 'empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_protocol' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'contains_credentials' };
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: 'blocked_hostname', details: hostname };
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedIpAddress(hostname)) {
      return { ok: false, reason: 'blocked_ip_literal', details: hostname };
    }
    if (!isAllowedWebhookPort(parsed.protocol, parsed.port)) {
      return { ok: false, reason: 'invalid_port', details: parsed.port };
    }
    return { ok: true, normalizedUrl: parsed.toString(), resolvedAddresses: [hostname] };
  }

  if (!isAllowedWebhookPort(parsed.protocol, parsed.port)) {
    return { ok: false, reason: 'invalid_port', details: parsed.port };
  }

  let resolvedAddresses: string[];
  try {
    resolvedAddresses = await (options?.resolveHostname ?? resolveHostnameAddresses)(hostname);
  } catch (error) {
    return {
      ok: false,
      reason: 'hostname_resolution_failed',
      details: error instanceof Error ? error.message : String(error),
    };
  }

  if (resolvedAddresses.length === 0) {
    return { ok: false, reason: 'hostname_resolution_empty' };
  }

  const blockedAddress = resolvedAddresses.find((address) => isBlockedIpAddress(address));
  if (blockedAddress) {
    return { ok: false, reason: 'blocked_resolved_ip', details: blockedAddress };
  }

  return { ok: true, normalizedUrl: parsed.toString(), resolvedAddresses };
}

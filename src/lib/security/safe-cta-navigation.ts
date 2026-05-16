const INTERNAL_URL_BASE = 'https://kode01.internal';
const ABSOLUTE_URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export type SafeCtaTarget =
  | { kind: 'internal'; href: string }
  | { kind: 'external'; href: string };

export function parseHostnameAllowlist(rawList: string | undefined): string[] {
  return (rawList ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlistedHostname(hostname: string, allowlist: string[]): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  if (!normalizedHostname) return false;

  return allowlist.some((rule) => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(2);
      return normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`);
    }
    return normalizedHostname === rule;
  });
}

export function getPublicAllowedExternalCtaHosts(): string[] {
  return parseHostnameAllowlist(process.env.NEXT_PUBLIC_CTA_ALLOWED_EXTERNAL_HOSTS);
}

function getPublicAppHostname(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return null;

  try {
    return new URL(appUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sanitizeInternalTarget(target: string): SafeCtaTarget | null {
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  if (CONTROL_CHARACTER_PATTERN.test(target)) return null;

  try {
    const parsed = new URL(target, INTERNAL_URL_BASE);
    if (parsed.origin !== INTERNAL_URL_BASE) return null;

    return {
      kind: 'internal',
      href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    };
  } catch {
    return null;
  }
}

function sanitizeExternalTarget(target: string, allowlist: string[]): SafeCtaTarget | null {
  if (CONTROL_CHARACTER_PATTERN.test(target)) return null;

  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;

    const appHostname = getPublicAppHostname();
    if (appHostname && parsed.hostname.toLowerCase() === appHostname) {
      return {
        kind: 'internal',
        href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      };
    }

    if (allowlist.length === 0 || !isAllowlistedHostname(parsed.hostname, allowlist)) {
      return null;
    }

    return {
      kind: 'external',
      href: parsed.toString(),
    };
  } catch {
    return null;
  }
}

export function resolveSafeCtaTarget(
  rawTarget: string | null | undefined,
  allowlist: string[] = getPublicAllowedExternalCtaHosts(),
): SafeCtaTarget | null {
  const candidate = rawTarget?.trim();
  if (!candidate) return null;

  if (ABSOLUTE_URL_SCHEME_PATTERN.test(candidate)) {
    return sanitizeExternalTarget(candidate, allowlist);
  }

  return sanitizeInternalTarget(candidate);
}

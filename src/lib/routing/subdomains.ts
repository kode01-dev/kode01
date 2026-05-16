const MAIN_APP_HOST = 'kode01.com';
const DASHBOARD_HOST = 'dashboard.kode01.com';
const ADMIN_DASHBOARD_HOST = 'admin.kode01.com';

type ResolvedSubdomainHosts = {
  mainHost: string;
  dashboardHost: string;
  adminHost: string;
};

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const firstHost = host.split(',')[0]?.trim().toLowerCase();
  if (!firstHost) return null;
  return firstHost;
}

function removePort(host: string): string {
  if (host.startsWith('[')) {
    const closingBracketIndex = host.indexOf(']');
    return closingBracketIndex >= 0 ? host.slice(0, closingBracketIndex + 1) : host;
  }

  return host.replace(/:\d+$/, '');
}

function normalizeHostForMatch(host: string | null | undefined): string | null {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return null;
  return removePort(normalizedHost);
}

function parseHostList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => normalizeHostForMatch(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function toOrigin(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;
  try {
    return new URL(rawValue).origin;
  } catch {
    return null;
  }
}

function getOriginTemplate(
  rawOrigin: string | null | undefined,
): { protocol: string; port: string } | null {
  if (!rawOrigin) return null;
  try {
    const parsed = new URL(rawOrigin);
    return {
      protocol: parsed.protocol,
      port: parsed.port,
    };
  } catch {
    return null;
  }
}

function buildOriginForHost(
  host: string,
  template?: { protocol: string; port: string },
): string {
  if (template) {
    return `${template.protocol}//${host}${template.port ? `:${template.port}` : ''}`;
  }

  return `${getProtocolForHost(host)}://${host}`;
}

function stripSubdomainPrefix(host: string, prefix: string): string {
  if (host.startsWith(`${prefix}-`)) return host.slice(prefix.length + 1);
  if (host.startsWith(`${prefix}.`)) return host.slice(prefix.length + 1);
  return host;
}

function resolvePreviewVercelHosts(host: string): ResolvedSubdomainHosts | null {
  if (!host.endsWith('.vercel.app')) return null;

  const mainHost = stripSubdomainPrefix(stripSubdomainPrefix(host, 'admin'), 'dashboard');
  return {
    mainHost,
    adminHost: `admin-${mainHost}`,
    dashboardHost: `dashboard-${mainHost}`,
  };
}

function resolveLocalHosts(host: string): ResolvedSubdomainHosts | null {
  const localSuffixes = ['localhost', 'localtest.me', 'lvh.me'];
  const hasLocalSuffix = localSuffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  if (!hasLocalSuffix) return null;

  const mainHost = stripSubdomainPrefix(stripSubdomainPrefix(host, 'admin'), 'dashboard');
  return {
    mainHost,
    adminHost: `admin.${mainHost}`,
    dashboardHost: `dashboard.${mainHost}`,
  };
}

function resolveSubdomainHosts(currentHost: string | null | undefined): ResolvedSubdomainHosts {
  const normalizedCurrentHost = normalizeHost(currentHost);
  if (normalizedCurrentHost) {
    const previewHosts = resolvePreviewVercelHosts(normalizedCurrentHost);
    if (previewHosts) {
      return previewHosts;
    }

    const localHosts = resolveLocalHosts(normalizedCurrentHost);
    if (localHosts) {
      return localHosts;
    }
  }

  return {
    mainHost: MAIN_APP_HOST,
    dashboardHost: DASHBOARD_HOST,
    adminHost: ADMIN_DASHBOARD_HOST,
  };
}

function getProtocolForHost(host: string): 'http' | 'https' {
  const hostForMatch = removePort(host);
  return hostForMatch.includes('localhost') || hostForMatch.endsWith('.localtest.me') || hostForMatch.endsWith('.lvh.me')
    ? 'http'
    : 'https';
}

function isEphemeralHost(host: string): boolean {
  const hostForMatch = removePort(host);
  return (
    hostForMatch.endsWith('.vercel.app') ||
    hostForMatch.includes('localhost') ||
    hostForMatch.endsWith('.localtest.me') ||
    hostForMatch.endsWith('.lvh.me')
  );
}

function buildUrl(host: string, pathname: string): string {
  const protocol = getProtocolForHost(host);
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${protocol}://${host}${normalizedPath}`;
}

export function isDashboardSubdomainHost(host: string | null | undefined): boolean {
  const normalizedHost = normalizeHostForMatch(host);
  if (!normalizedHost) return false;

  const configuredHosts = parseHostList(process.env.DASHBOARD_HOSTS);
  if (configuredHosts.includes(normalizedHost)) return true;

  const resolved = resolveSubdomainHosts(normalizedHost);
  return normalizedHost === resolved.dashboardHost;
}

export function isAdminSubdomainHost(host: string | null | undefined): boolean {
  const normalizedHost = normalizeHostForMatch(host);
  if (!normalizedHost) return false;

  const configuredHosts = parseHostList(process.env.ADMIN_DASHBOARD_HOSTS);
  if (configuredHosts.includes(normalizedHost)) return true;

  const resolved = resolveSubdomainHosts(normalizedHost);
  return normalizedHost === resolved.adminHost;
}

export function buildMainSiteLocaleUrl(locale: string, currentHost?: string | null): string {
  const normalizedHost = normalizeHost(currentHost);
  if (normalizedHost && isEphemeralHost(normalizedHost)) {
    return buildUrl(normalizedHost, `/${locale}`);
  }

  const resolved = resolveSubdomainHosts(normalizeHostForMatch(currentHost));
  return buildUrl(resolved.mainHost, `/${locale}`);
}

export function buildDashboardVendorUrl(
  slug: string,
  currentHost?: string | null,
  locale?: string,
): string {
  const normalizedHost = normalizeHost(currentHost);
  if (normalizedHost && isEphemeralHost(normalizedHost)) {
    const previewPath = locale ? `/${locale}/vendor/${slug}` : `/vendor/${slug}`;
    return buildUrl(normalizedHost, previewPath);
  }

  const resolved = resolveSubdomainHosts(normalizeHostForMatch(currentHost));
  return buildUrl(resolved.dashboardHost, `/vendor/${slug}`);
}

export function buildDashboardClientUrl(
  slug: string,
  currentHost?: string | null,
  locale?: string,
): string {
  const normalizedHost = normalizeHost(currentHost);
  if (normalizedHost && isEphemeralHost(normalizedHost)) {
    const previewPath = locale ? `/${locale}/client/${slug}` : `/client/${slug}`;
    return buildUrl(normalizedHost, previewPath);
  }

  const resolved = resolveSubdomainHosts(normalizeHostForMatch(currentHost));
  return buildUrl(resolved.dashboardHost, `/client/${slug}`);
}

export function buildAdminDashboardUrl(currentHost?: string | null, locale?: string): string {
  const normalizedHost = normalizeHost(currentHost);
  if (normalizedHost && isEphemeralHost(normalizedHost)) {
    const previewPath = locale ? `/${locale}/admin` : '/admin';
    return buildUrl(normalizedHost, previewPath);
  }

  const resolved = resolveSubdomainHosts(normalizeHostForMatch(currentHost));
  return buildUrl(resolved.adminHost, '/');
}

export function getTrustedSubdomainOrigins(
  currentHost: string | null | undefined,
  currentOrigin?: string | null,
): string[] {
  const trustedOrigins = new Set<string>();
  const trustedHosts = new Set<string>();
  const normalizedCurrentHost = normalizeHostForMatch(currentHost);
  const originTemplate = getOriginTemplate(currentOrigin);

  if (normalizedCurrentHost) {
    trustedHosts.add(normalizedCurrentHost);
  }

  const resolvedHosts = resolveSubdomainHosts(normalizedCurrentHost);
  trustedHosts.add(resolvedHosts.mainHost);
  trustedHosts.add(resolvedHosts.dashboardHost);
  trustedHosts.add(resolvedHosts.adminHost);

  for (const host of parseHostList(process.env.DASHBOARD_HOSTS)) {
    trustedHosts.add(host);
  }

  for (const host of parseHostList(process.env.ADMIN_DASHBOARD_HOSTS)) {
    trustedHosts.add(host);
  }

  const appBaseOrigin = toOrigin(process.env.APP_BASE_URL);
  if (appBaseOrigin) {
    trustedOrigins.add(appBaseOrigin);
  }

  const appPublicOrigin = toOrigin(process.env.NEXT_PUBLIC_APP_URL);
  if (appPublicOrigin) {
    trustedOrigins.add(appPublicOrigin);
  }

  const normalizedCurrentOrigin = toOrigin(currentOrigin);
  if (normalizedCurrentOrigin) {
    trustedOrigins.add(normalizedCurrentOrigin);
  }

  for (const host of trustedHosts) {
    trustedOrigins.add(buildOriginForHost(host));
    if (originTemplate) {
      trustedOrigins.add(buildOriginForHost(host, originTemplate));
    }
  }

  return [...trustedOrigins];
}

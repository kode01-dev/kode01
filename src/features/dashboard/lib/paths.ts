import { DASHBOARD_ROLES, type DashboardRole } from './roles';

export type { DashboardRole } from './roles';

type DashboardRolePathConfig = {
  rootPath: string;
  slugPathPrefix?: string;
};

const DASHBOARD_ROLE_PATHS: Record<DashboardRole, DashboardRolePathConfig> = {
  [DASHBOARD_ROLES.ADMIN]: {
    rootPath: '/admin',
  },
  [DASHBOARD_ROLES.VENDOR]: {
    rootPath: '/vendor',
    slugPathPrefix: '/vendor',
  },
  [DASHBOARD_ROLES.BUYER]: {
    rootPath: '/buyer',
    slugPathPrefix: '/client',
  },
};

const DASHBOARD_SLUG_PREFIXES = Array.from(
  new Set(
    Object.values(DASHBOARD_ROLE_PATHS)
      .map((config) => config.slugPathPrefix)
      .filter((value): value is string => Boolean(value)),
  ),
).map((value) => value.replace('/', ''));

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractDashboardSlugFromPath(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/^\/(en|fr)(?=\/|$)/, '') || '/';
  const slugPrefixPattern = DASHBOARD_SLUG_PREFIXES.map(escapeRegex).join('|');
  const match = normalizedPathname.match(new RegExp(`^/(?:${slugPrefixPattern})/([^/]+)`));
  return match?.[1] ?? null;
}

export function getDashboardOverviewHref(role: DashboardRole, slug?: string | null): string {
  const config = DASHBOARD_ROLE_PATHS[role];

  if (slug && config.slugPathPrefix) {
    return `${config.slugPathPrefix}/${slug}`;
  }

  return config.rootPath;
}


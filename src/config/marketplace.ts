import marketplaceConfig from '../../config/public-marketplace.json';

export const PUBLIC_MARKETPLACE_ENABLED = marketplaceConfig.PUBLIC_MARKETPLACE_ENABLED;

export const MARKETPLACE_DISABLED_PUBLIC_ROUTES = new Set([
  '/market',
  '/products',
  '/bundles',
  '/creators',
]);

export function isMarketplacePublicRoute(pathname: string): boolean {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return [...MARKETPLACE_DISABLED_PUBLIC_ROUTES].some(
    (route) => normalizedPathname === route || normalizedPathname.startsWith(`${route}/`),
  );
}

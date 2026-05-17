/** @type {import('next-sitemap').IConfig} */
const CANONICAL_SITE_URL = 'https://kode01.com';
const LOCALES = ['en', 'fr'];
const BLOCKED_SEGMENTS = ['admin', 'dashboard', 'buyer', 'client', 'vendor', 'settings', 'auth', 'api'];
const PUBLIC_ASSET_EXCLUSIONS = ['/icon.png'];
const PUBLIC_API_ALLOWLIST = ['/api/blog/rss', '/api/news/rss'];

// Static public routes (no dynamic params) — localized
const STATIC_ROUTES = [
    '/',
    '/about',
    '/blog',
    '/bundles',
    '/canada-privacy',
    '/cli-faq',
    '/contact',
    '/cookies',
    '/creators',
    '/gdpr-ccpa',
    '/how-it-works',
    '/legal',
    '/pricing',
    '/privacy',
    '/search',
    '/terms',
    '/news',
    '/market',
];

const normalizeUrl = (url) => url.replace(/\/+$/, '');

const siteUrl = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL || CANONICAL_SITE_URL);
const isCanonicalSite = siteUrl === CANONICAL_SITE_URL;
const vercelEnv = process.env.VERCEL_ENV?.trim();
const isExplicitNonProductionVercelEnv = Boolean(vercelEnv && vercelEnv !== 'production');
const isPublicProduction = isCanonicalSite && !isExplicitNonProductionVercelEnv;
const shouldIncludeServerSitemap = isCanonicalSite;

const blockedRootPaths = BLOCKED_SEGMENTS.map((segment) => `/${segment}`);
const blockedLocalizedPaths = LOCALES.flatMap((locale) =>
    BLOCKED_SEGMENTS.map((segment) => `/${locale}/${segment}`)
);
const blockedPaths = [...blockedRootPaths, ...blockedLocalizedPaths];
const excludedPaths = blockedPaths.flatMap((path) => [path, `${path}/*`]);
excludedPaths.push('/server-sitemap.xml', ...PUBLIC_ASSET_EXCLUSIONS);

module.exports = {
    siteUrl,
    generateRobotsTxt: true,
    sitemapSize: 7000,
    outDir: process.env.NEXT_SITEMAP_OUT_DIR || 'public',
    exclude: excludedPaths,
    robotsTxtOptions: {
        policies: isPublicProduction
            ? [
                  {
                      userAgent: '*',
                      allow: ['/', ...PUBLIC_API_ALLOWLIST],
                      disallow: blockedPaths,
                  },
              ]
            : [
                  {
                      userAgent: '*',
                      disallow: '/',
                  },
              ],
        additionalSitemaps: shouldIncludeServerSitemap ? [`${siteUrl}/server-sitemap.xml`] : [],
    },
    additionalPaths: async () => {
        const entries = [];
        for (const locale of LOCALES) {
            for (const route of STATIC_ROUTES) {
                const path = route === '/' ? `/${locale}` : `/${locale}${route}`;
                entries.push({
                    loc: path,
                    changefreq: 'weekly',
                    priority: route === '/' ? 1.0 : 0.8,
                    lastmod: new Date().toISOString(),
                });
            }
        }
        return entries;
    },
};

import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const isDev = process.env.NODE_ENV !== 'production';
const supabaseStorageBaseUrl = (() => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
})();

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;
  return defaultValue;
}

const cspEnforce = parseBooleanEnv(process.env.CSP_ENFORCE, !isDev);
const cspAllowUnsafeEval = parseBooleanEnv(process.env.CSP_ALLOW_UNSAFE_EVAL, isDev);
const cspAllowUnsafeInlineScript = parseBooleanEnv(
  process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT,
  true,
);
const cspAllowUnsafeInlineStyle = parseBooleanEnv(
  process.env.CSP_ALLOW_UNSAFE_INLINE_STYLE,
  true,
);
// Keep strict CSP reporting opt-in until inline scripts/styles and third-party widgets are nonce-ready.
const cspStrictReportOnly = parseBooleanEnv(process.env.CSP_STRICT_REPORT_ONLY, false);

function buildCspValue(options: {
  allowUnsafeEval: boolean;
  allowUnsafeInlineScript: boolean;
  allowUnsafeInlineStyle: boolean;
  upgradeInsecureRequests: boolean;
}): string {
  const {
    allowUnsafeEval,
    allowUnsafeInlineScript,
    allowUnsafeInlineStyle,
    upgradeInsecureRequests,
  } = options;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob: https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://img.youtube.com https://cdn.loom.com",
    "object-src 'none'",
    `script-src 'self' ${allowUnsafeInlineScript ? "'unsafe-inline' " : ''}${allowUnsafeEval ? "'unsafe-eval' " : ''}https://js.stripe.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com https://app.zipchat.ai https://va.vercel-scripts.com`,
    `style-src 'self' ${allowUnsafeInlineStyle ? "'unsafe-inline' " : ''}https://fonts.googleapis.com`,
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://www.google.com https://stats.g.doubleclick.net https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com https://googleads.g.doubleclick.net https://app.zipchat.ai https://zipchat.ai https://*.zipchat.ai wss://zipchat.ai wss://*.zipchat.ai https://bam.nr-data.net https://*.nr-data.net https://*.newrelic.com https://vitals.vercel-insights.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://app.zipchat.ai https://*.zipchat.ai https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://www.loom.com",
    ...(upgradeInsecureRequests ? ["upgrade-insecure-requests"] : []),
    "report-uri /api/csp-report",
  ].join('; ');
}

const cspEnforcedValue = buildCspValue({
  allowUnsafeEval: cspAllowUnsafeEval,
  allowUnsafeInlineScript: cspAllowUnsafeInlineScript,
  allowUnsafeInlineStyle: cspAllowUnsafeInlineStyle,
  upgradeInsecureRequests: true,
});

const cspReportOnlyValue = buildCspValue({
  allowUnsafeEval: cspAllowUnsafeEval,
  allowUnsafeInlineScript: cspAllowUnsafeInlineScript,
  allowUnsafeInlineStyle: cspAllowUnsafeInlineStyle,
  upgradeInsecureRequests: false,
});

const cspStrictReportOnlyValue = buildCspValue({
  allowUnsafeEval: false,
  allowUnsafeInlineScript: false,
  allowUnsafeInlineStyle: false,
  upgradeInsecureRequests: false,
});

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  ...(cspEnforce
    ? [{ key: 'Content-Security-Policy', value: cspEnforcedValue }]
    : []),
  ...(cspStrictReportOnly
    ? [{ key: 'Content-Security-Policy-Report-Only', value: cspStrictReportOnlyValue }]
    : cspEnforce
      ? []
      : [{ key: 'Content-Security-Policy-Report-Only', value: cspReportOnlyValue }]),
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'sharp',
    'open-graph-scraper',
    'cheerio',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'zboonzqhrbuueqqzzrgn.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'kode01.com',
      },
      ...(isDev
        ? [
            {
              protocol: 'http' as const,
              hostname: 'localhost',
              port: '3000',
              pathname: '/storage/v1/object/public/**',
            },
            {
              protocol: 'http' as const,
              hostname: '127.0.0.1',
              port: '3000',
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 1800,
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  async rewrites() {
    if (!supabaseStorageBaseUrl) return [];

    return [
      {
        source: '/storage/:path*',
        destination: `${supabaseStorageBaseUrl}/storage/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/storage/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

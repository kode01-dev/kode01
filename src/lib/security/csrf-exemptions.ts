/**
 * Security-critical allowlist for API routes that intentionally bypass CSRF checks.
 *
 * IMPORTANT:
 * - Keep this list explicit (exact paths only).
 * - Do not replace with prefix matching (e.g. `/api/webhooks/`), which can silently
 *   exempt newly added routes from CSRF protections.
 * - Any new exemption must be reviewed as a security change.
 */
export const CSRF_EXEMPT_API_PATHS = [
  '/api/webhooks/stripe',
  '/api/webhooks/stripe-connect-thin',
  '/api/cron/api-monitor-health',
  '/api/cron/abandoned-cart-emails',
  '/api/cron/abandoned-carts',
  '/api/cron/keep-warm',
  '/api/cron/license-webhooks',
  '/api/cron/purge-api-monitor-events',
  '/api/cron/purge-bot-activity',
  '/api/cron/purge-cookie-consent-events',
  '/api/cron/purge-recommendation-events',
  '/api/cron/send-emails',
  '/api/cron/send-push-notifications',
  '/api/cron/weekly-ai-recap',
] as const;

const CSRF_EXEMPT_API_PATH_SET = new Set<string>(CSRF_EXEMPT_API_PATHS);

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  const prefixed = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed;
}

export function isCsrfExemptApiPath(pathname: string): boolean {
  return CSRF_EXEMPT_API_PATH_SET.has(normalizePathname(pathname));
}

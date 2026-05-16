export const MONITORED_EXTERNAL_ENDPOINTS = [
  '/api/licenses/verify',
  '/api/licenses/activate',
  '/api/webhooks/stripe',
  '/api/webhooks/stripe-connect-thin',
  'license_webhook_delivery',
] as const;

export type MonitoredExternalEndpoint = (typeof MONITORED_EXTERNAL_ENDPOINTS)[number];

export type ApiMonitorRange = '24h' | '7d' | '30d';

export const API_MONITOR_RANGE_IN_MS: Record<ApiMonitorRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const API_MONITOR_RETENTION_DAYS = 30;
export const API_MONITOR_RED_NO_SUCCESS_WINDOW_MS = 30 * 60 * 1000;

export function getApiMonitorRange(rawRange: string | null): ApiMonitorRange {
  if (rawRange === '24h' || rawRange === '7d' || rawRange === '30d') return rawRange;
  return '24h';
}

export function getApiMonitorFromDate(range: ApiMonitorRange): Date {
  return new Date(Date.now() - API_MONITOR_RANGE_IN_MS[range]);
}

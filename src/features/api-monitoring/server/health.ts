import { API_MONITOR_RED_NO_SUCCESS_WINDOW_MS } from './constants';

export type EndpointHealthStatus = 'green' | 'yellow' | 'red';

export type EndpointHealthInput = {
  errorRatePercent: number;
  attemptsLast30m: number;
  successesLast30m: number;
};

function sanitizePercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function classifyEndpointHealth(input: EndpointHealthInput): EndpointHealthStatus {
  const errorRatePercent = sanitizePercent(input.errorRatePercent);
  const hasNoSuccessForRecentAttempts = input.attemptsLast30m > 0 && input.successesLast30m === 0;

  if (hasNoSuccessForRecentAttempts || errorRatePercent > 5) return 'red';
  if (errorRatePercent >= 2) return 'yellow';
  return 'green';
}

export function shouldSendRedAlert(
  previousStatus: EndpointHealthStatus | null,
  nextStatus: EndpointHealthStatus,
): boolean {
  return nextStatus === 'red' && previousStatus !== 'red';
}

export function computeErrorRatePercent(total: number, errors: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(errors) || errors <= 0) return 0;
  return (errors / total) * 100;
}

export function toRoundedPercent(value: number, precision = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function getRecentSuccessCutoffDate(): Date {
  return new Date(Date.now() - API_MONITOR_RED_NO_SUCCESS_WINDOW_MS);
}

export type DataSafetyState = 'ok' | 'refresh_required' | 'degraded';

export type DataSafetyFailureCause = 'auto' | 'manual_refresh';

export function nextDataSafetyStateOnFailure(
  current: DataSafetyState,
  cause: DataSafetyFailureCause,
): DataSafetyState {
  if (current === 'degraded') return 'degraded';
  if (cause === 'manual_refresh' && current === 'refresh_required') return 'degraded';
  return 'refresh_required';
}

export function nextDataSafetyStateOnSuccess(): DataSafetyState {
  return 'ok';
}

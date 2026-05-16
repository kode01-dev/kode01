function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return defaultValue;
}

export function isApiMonitoringEnabledServer(): boolean {
  return parseBooleanFlag(
    process.env.API_MONITORING_ENABLED ?? process.env.NEXT_PUBLIC_API_MONITORING_ENABLED,
    true,
  );
}

export const API_MONITORING_ENABLED_CLIENT = parseBooleanFlag(
  process.env.NEXT_PUBLIC_API_MONITORING_ENABLED,
  true,
);

export const DB_UNAVAILABLE_CODE = 'DB_UNAVAILABLE' as const;
export const DB_UNAVAILABLE_STATUS = 503;
export const DB_UNAVAILABLE_RETRY_AFTER_SECONDS = 10;

export const DB_UNAVAILABLE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'Cache-Control': 'no-store',
  'Retry-After': String(DB_UNAVAILABLE_RETRY_AFTER_SECONDS),
};

export type DbUnavailableApiPayload = {
  error: string;
  code: typeof DB_UNAVAILABLE_CODE;
  incidentActive: true;
  suggestedAction: 'refresh';
};

const DB_UNAVAILABLE_ERROR_CODES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '53300',
  '57P01',
  '57P02',
  '57P03',
  'PGRST000',
  'PGRST003',
]);

const DB_UNAVAILABLE_MESSAGE_PATTERNS = [
  'aborterror',
  'connection',
  'connect',
  'database is unavailable',
  'db unavailable',
  'econnrefused',
  'econnreset',
  'enotfound',
  'etimedout',
  'failed to fetch',
  'fetch failed',
  'gateway timeout',
  'network',
  'service unavailable',
  'timeout',
  'timed out',
];

function toLowerString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toUpperString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function matchesUnavailableMessage(value: unknown): boolean {
  const normalized = toLowerString(value);
  if (!normalized) return false;
  return DB_UNAVAILABLE_MESSAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function matchesUnavailableCode(value: unknown): boolean {
  const normalized = toUpperString(value);
  if (!normalized) return false;
  return DB_UNAVAILABLE_ERROR_CODES.has(normalized);
}

export function createDbUnavailableApiPayload(): DbUnavailableApiPayload {
  return {
    error: 'Service Unavailable',
    code: DB_UNAVAILABLE_CODE,
    incidentActive: true,
    suggestedAction: 'refresh',
  };
}

export function isDbUnavailableApiPayload(payload: unknown): payload is DbUnavailableApiPayload {
  const record = asRecord(payload);
  if (!record) return false;
  return (
    record.code === DB_UNAVAILABLE_CODE
    && record.incidentActive === true
    && record.suggestedAction === 'refresh'
  );
}

export function isTransientDbUnavailableError(error: unknown): boolean {
  if (!error) return false;

  const stack: unknown[] = [error];
  const visited = new Set<unknown>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (matchesUnavailableCode((current as { code?: unknown }).code)) {
      return true;
    }

    const record = asRecord(current);
    if (!record) continue;

    if (matchesUnavailableCode(record.code)) return true;
    if (matchesUnavailableMessage(record.name)) return true;
    if (matchesUnavailableMessage(record.message)) return true;
    if (matchesUnavailableMessage(record.details)) return true;
    if (matchesUnavailableMessage(record.hint)) return true;

    if (record.cause) {
      stack.push(record.cause);
    }
  }

  return false;
}

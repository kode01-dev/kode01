import { normalizeSupabaseApiKey } from '@/lib/supabase/api-key';
import {
  HYBRID_FAIL_CLOSED_ACTIONS,
  RATE_LIMIT_SCHEMAS,
  type RateLimitAction,
  type RateLimitSchema,
} from './rate-limit-schemas';
import { logSecurityEvent } from './security-log';

export type RateLimitFailureMode = 'open' | 'closed' | 'hybrid';

type CheckRateLimitDetailedRow = {
  allowed: boolean;
  request_count: number;
  remaining: number;
  reset_at: string;
};

type CheckRateLimitRpcPayload = {
  p_key: string;
  p_limit: number;
  p_window_seconds: number;
};

export type RateLimitCheckResult = {
  action: RateLimitAction;
  key: string;
  allowed: boolean;
  limit: number;
  remaining: number;
  requestCount: number;
  resetAt: string;
  degraded: boolean;
};

type CheckRateLimitInput = {
  action: RateLimitAction;
  key: string;
  schema?: RateLimitSchema;
};

type InMemoryFallbackCounter = {
  requestCount: number;
  resetAt: number;
};

const inMemoryFallbackCounters = new Map<string, InMemoryFallbackCounter>();

function getRateLimitRpcConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = normalizeSupabaseApiKey(
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Rate limiter requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY');
  }

  return { supabaseUrl, serviceRoleKey };
}

function parseFailureMode(value: string | undefined): RateLimitFailureMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'open' || normalized === 'closed' || normalized === 'hybrid') {
    return normalized;
  }
  return 'hybrid';
}

function isFailClosedAction(action: RateLimitAction): boolean {
  return HYBRID_FAIL_CLOSED_ACTIONS.has(action);
}

function getSafeResetAt(windowSeconds: number): string {
  return new Date(Date.now() + windowSeconds * 1000).toISOString();
}

function getFailureFallbackResult(
  action: RateLimitAction,
  key: string,
  schema: RateLimitSchema,
  mode: RateLimitFailureMode,
): RateLimitCheckResult {
  if (mode === 'open') {
    return {
      action,
      key,
      allowed: true,
      limit: schema.limit,
      remaining: schema.limit,
      requestCount: 0,
      resetAt: getSafeResetAt(schema.windowSeconds),
      degraded: true,
    };
  }

  if (mode === 'closed') {
    return {
      action,
      key,
      allowed: false,
      limit: schema.limit,
      remaining: 0,
      requestCount: schema.limit,
      resetAt: getSafeResetAt(schema.windowSeconds),
      degraded: true,
    };
  }

  const failClosed = isFailClosedAction(action);
  return {
    action,
    key,
    allowed: !failClosed,
    limit: schema.limit,
    remaining: failClosed ? 0 : schema.limit,
    requestCount: failClosed ? schema.limit : 0,
    resetAt: getSafeResetAt(schema.windowSeconds),
    degraded: true,
  };
}

function shouldUseInMemoryFallback(): boolean {
  const raw = process.env.RATE_LIMIT_IN_MEMORY_FALLBACK_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getInMemoryFallbackResult(
  action: RateLimitAction,
  key: string,
  schema: RateLimitSchema,
): RateLimitCheckResult {
  const now = Date.now();
  const mapKey = `${action}:${key}`;
  const existing = inMemoryFallbackCounters.get(mapKey);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + schema.windowSeconds * 1000;
    inMemoryFallbackCounters.set(mapKey, { requestCount: 1, resetAt });
    return {
      action,
      key,
      allowed: true,
      limit: schema.limit,
      remaining: Math.max(0, schema.limit - 1),
      requestCount: 1,
      resetAt: new Date(resetAt).toISOString(),
      degraded: true,
    };
  }

  const requestCount = existing.requestCount + 1;
  const limitedRequestCount = Math.min(requestCount, schema.limit);
  existing.requestCount = requestCount;

  return {
    action,
    key,
    allowed: requestCount <= schema.limit,
    limit: schema.limit,
    remaining: Math.max(0, schema.limit - limitedRequestCount),
    requestCount: limitedRequestCount,
    resetAt: new Date(existing.resetAt).toISOString(),
    degraded: true,
  };
}

function normalizeDetailedRow(payload: unknown): CheckRateLimitDetailedRow | null {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== 'object') return null;

  const candidate = row as Partial<CheckRateLimitDetailedRow>;
  if (
    typeof candidate.allowed !== 'boolean' ||
    typeof candidate.request_count !== 'number' ||
    typeof candidate.remaining !== 'number' ||
    typeof candidate.reset_at !== 'string'
  ) {
    return null;
  }

  return {
    allowed: candidate.allowed,
    request_count: candidate.request_count,
    remaining: Math.max(0, candidate.remaining),
    reset_at: candidate.reset_at,
  };
}

async function callRateLimitRpc(payload: CheckRateLimitRpcPayload): Promise<CheckRateLimitDetailedRow> {
  const { supabaseUrl, serviceRoleKey } = getRateLimitRpcConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit_detailed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Rate limit RPC failed (${response.status}): ${body}`);
  }

  const json = (await response.json().catch(() => null)) as unknown;
  const row = normalizeDetailedRow(json);
  if (!row) {
    throw new Error('Rate limit RPC returned an invalid payload');
  }

  return row;
}

export async function checkRateLimit({ action, key, schema }: CheckRateLimitInput): Promise<RateLimitCheckResult> {
  const resolvedSchema = schema ?? RATE_LIMIT_SCHEMAS[action];
  const failureMode = parseFailureMode(process.env.RATE_LIMIT_FAILURE_MODE);

  try {
    const data = await callRateLimitRpc({
      p_key: key,
      p_limit: resolvedSchema.limit,
      p_window_seconds: resolvedSchema.windowSeconds,
    });

    return {
      action,
      key,
      allowed: data.allowed,
      limit: resolvedSchema.limit,
      remaining: data.remaining,
      requestCount: data.request_count,
      resetAt: data.reset_at,
      degraded: false,
    };
  } catch (error) {
    console.error('Rate limiter unavailable, applying fallback mode:', {
      action,
      mode: failureMode,
      error,
    });
    void logSecurityEvent({
      eventType: 'security.rate_limit_degraded',
      metadata: {
        action,
        key,
        mode: failureMode,
      },
    });
    if (shouldUseInMemoryFallback()) {
      return getInMemoryFallbackResult(action, key, resolvedSchema);
    }
    return getFailureFallbackResult(action, key, resolvedSchema, failureMode);
  }
}

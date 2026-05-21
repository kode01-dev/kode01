import { createHmac, randomUUID } from 'crypto';
import { normalizeSupabaseApiKey } from '@/lib/supabase/api-key';
import type { Json } from '@/types/database.types';

type SecurityLogInput = {
  eventType: string;
  path?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  metadata?: Json;
};

type BotLogInput = {
  source: string;
  reason: string;
  path?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Json;
  blocked?: boolean;
};

type AuditDeliveryMetrics = {
  queueDepth: number;
  failuresInWindow: number;
};

type AuditMetadata = Record<string, Json | undefined> & {
  correlation_id?: string;
  _audit?: Json;
};

type AuditTablePayload = {
  event_type: string;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: AuditMetadata;
};

const AUDIT_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const AUDIT_FLUSH_DELAY_MS = 1_000;

const pendingAuditQueue: AuditTablePayload[] = [];
const recentAuditFailureTimestamps: number[] = [];
let isFlushingAuditQueue = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getSupabaseRestContext() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const rawServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim();
  if (!baseUrl || !rawServiceRoleKey) return null;

  const serviceRoleKey = normalizeSupabaseApiKey(rawServiceRoleKey);
  if (!serviceRoleKey) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    serviceRoleKey,
  };
}

function normalizeIpForAudit(ipAddress?: string | null): string | null {
  if (!ipAddress) return null;
  const ip = ipAddress.trim();
  if (!ip || ip === 'unknown') return null;
  return ip;
}

function pruneAuditFailureWindow(nowMs: number) {
  while (
    recentAuditFailureTimestamps.length > 0 &&
    nowMs - recentAuditFailureTimestamps[0] > AUDIT_FAILURE_WINDOW_MS
  ) {
    recentAuditFailureTimestamps.shift();
  }
}

function recordAuditFailure(nowMs = Date.now()) {
  recentAuditFailureTimestamps.push(nowMs);
  pruneAuditFailureWindow(nowMs);
}

function getAuditIntegrityKeyId(): string {
  return process.env.AUDIT_LOG_INTEGRITY_KEY_ID?.trim() || 'default';
}

function getAuditIntegritySecret(): string | null {
  const raw = process.env.AUDIT_LOG_INTEGRITY_SECRET?.trim();
  return raw && raw.length > 0 ? raw : null;
}

function buildAuditMetadata(input: SecurityLogInput): AuditMetadata {
  const baseMetadata: AuditMetadata = {
    path: input.path ?? null,
    ...asJsonObject(input.metadata),
  };
  const correlationId =
    typeof baseMetadata.correlation_id === 'string' && baseMetadata.correlation_id.trim().length > 0
      ? baseMetadata.correlation_id
      : randomUUID();
  baseMetadata.correlation_id = correlationId;

  const integritySecret = getAuditIntegritySecret();
  if (!integritySecret) return baseMetadata;

  const signedPayload = JSON.stringify({
    event_type: input.eventType,
    user_id: input.userId ?? null,
    ip_address: normalizeIpForAudit(input.ipAddress),
    user_agent: input.userAgent ?? null,
    metadata: baseMetadata,
  });
  const hash = createHmac('sha256', integritySecret).update(signedPayload).digest('hex');
  baseMetadata._audit = {
    schema: 'soc2.v1',
    correlation_id: correlationId,
    hash_algorithm: 'hmac-sha256',
    key_id: getAuditIntegrityKeyId(),
    hash,
  };

  return baseMetadata;
}

async function insertIntoTable(table: string, payload: unknown, maxAttempts = 2) {
  const context = getSupabaseRestContext();
  if (!context) return;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
    try {
      const response = await fetch(`${context.baseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: context.serviceRoleKey,
          Authorization: `Bearer ${context.serviceRoleKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (response.ok) return;

      const body = await response.text().catch(() => '');
      lastError = new Error(`security log insert failed for ${table} (${response.status}): ${body}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function asJsonObject(value: Json | undefined): Record<string, Json | undefined> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Json | undefined>;
}

function scheduleAuditQueueFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueuedAuditLogs();
  }, AUDIT_FLUSH_DELAY_MS);
}

async function flushQueuedAuditLogs() {
  if (isFlushingAuditQueue || pendingAuditQueue.length === 0) return;
  isFlushingAuditQueue = true;

  try {
    while (pendingAuditQueue.length > 0) {
      const nextPayload = pendingAuditQueue[0];
      try {
        await insertIntoTable('audit_logs', nextPayload, 1);
        pendingAuditQueue.shift();
      } catch {
        recordAuditFailure();
        scheduleAuditQueueFlush();
        break;
      }
    }
  } finally {
    isFlushingAuditQueue = false;
  }
}

export function getAuditDeliveryMetrics(): AuditDeliveryMetrics {
  const now = Date.now();
  pruneAuditFailureWindow(now);
  return {
    queueDepth: pendingAuditQueue.length,
    failuresInWindow: recentAuditFailureTimestamps.length,
  };
}

export async function logSecurityEvent(input: SecurityLogInput): Promise<void> {
  const payload: AuditTablePayload = {
    event_type: input.eventType,
    user_id: input.userId ?? null,
    ip_address: normalizeIpForAudit(input.ipAddress),
    user_agent: input.userAgent ?? null,
    metadata: buildAuditMetadata(input),
  };

  try {
    await flushQueuedAuditLogs();
    await insertIntoTable('audit_logs', payload);
  } catch (error) {
    pendingAuditQueue.push(payload);
    recordAuditFailure();
    scheduleAuditQueueFlush();
    console.error('Failed to insert audit_logs security event:', error);
  }
}

export async function logBotActivityDirect(input: BotLogInput): Promise<void> {
  try {
    await insertIntoTable('bot_activity', {
      source: input.source,
      reason: input.reason,
      path: input.path ?? null,
      ip_address: normalizeIpForAudit(input.ipAddress),
      user_agent: input.userAgent ?? null,
      details: input.details ?? {},
      blocked: Boolean(input.blocked),
    });
  } catch (error) {
    console.error('Failed to insert bot_activity event:', error);
  }
}

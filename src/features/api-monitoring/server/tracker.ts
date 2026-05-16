import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';

export type ExternalApiCallChannel = 'inbound' | 'outbound';

type TrackExternalApiCallInput = {
  endpoint: string;
  channel: ExternalApiCallChannel;
  method?: string | null;
  statusCode?: number | null;
  success: boolean;
  durationMs: number;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

type TrackInboundApiCallInput = {
  request: Request;
  endpoint: string;
  startedAt: number;
  statusCode: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
};

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function normalizeStatusCode(statusCode: number | null | undefined): number | null {
  if (!Number.isFinite(statusCode ?? NaN)) return null;
  const normalized = Math.round(Number(statusCode));
  if (normalized < 100 || normalized > 999) return null;
  return normalized;
}

function normalizeIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  const trimmed = ipAddress.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  return trimmed;
}

function getFirstForwardedIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(',')[0]?.trim();
  return first || null;
}

export function getRequestTrackingContext(request: Request) {
  const ipAddress =
    getFirstForwardedIp(request.headers.get('x-forwarded-for'))
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-vercel-forwarded-for')
    ?? null;

  return {
    requestId: request.headers.get('x-request-id') ?? null,
    ipAddress: normalizeIpAddress(ipAddress),
    userAgent: request.headers.get('user-agent') ?? null,
    method: request.method ?? null,
  };
}

export async function trackExternalApiCallEvent(input: TrackExternalApiCallInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const statusCode = normalizeStatusCode(input.statusCode);

    const { error } = await admin.from('external_api_call_events').insert({
      endpoint: input.endpoint,
      channel: input.channel,
      method: input.method ?? null,
      status_code: statusCode,
      success: Boolean(input.success),
      duration_ms: toNonNegativeInt(input.durationMs),
      request_id: input.requestId ?? null,
      ip_address: normalizeIpAddress(input.ipAddress),
      user_agent: input.userAgent ?? null,
      metadata: (input.metadata ?? {}) as Json,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    console.error('Failed to insert external_api_call_events row:', error);
  }
}

export async function trackInboundApiCallFromRequest(input: TrackInboundApiCallInput): Promise<void> {
  const context = getRequestTrackingContext(input.request);
  const inferredSuccess = input.statusCode >= 200 && input.statusCode < 300;

  await trackExternalApiCallEvent({
    endpoint: input.endpoint,
    channel: 'inbound',
    method: context.method,
    statusCode: input.statusCode,
    success: input.success ?? inferredSuccess,
    durationMs: Date.now() - input.startedAt,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: input.metadata,
  });
}

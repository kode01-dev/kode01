import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { MONITORED_EXTERNAL_ENDPOINTS } from '@/features/api-monitoring/server/constants';
import { getAdminSessionOrNull, parseApiMonitorRange } from '@/app/api/admin/api-monitoring/_lib';

const querySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).optional(),
  endpoint: z.string().trim().optional(),
  status: z.enum(['all', 'success', 'error', 'auth_error', 'rate_limited']).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

type ApiMonitorEventRow = {
  id: string;
  endpoint: string;
  channel: 'inbound' | 'outbound';
  method: string | null;
  status_code: number | null;
  success: boolean;
  duration_ms: number;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const DEFAULT_LIMIT = 50;

function normalizeEndpointFilter(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.events.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      range: url.searchParams.get('range') ?? undefined,
      endpoint: url.searchParams.get('endpoint') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.events.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { range, endpoint, status, cursor, limit } = parsed.data;
    const { range: normalizedRange, fromDate } = parseApiMonitorRange(range ?? null);
    const fromIso = fromDate.toISOString();
    const endpointFilter = normalizeEndpointFilter(endpoint);

    const admin = createAdminClient();
    let query = admin
      .from('external_api_call_events')
      .select(
        'id, endpoint, channel, method, status_code, success, duration_ms, request_id, ip_address, user_agent, metadata, created_at',
      )
      .gte('created_at', fromIso)
      .order('created_at', { ascending: false })
      .limit((limit ?? DEFAULT_LIMIT) + 1);

    if (endpointFilter) {
      query = query.eq('endpoint', endpointFilter);
    }

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    if (status === 'success') {
      query = query.eq('success', true);
    } else if (status === 'error') {
      query = query.eq('success', false);
    } else if (status === 'auth_error') {
      query = query.in('status_code', [401, 403]);
    } else if (status === 'rate_limited') {
      query = query.eq('status_code', 429);
    }

    const { data, error } = await query;
    if (error) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.events.failed.query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          error_message: error.message,
          endpoint_filter: endpointFilter,
          status_filter: status ?? 'all',
          range: normalizedRange,
        },
      });
      return NextResponse.json({ error: 'Failed to load API monitor events' }, { status: 500 });
    }

    const rows = (data ?? []) as ApiMonitorEventRow[];
    const pageSize = limit ?? DEFAULT_LIMIT;
    const pageRows = rows.slice(0, pageSize);
    const nextCursor = rows.length > pageSize ? pageRows[pageRows.length - 1]?.created_at ?? null : null;

    return NextResponse.json({
      data: pageRows,
      nextCursor,
      range: normalizedRange,
      monitoredEndpoints: [...MONITORED_EXTERNAL_ENDPOINTS],
    });
  } catch (error) {
    console.error('GET /api/admin/api-monitoring/events error:', error);
    await logAuditEvent({
      eventType: 'admin.api_monitoring.events.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

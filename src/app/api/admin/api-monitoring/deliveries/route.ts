import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '@/app/api/admin/api-monitoring/_lib';

const querySchema = z.object({
  status: z.enum(['all', 'failed', 'retrying']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

type DeliveryRow = {
  id: string;
  event_id: string;
  event_type: string;
  endpoint_url: string;
  status: 'pending' | 'retrying' | 'sent' | 'failed' | 'cancelled';
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_response_status: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.deliveries.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.deliveries.failed.validation',
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

    const status = parsed.data.status ?? 'all';
    const limit = parsed.data.limit ?? DEFAULT_LIMIT;
    const admin = createAdminClient();

    let query = admin
      .from('license_webhook_deliveries')
      .select(
        'id, event_id, event_type, endpoint_url, status, attempt_count, max_attempts, next_attempt_at, last_attempt_at, last_response_status, last_error, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (status !== 'all') {
      query = query.eq('status', status);
    } else {
      query = query.in('status', ['failed', 'retrying']);
    }

    const { data, error } = await query;
    if (error) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.deliveries.failed.query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: error.message, status_filter: status },
      });
      return NextResponse.json({ error: 'Failed to load delivery incidents' }, { status: 500 });
    }

    return NextResponse.json({
      data: (data ?? []) as DeliveryRow[],
    });
  } catch (error) {
    console.error('GET /api/admin/api-monitoring/deliveries error:', error);
    await logAuditEvent({
      eventType: 'admin.api_monitoring.deliveries.failed.internal_error',
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

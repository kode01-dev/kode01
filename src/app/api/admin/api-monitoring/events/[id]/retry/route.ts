import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { invokeEdgeFunction } from '@/lib/edge/invoke';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '@/app/api/admin/api-monitoring/_lib';

const paramsSchema = z.object({
  id: z.string().trim().min(3).max(255).regex(/^[a-zA-Z0-9._:-]+$/),
});

type StripeWebhookEventRow = {
  event_id: string;
  type: string;
  status: 'processing' | 'processed' | 'failed';
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
};

async function triggerStripeWebhookReplay(eventId: string, requestId: string) {
  const upstream = await invokeEdgeFunction({
    functionName: 'stripe-webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    requestId,
    body: JSON.stringify({
      replay_event_id: eventId,
      trigger: 'admin_replay',
    }),
  });

  const rawBody = await upstream.text().catch(() => '');
  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = rawBody;
    }
  }

  return {
    ok: upstream.ok,
    status: upstream.status,
    payload,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  let eventId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.events.retry.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const resolvedParams = await params;
    const parsed = paramsSchema.safeParse(resolvedParams);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.events.retry.failed.validation',
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
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }
    eventId = parsed.data.id;

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from('stripe_webhook_events')
      .select('event_id, type, status, error_message, processed_at, created_at')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingError) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.events.retry.failed.lookup',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          event_id: eventId,
          error_message: existingError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to load webhook event' }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Webhook event not found' }, { status: 404 });
    }

    const existingRow = existing as StripeWebhookEventRow;
    if (existingRow.status === 'processing') {
      return NextResponse.json({
        event: existingRow,
        replay: {
          triggered: false,
          skipped: true,
          reason: 'already_processing',
        },
      }, { status: 409 });
    }

    if (existingRow.status === 'processed') {
      return NextResponse.json({
        event: existingRow,
        replay: {
          triggered: false,
          skipped: true,
          reason: 'already_processed',
        },
      });
    }

    const replayResult = await triggerStripeWebhookReplay(eventId, request.headers.get('x-request-id') ?? eventId);

    const { data: refreshed } = await admin
      .from('stripe_webhook_events')
      .select('event_id, type, status, error_message, processed_at, created_at')
      .eq('event_id', eventId)
      .maybeSingle();

    await logAuditEvent({
      eventType: replayResult.ok
        ? 'admin.api_monitoring.events.retry.success'
        : 'admin.api_monitoring.events.retry.failed.upstream',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        event_id: eventId,
        previous_status: existingRow.status,
        upstream_status: replayResult.status,
      },
    });

    return NextResponse.json({
      event: (refreshed as StripeWebhookEventRow | null) ?? existingRow,
      replay: {
        triggered: replayResult.ok,
        status: replayResult.status,
        payload: replayResult.payload,
      },
    }, { status: replayResult.ok ? 200 : 502 });
  } catch (error) {
    console.error('POST /api/admin/api-monitoring/events/[id]/retry error:', error);
    await logAuditEvent({
      eventType: 'admin.api_monitoring.events.retry.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        event_id: eventId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

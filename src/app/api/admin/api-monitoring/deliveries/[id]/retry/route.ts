import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl, getServerEnv } from '@/lib/env/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '@/app/api/admin/api-monitoring/_lib';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type DeliveryRow = {
  id: string;
  status: 'pending' | 'retrying' | 'sent' | 'failed' | 'cancelled';
  next_attempt_at: string;
  attempt_count: number;
  max_attempts: number;
  updated_at: string;
};

async function triggerLicenseWebhookWorker() {
  const env = getServerEnv();
  const cronSecret = env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return {
      triggered: false,
      reason: 'missing_cron_secret',
      status: null,
    } as const;
  }

  try {
    const baseUrl = getAppBaseUrl();
    const response = await fetch(`${baseUrl}/api/cron/license-webhooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      cache: 'no-store',
    });

    return {
      triggered: response.ok,
      reason: response.ok ? null : `worker_http_${response.status}`,
      status: response.status,
    } as const;
  } catch (error) {
    return {
      triggered: false,
      reason: error instanceof Error ? error.message : String(error),
      status: null,
    } as const;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  let deliveryId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.deliveries.retry.failed.forbidden',
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
        eventType: 'admin.api_monitoring.deliveries.retry.failed.validation',
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
      return NextResponse.json({ error: 'Invalid delivery id' }, { status: 400 });
    }
    deliveryId = parsed.data.id;

    const admin = createAdminClient();
    const { data: existingDelivery, error: fetchError } = await admin
      .from('license_webhook_deliveries')
      .select('id, status, next_attempt_at, attempt_count, max_attempts, updated_at')
      .eq('id', deliveryId)
      .maybeSingle();

    if (fetchError) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.deliveries.retry.failed.lookup',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { delivery_id: deliveryId, error_message: fetchError.message },
      });
      return NextResponse.json({ error: 'Failed to load delivery' }, { status: 500 });
    }

    if (!existingDelivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
    }

    if (existingDelivery.status === 'sent') {
      return NextResponse.json({ error: 'Delivery is already sent' }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const { data: updatedDelivery, error: updateError } = await admin
      .from('license_webhook_deliveries')
      .update({
        status: 'retrying',
        next_attempt_at: nowIso,
        last_error: null,
        last_response_status: null,
        updated_at: nowIso,
      })
      .eq('id', deliveryId)
      .select('id, status, next_attempt_at, attempt_count, max_attempts, updated_at')
      .maybeSingle();

    if (updateError || !updatedDelivery) {
      await logAuditEvent({
        eventType: 'admin.api_monitoring.deliveries.retry.failed.update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          delivery_id: deliveryId,
          error_message: updateError?.message ?? 'Unknown update error',
        },
      });
      return NextResponse.json({ error: 'Failed to requeue delivery' }, { status: 500 });
    }

    const workerTrigger = await triggerLicenseWebhookWorker();

    await logAuditEvent({
      eventType: 'admin.api_monitoring.deliveries.retry.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        delivery_id: deliveryId,
        previous_status: existingDelivery.status,
        worker_triggered: workerTrigger.triggered,
        worker_reason: workerTrigger.reason,
        worker_status: workerTrigger.status,
      },
    });

    return NextResponse.json({
      delivery: updatedDelivery as DeliveryRow,
      worker: workerTrigger,
    });
  } catch (error) {
    console.error('POST /api/admin/api-monitoring/deliveries/[id]/retry error:', error);
    await logAuditEvent({
      eventType: 'admin.api_monitoring.deliveries.retry.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        delivery_id: deliveryId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

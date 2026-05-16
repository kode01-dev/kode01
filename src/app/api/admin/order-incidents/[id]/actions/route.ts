import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '../../_lib';
import { adminIncidentActionSchema } from '@/features/order-incidents/server/schemas';
import { sendOrderAccessNotification } from '@/features/order-incidents/server/notifications';

type IncidentRow = {
  id: string;
  purchase_id: string;
  buyer_id: string;
  product_id: string;
  products:
    | { title: string | null; slug: string | null }
    | Array<{ title: string | null; slug: string | null }>
    | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  let incidentId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.actions.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const resolvedParams = await params;
    incidentId = resolvedParams.id;
    const payload = await request.json().catch(() => null);
    const parsed = adminIncidentActionSchema.safeParse(payload);

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.actions.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: incidentId,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { actionType, locale } = parsed.data;
    const admin = createAdminClient();

    const { data: incident, error: incidentError } = await admin
      .from('purchase_incidents')
      .select(`
        id,
        purchase_id,
        buyer_id,
        product_id,
        products!purchase_incidents_product_id_fkey (
          title,
          slug
        )
      `)
      .eq('id', incidentId)
      .maybeSingle();

    if (incidentError) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.actions.failed.query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: incidentId,
          error_message: incidentError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to load incident' }, { status: 500 });
    }

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const row = incident as IncidentRow;
    const productRelation = Array.isArray(row.products) ? row.products[0] : row.products;

    let scheduledEmailId: string | null = null;
    if (actionType === 'resend_purchase_confirmation') {
      const { data: scheduledEmail, error: scheduleError } = await admin
        .from('scheduled_emails')
        .insert({
          purchase_id: row.purchase_id,
          buyer_id: row.buyer_id,
          email_type: 'purchase_confirmation',
          scheduled_for: new Date().toISOString(),
          status: 'pending',
        })
        .select('id')
        .single();

      if (scheduleError || !scheduledEmail) {
        await logAuditEvent({
          eventType: 'admin.order_incidents.actions.failed.schedule_email',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            incident_id: incidentId,
            error_message: scheduleError?.message ?? 'unknown',
          },
        });
        return NextResponse.json({ error: 'Failed to schedule purchase confirmation email' }, { status: 500 });
      }

      scheduledEmailId = scheduledEmail.id;
    }

    await admin
      .from('purchase_incident_actions')
      .insert({
        incident_id: incidentId,
        action_type: actionType,
        actor_user_id: actorUserId,
        actor_role: 'admin',
        metadata: {
          scheduled_email_id: scheduledEmailId,
        },
      });

    await sendOrderAccessNotification({
      recipientUserId: row.buyer_id,
      locale: locale ?? 'en',
      incidentId,
      productTitle: productRelation?.title ?? null,
      productSlug: productRelation?.slug ?? null,
      kind: actionType,
    });

    await logAuditEvent({
      eventType: 'admin.order_incidents.actions.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: incidentId,
        action_type: actionType,
        scheduled_email_id: scheduledEmailId,
      },
    });

    return NextResponse.json({
      incidentId,
      actionType,
      scheduledEmailId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('POST /api/admin/order-incidents/[id]/actions error:', error);
    await logAuditEvent({
      eventType: 'admin.order_incidents.actions.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: incidentId,
        error_message: errorMessage,
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

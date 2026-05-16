import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { vendorRespondIncidentSchema } from '@/features/order-incidents/server/schemas';
import { getVendorSessionOrNull } from '../../_lib';

type IncidentRow = {
  id: string;
  product_id: string;
  status: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  let incidentId: string | null = null;

  try {
    const vendorSession = await getVendorSessionOrNull();
    if (!vendorSession) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.respond.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = vendorSession.userId;

    incidentId = (await params).id;
    const payload = await request.json().catch(() => null);
    const parsed = vendorRespondIncidentSchema.safeParse(payload);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.respond.failed.validation',
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

    const admin = createAdminClient();
    const { data: incidentData, error: incidentError } = await admin
      .from('purchase_incidents')
      .select('id, product_id, status')
      .eq('id', incidentId)
      .maybeSingle();

    if (incidentError) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.respond.failed.incident_query',
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

    if (!incidentData) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const incident = incidentData as IncidentRow;
    if (incident.status === 'resolved' || incident.status === 'rejected') {
      return NextResponse.json({ error: 'Incident is already closed' }, { status: 409 });
    }

    const { data: productData, error: productError } = await admin
      .from('products')
      .select('id')
      .eq('id', incident.product_id)
      .eq('seller_id', actorUserId)
      .maybeSingle();

    if (productError) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.respond.failed.product_query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: incidentId,
          error_message: productError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to validate product ownership' }, { status: 500 });
    }

    if (!productData) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const actionType = parsed.data.proposedRefundAmount ? 'vendor_refund_proposed' : 'vendor_response';
    const message = parsed.data.message.trim();
    const proposedRefundAmount = parsed.data.proposedRefundAmount ?? null;

    const { error: actionError } = await admin
      .from('purchase_incident_actions')
      .insert({
        incident_id: incident.id,
        action_type: actionType,
        actor_user_id: actorUserId,
        actor_role: 'vendor',
        metadata: {
          message: message || null,
          proposed_refund_amount: proposedRefundAmount,
        },
      });

    if (actionError) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.respond.failed.action_insert',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: incident.id,
          error_message: actionError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
    }

    if (incident.status === 'open') {
      await admin
        .from('purchase_incidents')
        .update({ status: 'in_progress' })
        .eq('id', incident.id);
    }

    await logAuditEvent({
      eventType: 'vendor.order_incidents.respond.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: incident.id,
        action_type: actionType,
        has_message: Boolean(message),
        proposed_refund_amount: proposedRefundAmount,
      },
    });

    return NextResponse.json({
      incidentId: incident.id,
      actionType,
      proposedRefundAmount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('POST /api/vendor/order-incidents/[id]/respond error:', error);
    await logAuditEvent({
      eventType: 'vendor.order_incidents.respond.failed.internal_error',
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

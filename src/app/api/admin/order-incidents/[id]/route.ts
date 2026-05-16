import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '../_lib';
import { adminPatchOrderIncidentSchema } from '@/features/order-incidents/server/schemas';
import type {
  OrderIncidentDecision,
  OrderIncidentIssueType,
  OrderIncidentResolution,
  OrderIncidentStatus,
} from '@/features/order-incidents/types';
import { sendOrderIncidentStatusNotification } from '@/features/order-incidents/server/notifications';

type IncidentRow = {
  id: string;
  buyer_id: string;
  issue_type: OrderIncidentIssueType;
  status: OrderIncidentStatus;
  decision: OrderIncidentDecision | null;
  resolution: OrderIncidentResolution | null;
  product_id: string;
  products:
    | { title: string | null; slug: string | null }
    | Array<{ title: string | null; slug: string | null }>
    | null;
};

function normalizeProductTitle(products: IncidentRow['products']): string | null {
  const relation = Array.isArray(products) ? products[0] : products;
  return relation?.title ?? null;
}

export async function PATCH(
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
        eventType: 'admin.order_incidents.update.failed.forbidden',
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
    const parsed = adminPatchOrderIncidentSchema.safeParse(payload);

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.update.failed.validation',
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

    const { status, decision, resolution, locale } = parsed.data;
    const admin = createAdminClient();

    const { data: existingIncident, error: incidentError } = await admin
      .from('purchase_incidents')
      .select(`
        id,
        buyer_id,
        issue_type,
        status,
        decision,
        resolution,
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
        eventType: 'admin.order_incidents.update.failed.query',
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

    if (!existingIncident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    const row = existingIncident as IncidentRow;
    const isClosed = status === 'resolved' || status === 'rejected';
    const nextDecision = isClosed ? (decision ?? null) : null;
    const nextResolution =
      status === 'rejected'
        ? (resolution ?? 'rejected')
        : (resolution ?? row.resolution ?? null);
    const nowIso = new Date().toISOString();
    const closedAt = isClosed ? nowIso : null;

    const { error: updateError } = await admin
      .from('purchase_incidents')
      .update({
        status,
        decision: nextDecision,
        resolution: nextResolution,
        closed_at: closedAt,
        assigned_admin_id: actorUserId,
      })
      .eq('id', incidentId);

    if (updateError) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.update.failed.update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: incidentId,
          error_message: updateError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to update incident' }, { status: 500 });
    }

    await admin
      .from('purchase_incident_actions')
      .insert({
        incident_id: incidentId,
        action_type: 'status_updated',
        actor_user_id: actorUserId,
        actor_role: 'admin',
        metadata: {
          previous_status: row.status,
          next_status: status,
          previous_decision: row.decision,
          next_decision: nextDecision,
          previous_resolution: row.resolution,
          next_resolution: nextResolution,
        },
      });

    await sendOrderIncidentStatusNotification({
      recipientUserId: row.buyer_id,
      locale: locale ?? 'en',
      incidentId,
      issueType: row.issue_type,
      status,
      decision: nextDecision,
      productTitle: normalizeProductTitle(row.products),
    });

    await logAuditEvent({
      eventType: 'admin.order_incidents.update.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: incidentId,
        previous_status: row.status,
        next_status: status,
        previous_decision: row.decision,
        next_decision: nextDecision,
        previous_resolution: row.resolution,
        next_resolution: nextResolution,
      },
    });

    return NextResponse.json({
      id: incidentId,
      status,
      decision: nextDecision,
      resolution: nextResolution,
      closedAt,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('PATCH /api/admin/order-incidents/[id] error:', error);
    await logAuditEvent({
      eventType: 'admin.order_incidents.update.failed.internal_error',
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

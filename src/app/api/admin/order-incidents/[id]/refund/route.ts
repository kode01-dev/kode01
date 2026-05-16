import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '../../_lib';
import { adminRefundOrderIncidentSchema } from '@/features/order-incidents/server/schemas';
import { sendOrderIncidentStatusNotification } from '@/features/order-incidents/server/notifications';

export const runtime = 'nodejs';

type RefundIncidentRow = {
  id: string;
  purchase_id: string;
  buyer_id: string;
  issue_type: 'purchase_info_missing' | 'content_missing' | 'license_issue' | 'other';
  status: string;
  resolution: string | null;
  stripe_refund_id: string | null;
  products:
    | { title: string | null }
    | Array<{ title: string | null }>
    | null;
  purchases:
    | {
        id: string;
        amount: number | null;
        currency: string | null;
        status: string | null;
        stripe_payment_intent_id: string | null;
      }
    | Array<{
        id: string;
        amount: number | null;
        currency: string | null;
        status: string | null;
        stripe_payment_intent_id: string | null;
      }>
    | null;
};

function normalizeProductTitle(products: RefundIncidentRow['products']): string | null {
  const relation = Array.isArray(products) ? products[0] : products;
  return relation?.title ?? null;
}

function normalizePurchase(purchases: RefundIncidentRow['purchases']) {
  return Array.isArray(purchases) ? purchases[0] : purchases;
}

function toMinorAmount(amount: number | null): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

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
        eventType: 'admin.order_incidents.refund.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    incidentId = (await params).id;
    const payload = await request.json().catch(() => null);
    const parsed = adminRefundOrderIncidentSchema.safeParse(payload);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.refund.failed.validation',
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
      .select(`
        id,
        purchase_id,
        buyer_id,
        issue_type,
        status,
        resolution,
        stripe_refund_id,
        products!purchase_incidents_product_id_fkey (
          title
        ),
        purchases!purchase_incidents_purchase_id_fkey (
          id,
          amount,
          currency,
          status,
          stripe_payment_intent_id
        )
      `)
      .eq('id', incidentId)
      .maybeSingle();

    if (incidentError) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.refund.failed.query',
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

    const incident = incidentData as RefundIncidentRow;
    if (incident.resolution === 'refunded' && !parsed.data.amount) {
      return NextResponse.json({ error: 'Incident is already fully refunded' }, { status: 409 });
    }

    const purchase = normalizePurchase(incident.purchases);
    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found for this incident' }, { status: 404 });
    }

    if (!purchase.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'Purchase has no Stripe payment intent' }, { status: 400 });
    }

    const purchaseMinorAmount = toMinorAmount(purchase.amount);
    if (purchaseMinorAmount <= 0) {
      return NextResponse.json({ error: 'Purchase amount is invalid for refund' }, { status: 400 });
    }

    const requestedAmount = parsed.data.amount ?? purchaseMinorAmount;
    if (requestedAmount > purchaseMinorAmount) {
      return NextResponse.json({ error: 'Refund amount exceeds purchase amount' }, { status: 400 });
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: purchase.stripe_payment_intent_id,
        amount: requestedAmount,
        reason: parsed.data.reason,
        metadata: {
          incident_id: incident.id,
          purchase_id: purchase.id,
          admin_user_id: actorUserId,
        },
      },
      {
        idempotencyKey: `incident:${incident.id}:refund:${requestedAmount}`,
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: refundRecordError } = await (admin as any)
      .from('refunds')
      .insert({
        purchase_id: purchase.id,
        amount_cents: refund.amount,
        currency: (purchase.currency ?? refund.currency ?? 'cad').toLowerCase(),
        reason: parsed.data.reason,
        stripe_refund_id: refund.id,
        status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
      });

    if (refundRecordError && refundRecordError.code !== '23505') {
      return NextResponse.json({ error: 'Refund created but refund record insert failed' }, { status: 500 });
    }

    const resolution = requestedAmount < purchaseMinorAmount ? 'partial_refund' : 'refunded';
    const nowIso = new Date().toISOString();

    const { error: incidentUpdateError } = await admin
      .from('purchase_incidents')
      .update({
        status: 'resolved',
        decision: 'confirmed',
        resolution,
        stripe_refund_id: refund.id,
        refund_amount: refund.amount,
        assigned_admin_id: actorUserId,
        closed_at: nowIso,
      })
      .eq('id', incident.id);

    if (incidentUpdateError) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.refund.failed.update_incident',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: incident.id,
          stripe_refund_id: refund.id,
          error_message: incidentUpdateError.message,
        },
      });
      return NextResponse.json({ error: 'Refund created but incident update failed' }, { status: 500 });
    }

    if (resolution === 'refunded') {
      await admin
        .from('purchases')
        .update({ status: 'refunded' })
        .eq('id', purchase.id);
    }

    await admin
      .from('purchase_incident_actions')
      .insert({
        incident_id: incident.id,
        action_type: 'refund_processed',
        actor_user_id: actorUserId,
        actor_role: 'admin',
        metadata: {
          stripe_refund_id: refund.id,
          refund_amount: refund.amount,
          currency: purchase.currency ?? null,
          resolution,
          reason: parsed.data.reason ?? null,
        },
      });

    await sendOrderIncidentStatusNotification({
      recipientUserId: incident.buyer_id,
      locale: parsed.data.locale ?? 'en',
      incidentId: incident.id,
      issueType: incident.issue_type,
      status: 'resolved',
      decision: 'confirmed',
      productTitle: normalizeProductTitle(incident.products),
    });

    await logAuditEvent({
      eventType: 'admin.order_incidents.refund.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: incident.id,
        stripe_refund_id: refund.id,
        refund_amount: refund.amount,
        currency: purchase.currency ?? null,
        resolution,
      },
    });

    return NextResponse.json({
      incidentId: incident.id,
      stripeRefundId: refund.id,
      refundAmount: refund.amount,
      resolution,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('POST /api/admin/order-incidents/[id]/refund error:', error);
    await logAuditEvent({
      eventType: 'admin.order_incidents.refund.failed.internal_error',
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

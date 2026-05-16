import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { createOrderIncidentSchema } from '@/features/order-incidents/server/schemas';
import type { BuyerOrderIncidentListItem } from '@/features/order-incidents/types';
import { computeIncidentSlaDeadline } from '@/features/order-incidents/server/sla';

type PurchaseRow = {
  id: string;
  buyer_id: string;
  product_id: string;
  status: string | null;
};

type IncidentRow = {
  id: string;
  purchase_id: string;
  product_id: string;
  issue_type: BuyerOrderIncidentListItem['issueType'];
  status: BuyerOrderIncidentListItem['status'];
  decision: BuyerOrderIncidentListItem['decision'];
  resolution: BuyerOrderIncidentListItem['resolution'];
  opened_by: BuyerOrderIncidentListItem['openedBy'];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  evidence_urls: string[] | null;
  sla_deadline_at: string | null;
  stripe_refund_id: string | null;
  refund_amount: number | null;
  products: { title: string | null; slug: string | null } | Array<{ title: string | null; slug: string | null }> | null;
};

function mapIncidentRow(row: IncidentRow): BuyerOrderIncidentListItem {
  const productRelation = row.products;
  const product = Array.isArray(productRelation) ? productRelation[0] : productRelation;

  return {
    id: row.id,
    purchaseId: row.purchase_id,
    productId: row.product_id,
    productTitle: product?.title ?? null,
    productSlug: product?.slug ?? null,
    issueType: row.issue_type,
    status: row.status,
    decision: row.decision,
    resolution: row.resolution,
    openedBy: row.opened_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    evidenceUrls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
    slaDeadlineAt: row.sla_deadline_at,
    stripeRefundId: row.stripe_refund_id,
    refundAmount: typeof row.refund_amount === 'number' ? row.refund_amount : null,
  };
}

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      await logAuditEvent({
        eventType: 'order_incidents.list.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;

    const { data, error } = await supabase
      .from('purchase_incidents')
      .select(`
        id,
        purchase_id,
        product_id,
        issue_type,
        status,
        decision,
        resolution,
        opened_by,
        created_at,
        updated_at,
        closed_at,
        evidence_urls,
        sla_deadline_at,
        stripe_refund_id,
        refund_amount,
        products (
          title,
          slug
        )
      `)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      await logAuditEvent({
        eventType: 'order_incidents.list.failed.query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: error.message },
      });
      return NextResponse.json({ error: 'Failed to load incidents' }, { status: 500 });
    }

    const incidents = ((data ?? []) as IncidentRow[]).map(mapIncidentRow);
    return NextResponse.json({ incidents });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('GET /api/order-incidents error:', error);
    await logAuditEvent({
      eventType: 'order_incidents.list.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: errorMessage },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;

    const payload = await request.json().catch(() => null);
    const parsed = createOrderIncidentSchema.safeParse(payload);

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.validation',
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
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { purchaseId, issueType, evidenceUrls } = parsed.data;

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id, buyer_id, product_id, status')
      .eq('id', purchaseId)
      .eq('buyer_id', user.id)
      .maybeSingle();

    if (purchaseError) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.purchase_query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          purchase_id: purchaseId,
          error_message: purchaseError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to validate purchase' }, { status: 500 });
    }

    if (!purchase) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.purchase_not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { purchase_id: purchaseId },
      });
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const purchaseRow = purchase as PurchaseRow;
    const allowedStatuses = new Set(['completed', 'refunded']);
    if (!purchaseRow.status || !allowedStatuses.has(purchaseRow.status)) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.purchase_status',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          purchase_id: purchaseId,
          purchase_status: purchaseRow.status,
        },
      });
      return NextResponse.json({ error: 'Purchase is not eligible for incident reporting' }, { status: 400 });
    }

    const { data: existingIncident } = await supabase
      .from('purchase_incidents')
      .select('id')
      .eq('purchase_id', purchaseRow.id)
      .eq('buyer_id', user.id)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingIncident?.id) {
      return NextResponse.json(
        { error: 'An incident is already open for this purchase', incidentId: existingIncident.id },
        { status: 409 },
      );
    }

    const admin = createAdminClient();
    const { data: createdIncident, error: createError } = await admin
      .from('purchase_incidents')
      .insert({
        purchase_id: purchaseRow.id,
        buyer_id: user.id,
        product_id: purchaseRow.product_id,
        issue_type: issueType,
        status: 'open',
        decision: null,
        opened_by: 'buyer',
        evidence_urls: evidenceUrls,
        sla_deadline_at: computeIncidentSlaDeadline(new Date()),
      })
      .select('id')
      .single();

    if (createError || !createdIncident) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.insert',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          purchase_id: purchaseId,
          issue_type: issueType,
          evidence_count: evidenceUrls.length,
          error_message: createError?.message ?? 'unknown',
        },
      });
      return NextResponse.json({ error: 'Failed to create incident' }, { status: 500 });
    }

    const { error: actionError } = await admin
      .from('purchase_incident_actions')
      .insert({
        incident_id: createdIncident.id,
        action_type: 'incident_opened',
        actor_user_id: user.id,
        actor_role: 'buyer',
        metadata: {
          opened_by: 'buyer',
          issue_type: issueType,
          purchase_id: purchaseId,
          evidence_count: evidenceUrls.length,
        },
      });

    if (actionError) {
      await logAuditEvent({
        eventType: 'order_incidents.create.failed.action_log',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          incident_id: createdIncident.id,
          error_message: actionError.message,
        },
      });
    }

    await supabase.from('recommendation_events').insert({
      user_id: user.id,
      event_type: 'refund_requested',
      source_type: 'refund',
      target_product_id: purchaseRow.product_id,
      signal_payload: {
        incident_id: createdIncident.id,
        purchase_id: purchaseId,
        issue_type: issueType,
      },
    });

    await logAuditEvent({
      eventType: 'order_incidents.create.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: createdIncident.id,
        issue_type: issueType,
        purchase_id: purchaseId,
        evidence_count: evidenceUrls.length,
      },
    });

    return NextResponse.json(
      {
        incidentId: createdIncident.id,
      },
      { status: 201 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('POST /api/order-incidents error:', error);
    await logAuditEvent({
      eventType: 'order_incidents.create.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: errorMessage },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

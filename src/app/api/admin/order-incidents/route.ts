import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from './_lib';
import {
  adminListOrderIncidentsQuerySchema,
  createOrderIncidentSchema,
} from '@/features/order-incidents/server/schemas';
import type {
  AdminOrderIncidentListItem,
  OrderIncidentActionTimelineItem,
  OrderIncidentStatus,
} from '@/features/order-incidents/types';
import { sendOrderIncidentStatusNotification } from '@/features/order-incidents/server/notifications';
import { computeIncidentSlaDeadline } from '@/features/order-incidents/server/sla';

type IncidentRow = {
  id: string;
  purchase_id: string;
  buyer_id: string;
  product_id: string;
  issue_type: AdminOrderIncidentListItem['issueType'];
  status: AdminOrderIncidentListItem['status'];
  decision: AdminOrderIncidentListItem['decision'];
  resolution: AdminOrderIncidentListItem['resolution'];
  opened_by: AdminOrderIncidentListItem['openedBy'];
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  evidence_urls: string[] | null;
  sla_deadline_at: string | null;
  stripe_refund_id: string | null;
  refund_amount: number | null;
  products:
    | { title: string | null; slug: string | null }
    | Array<{ title: string | null; slug: string | null }>
    | null;
  buyer:
    | { display_name: string | null; shop_name: string | null }
    | Array<{ display_name: string | null; shop_name: string | null }>
    | null;
  purchases:
    | { amount: number | null; status: string | null; created_at: string | null; currency: string | null }
    | Array<{ amount: number | null; status: string | null; created_at: string | null; currency: string | null }>
    | null;
};

type IncidentActionRow = {
  id: string;
  incident_id: string;
  action_type: string;
  actor_role: OrderIncidentActionTimelineItem['actorRole'];
  actor_user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type PurchaseRow = {
  id: string;
  buyer_id: string;
  product_id: string;
  status: string | null;
};

function mapIncidentRow(row: IncidentRow): AdminOrderIncidentListItem {
  const productRelation = row.products;
  const product = Array.isArray(productRelation) ? productRelation[0] : productRelation;
  const buyerRelation = row.buyer;
  const buyer = Array.isArray(buyerRelation) ? buyerRelation[0] : buyerRelation;
  const purchaseRelation = row.purchases;
  const purchase = Array.isArray(purchaseRelation) ? purchaseRelation[0] : purchaseRelation;

  return {
    id: row.id,
    purchaseId: row.purchase_id,
    buyerId: row.buyer_id,
    productId: row.product_id,
    issueType: row.issue_type,
    status: row.status,
    decision: row.decision,
    resolution: row.resolution,
    openedBy: row.opened_by,
    assignedAdminId: row.assigned_admin_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    evidenceUrls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
    slaDeadlineAt: row.sla_deadline_at,
    stripeRefundId: row.stripe_refund_id,
    refundAmount: typeof row.refund_amount === 'number' ? row.refund_amount : null,
    productTitle: product?.title ?? null,
    productSlug: product?.slug ?? null,
    buyerDisplayName: buyer?.display_name ?? null,
    buyerShopName: buyer?.shop_name ?? null,
    purchaseAmount: purchase?.amount ?? null,
    purchaseStatus: purchase?.status ?? null,
    purchaseCreatedAt: purchase?.created_at ?? null,
    purchaseCurrency: purchase?.currency ?? null,
    timeline: [],
  };
}

function matchesAdminSearch(item: AdminOrderIncidentListItem, q: string): boolean {
  if (!q) return true;
  const normalized = q.toLowerCase();
  const haystack = [
    item.id,
    item.purchaseId,
    item.productId,
    item.productTitle ?? '',
    item.buyerDisplayName ?? '',
    item.buyerShopName ?? '',
    item.issueType,
    item.status,
    item.resolution ?? '',
    item.decision ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

function buildStatusSummary(items: AdminOrderIncidentListItem[]) {
  const counts: Record<OrderIncidentStatus, number> = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    rejected: 0,
  };

  for (const item of items) {
    counts[item.status] += 1;
  }

  return {
    total: items.length,
    open: counts.open,
    inProgress: counts.in_progress,
    resolved: counts.resolved,
    rejected: counts.rejected,
  };
}

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.list.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const params = new URL(request.url).searchParams;
    const parsed = adminListOrderIncidentsQuerySchema.safeParse({
      page: params.get('page') ?? undefined,
      pageSize: params.get('pageSize') ?? undefined,
      q: params.get('q') ?? undefined,
      status: params.get('status') ?? undefined,
      issueType: params.get('issueType') ?? undefined,
      decision: params.get('decision') ?? undefined,
    });

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.list.failed.validation',
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

    const { page, pageSize, q, status, issueType, decision } = parsed.data;
    const admin = createAdminClient();

    let query = admin
      .from('purchase_incidents')
      .select(`
        id,
        purchase_id,
        buyer_id,
        product_id,
        issue_type,
        status,
        decision,
        resolution,
        opened_by,
        assigned_admin_id,
        created_at,
        updated_at,
        closed_at,
        evidence_urls,
        sla_deadline_at,
        stripe_refund_id,
        refund_amount,
        products!purchase_incidents_product_id_fkey (
          title,
          slug
        ),
        buyer:profiles!purchase_incidents_buyer_id_fkey (
          display_name,
          shop_name
        ),
        purchases!purchase_incidents_purchase_id_fkey (
          amount,
          status,
          created_at,
          currency
        )
      `)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (status !== 'all') query = query.eq('status', status);
    if (issueType !== 'all') query = query.eq('issue_type', issueType);
    if (decision !== 'all') query = query.eq('decision', decision);

    const { data, error } = await query;
    if (error) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.list.failed.query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: error.message },
      });
      return NextResponse.json({ error: 'Failed to load order incidents' }, { status: 500 });
    }

    const allItems = ((data ?? []) as IncidentRow[]).map(mapIncidentRow);
    const searchedItems = allItems.filter((item) => matchesAdminSearch(item, q));
    const total = searchedItems.length;
    const summary = buildStatusSummary(searchedItems);
    const offset = (page - 1) * pageSize;
    const rows = searchedItems.slice(offset, offset + pageSize);
    const rowIds = rows.map((row) => row.id);
    const timelineByIncidentId = new Map<string, OrderIncidentActionTimelineItem[]>();

    if (rowIds.length > 0) {
      const { data: actionsData, error: actionsError } = await admin
        .from('purchase_incident_actions')
        .select('id, incident_id, action_type, actor_role, actor_user_id, metadata, created_at')
        .in('incident_id', rowIds)
        .order('created_at', { ascending: false })
        .limit(500);

      if (actionsError) {
        await logAuditEvent({
          eventType: 'admin.order_incidents.list.failed.actions_query',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { error_message: actionsError.message },
        });
      } else {
        for (const action of (actionsData ?? []) as IncidentActionRow[]) {
          const timelineItem: OrderIncidentActionTimelineItem = {
            id: action.id,
            incidentId: action.incident_id,
            actionType: action.action_type,
            actorRole: action.actor_role,
            actorUserId: action.actor_user_id,
            createdAt: action.created_at,
            metadata: action.metadata ?? {},
          };
          const list = timelineByIncidentId.get(action.incident_id) ?? [];
          list.push(timelineItem);
          timelineByIncidentId.set(action.incident_id, list);
        }
      }
    }

    const rowsWithTimeline = rows.map((row) => ({
      ...row,
      timeline: timelineByIncidentId.get(row.id) ?? [],
    }));

    return NextResponse.json({
      data: rowsWithTimeline,
      page,
      pageSize,
      total,
      summary,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('GET /api/admin/order-incidents error:', error);
    await logAuditEvent({
      eventType: 'admin.order_incidents.list.failed.internal_error',
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
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.create.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const payload = await request.json().catch(() => null);
    const parsed = createOrderIncidentSchema.safeParse(payload);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.create.failed.validation',
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

    const { purchaseId, issueType, evidenceUrls, locale } = parsed.data;
    const admin = createAdminClient();

    const { data: purchase, error: purchaseError } = await admin
      .from('purchases')
      .select('id, buyer_id, product_id, status')
      .eq('id', purchaseId)
      .maybeSingle();

    if (purchaseError) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.create.failed.purchase_query',
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
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const purchaseRow = purchase as PurchaseRow;

    const { data: createdIncident, error: createError } = await admin
      .from('purchase_incidents')
      .insert({
        purchase_id: purchaseRow.id,
        buyer_id: purchaseRow.buyer_id,
        product_id: purchaseRow.product_id,
        issue_type: issueType,
        status: 'open',
        decision: null,
        opened_by: 'admin',
        assigned_admin_id: actorUserId,
        evidence_urls: evidenceUrls,
        sla_deadline_at: computeIncidentSlaDeadline(new Date()),
      })
      .select('id')
      .single();

    if (createError || !createdIncident) {
      await logAuditEvent({
        eventType: 'admin.order_incidents.create.failed.insert',
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

    await admin
      .from('purchase_incident_actions')
      .insert({
        incident_id: createdIncident.id,
        action_type: 'incident_opened',
        actor_user_id: actorUserId,
        actor_role: 'admin',
        metadata: {
          opened_by: 'admin',
          issue_type: issueType,
          purchase_id: purchaseId,
          evidence_count: evidenceUrls.length,
        },
      });

    const { data: productData } = await admin
      .from('products')
      .select('title')
      .eq('id', purchaseRow.product_id)
      .maybeSingle();

    await sendOrderIncidentStatusNotification({
      recipientUserId: purchaseRow.buyer_id,
      locale: locale ?? 'en',
      incidentId: createdIncident.id,
      issueType,
      status: 'open',
      decision: null,
      productTitle: productData?.title ?? null,
    });

    await logAuditEvent({
      eventType: 'admin.order_incidents.create.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        incident_id: createdIncident.id,
        purchase_id: purchaseId,
        issue_type: issueType,
        evidence_count: evidenceUrls.length,
      },
    });

    return NextResponse.json({ incidentId: createdIncident.id }, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('POST /api/admin/order-incidents error:', error);
    await logAuditEvent({
      eventType: 'admin.order_incidents.create.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: errorMessage },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

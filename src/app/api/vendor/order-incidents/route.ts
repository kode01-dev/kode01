import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import type { OrderIncidentActionTimelineItem } from '@/features/order-incidents/types';
import { getVendorSessionOrNull } from './_lib';

type VendorIncidentRow = {
  id: string;
  purchase_id: string;
  product_id: string;
  issue_type: string;
  status: string;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  sla_deadline_at: string | null;
  evidence_urls: string[] | null;
  products:
    | { title: string | null; slug: string | null }
    | Array<{ title: string | null; slug: string | null }>
    | null;
  buyer:
    | { display_name: string | null; shop_name: string | null }
    | Array<{ display_name: string | null; shop_name: string | null }>
    | null;
  purchases:
    | { amount: number | null; currency: string | null; status: string | null }
    | Array<{ amount: number | null; currency: string | null; status: string | null }>
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

export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;

  try {
    const vendorSession = await getVendorSessionOrNull();
    if (!vendorSession) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.list.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = vendorSession.userId;

    const admin = createAdminClient();
    const { data: productsData, error: productsError } = await admin
      .from('products')
      .select('id')
      .eq('seller_id', actorUserId);

    if (productsError) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.list.failed.products_query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: productsError.message },
      });
      return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
    }

    const productIds = (productsData ?? []).map((item) => item.id);
    if (productIds.length === 0) {
      return NextResponse.json({ incidents: [] });
    }

    const { data: incidentsData, error: incidentsError } = await admin
      .from('purchase_incidents')
      .select(`
        id,
        purchase_id,
        product_id,
        issue_type,
        status,
        resolution,
        created_at,
        updated_at,
        sla_deadline_at,
        evidence_urls,
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
          currency,
          status
        )
      `)
      .in('product_id', productIds)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(250);

    if (incidentsError) {
      await logAuditEvent({
        eventType: 'vendor.order_incidents.list.failed.incidents_query',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: incidentsError.message },
      });
      return NextResponse.json({ error: 'Failed to load order incidents' }, { status: 500 });
    }

    const incidents = (incidentsData ?? []) as VendorIncidentRow[];
    const incidentIds = incidents.map((incident) => incident.id);
    const timelineByIncidentId = new Map<string, OrderIncidentActionTimelineItem[]>();

    if (incidentIds.length > 0) {
      const { data: actionsData } = await admin
        .from('purchase_incident_actions')
        .select('id, incident_id, action_type, actor_role, actor_user_id, created_at, metadata')
        .in('incident_id', incidentIds)
        .order('created_at', { ascending: false })
        .limit(1000);

      for (const action of (actionsData ?? []) as IncidentActionRow[]) {
        const item: OrderIncidentActionTimelineItem = {
          id: action.id,
          incidentId: action.incident_id,
          actionType: action.action_type,
          actorRole: action.actor_role,
          actorUserId: action.actor_user_id,
          createdAt: action.created_at,
          metadata: action.metadata ?? {},
        };
        const list = timelineByIncidentId.get(action.incident_id) ?? [];
        list.push(item);
        timelineByIncidentId.set(action.incident_id, list);
      }
    }

    const payload = incidents.map((incident) => {
      const productRelation = Array.isArray(incident.products) ? incident.products[0] : incident.products;
      const buyerRelation = Array.isArray(incident.buyer) ? incident.buyer[0] : incident.buyer;
      const purchaseRelation = Array.isArray(incident.purchases) ? incident.purchases[0] : incident.purchases;

      return {
        id: incident.id,
        purchaseId: incident.purchase_id,
        productId: incident.product_id,
        issueType: incident.issue_type,
        status: incident.status,
        resolution: incident.resolution,
        createdAt: incident.created_at,
        updatedAt: incident.updated_at,
        slaDeadlineAt: incident.sla_deadline_at,
        evidenceUrls: Array.isArray(incident.evidence_urls) ? incident.evidence_urls : [],
        productTitle: productRelation?.title ?? null,
        productSlug: productRelation?.slug ?? null,
        buyerDisplayName: buyerRelation?.display_name ?? buyerRelation?.shop_name ?? null,
        purchaseAmount: purchaseRelation?.amount ?? null,
        purchaseCurrency: purchaseRelation?.currency ?? null,
        purchaseStatus: purchaseRelation?.status ?? null,
        timeline: timelineByIncidentId.get(incident.id) ?? [],
      };
    });

    return NextResponse.json({ incidents: payload });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('GET /api/vendor/order-incidents error:', error);
    await logAuditEvent({
      eventType: 'vendor.order_incidents.list.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: errorMessage },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSupabaseOrNull } from '@/app/api/admin/ads/_lib';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import {
  confirmNewsInventory,
  getConfirmedNewsInventoryWindow,
  type NewsFormat,
  reserveNewsInventory,
  resolveCampaignBlockCount,
} from '@/features/ads/server/inventory';
import { dispatchNotification } from '@/features/notifications/server/dispatch';

type InventoryAdminClient = Parameters<typeof reserveNewsInventory>[0]['admin'];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const isNewsFormat = (value: unknown): value is NewsFormat => value === 'split' || value === 'full';

  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  let campaignId: string | null = null;
  try {
    const { id } = await params;
    campaignId = id;
    const adminSession = await getAdminSupabaseOrNull(req);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'ads.campaign.approve.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const admin = createAdminClient();
    const { data: campaign, error: campaignError } = await admin
      .from('ad_campaigns')
      .select(
        `
        id,
        name,
        owner_user_id,
        status,
        duration_days,
        is_paid,
        pricing_plan_id,
        news_format,
        ad_campaign_placements (
          ad_placements (slug)
        )
      `,
      )
      .eq('id', id)
      .maybeSingle();

    if (campaignError || !campaign) {
      await logAuditEvent({
        eventType: 'ads.campaign.approve.failed.not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!campaign.is_paid) {
      await logAuditEvent({
        eventType: 'ads.campaign.approve.failed.unpaid',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: campaign.id },
      });
      return NextResponse.json({ error: 'Campaign must be paid before approval' }, { status: 400 });
    }

    const placementSlugs = ((campaign.ad_campaign_placements ?? []) as Array<{
      ad_placements?: { slug?: string | null } | null;
    }>)
      .map((row) => row.ad_placements?.slug)
      .filter((slug): slug is string => Boolean(slug));
    const hasNewsPlacement = placementSlugs.includes('news');

    let startAtIso = new Date().toISOString();
    let endAtIso = (() => {
      const endAt = new Date();
      endAt.setDate(endAt.getDate() + Math.max(1, Number(campaign.duration_days || 1)));
      return endAt.toISOString();
    })();
    let inventoryBlockStart: string | null = null;
    let inventoryBlockCount: number | null = null;

    if (hasNewsPlacement) {
      if (!isNewsFormat(campaign.news_format)) {
        await logAuditEvent({
          eventType: 'ads.campaign.approve.failed.validation',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { campaign_id: campaign.id, reason: 'missing_news_format' },
        });
        return NextResponse.json({ error: 'News format is required for news campaigns.' }, { status: 400 });
      }

      const { data: planRow, error: planError } = await admin
        .from('ad_pricing_plans')
        .select('code, duration_days')
        .eq('id', campaign.pricing_plan_id!)
        .maybeSingle();

      if (planError) {
        await logAuditEvent({
          eventType: 'ads.campaign.approve.failed.plan_lookup',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { campaign_id: campaign.id, error_message: planError.message },
        });
        return NextResponse.json({ error: planError.message }, { status: 500 });
      }

      const blockCount = resolveCampaignBlockCount({
        pricingPlanCode: planRow?.code ?? null,
        durationDays: Number(campaign.duration_days ?? planRow?.duration_days ?? 0),
      });

      const reservation = await reserveNewsInventory({
        admin: admin as unknown as InventoryAdminClient,
        campaignId: campaign.id,
        newsFormat: campaign.news_format,
        blockCount,
      });

      if (!reservation.ok) {
        await logAuditEvent({
          eventType: 'ads.campaign.approve.failed.inventory_reservation',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            campaign_id: campaign.id,
            error_code: reservation.errorCode ?? 'SLOT_FULL',
            error_message: reservation.message ?? 'Selected news slot is full for upcoming blocks.',
          },
        });
        return NextResponse.json(
          {
            error: reservation.message ?? 'Selected news slot is full for upcoming blocks.',
            code: reservation.errorCode ?? 'SLOT_FULL',
          },
          { status: 409 },
        );
      }

      await confirmNewsInventory({
        admin: admin as unknown as InventoryAdminClient,
        campaignId: campaign.id,
      });

      const window = await getConfirmedNewsInventoryWindow({
        admin: admin as unknown as InventoryAdminClient,
        campaignId: campaign.id,
      });

      if (!window) {
        await logAuditEvent({
          eventType: 'ads.campaign.approve.failed.inventory_window',
          userId: actorUserId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { campaign_id: campaign.id },
        });
        return NextResponse.json(
          { error: 'Unable to resolve confirmed news inventory window for campaign.' },
          { status: 500 },
        );
      }

      startAtIso = window.startAt;
      endAtIso = window.endAt;
      inventoryBlockStart = window.blockStart;
      inventoryBlockCount = window.blockCount;
    }

    const { error: updateError } = await admin
      .from('ad_campaigns')
      .update({
        status: 'active',
        approved_by: adminSession.userId,
        approved_at: new Date().toISOString(),
        start_at: startAtIso,
        end_at: endAtIso,
        inventory_block_start: inventoryBlockStart,
        inventory_block_count: inventoryBlockCount,
        rejected_reason: null,
      })
      .eq('id', campaign.id);

    if (updateError) {
      await logAuditEvent({
        eventType: 'ads.campaign.approve.failed.campaign_update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: campaign.id, error_message: updateError.message },
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await admin
      .from('ad_creatives')
      .update({ validation_status: 'approved', validation_errors: [] })
      .eq('campaign_id', campaign.id);

    if (campaign.owner_user_id) {
      try {
        await dispatchNotification({
          recipientUserId: campaign.owner_user_id,
          templateKey: 'ads_campaign_approved',
          locale: 'en',
          title: `Campaign approved: ${campaign.name}`,
          message: `Your campaign "${campaign.name}" is approved and now active.`,
          link: '/advertise',
          metadata: {
            campaignId: campaign.id,
            status: 'active',
            approvedAt: new Date().toISOString(),
          },
        });
      } catch (notificationError) {
        console.error('Failed to send campaign approved notification:', notificationError);
      }
    }

    await logAuditEvent({
      eventType: 'ads.campaign.approve.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: campaign.id,
        has_news_placement: hasNewsPlacement,
        start_at: startAtIso,
        end_at: endAtIso,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Approve campaign error:', error);
    await logAuditEvent({
      eventType: 'ads.campaign.approve.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: campaignId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

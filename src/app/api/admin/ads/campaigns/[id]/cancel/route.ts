import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSupabaseOrNull } from '@/app/api/admin/ads/_lib';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { dispatchNotification } from '@/features/notifications/server/dispatch';

const schema = z.object({
  reason: z.string().trim().min(3).max(600),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  let campaignId: string | null = null;
  try {
    const { id } = await params;
    campaignId = id;
    const adminSession = await getAdminSupabaseOrNull(req);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'ads.campaign.cancel.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'ads.campaign.cancel.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: campaign, error: campaignError } = await admin
      .from('ad_campaigns')
      .select('id, status, owner_user_id, name')
      .eq('id', id)
      .maybeSingle();

    if (campaignError || !campaign) {
      await logAuditEvent({
        eventType: 'ads.campaign.cancel.failed.not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'completed' || campaign.status === 'rejected') {
      await logAuditEvent({
        eventType: 'ads.campaign.cancel.failed.already_closed',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id, status: campaign.status },
      });
      return NextResponse.json({ error: 'Campaign already closed.' }, { status: 400 });
    }

    const adminReason = `[ADMIN_CANCEL_NO_REFUND] ${parsed.data.reason}`;
    const nowIso = new Date().toISOString();

    const { error: updateError } = await admin
      .from('ad_campaigns')
      .update({
        status: 'completed',
        end_at: nowIso,
        rejected_reason: adminReason,
        approved_by: adminSession.userId,
        approved_at: nowIso,
      })
      .eq('id', id);

    if (updateError) {
      await logAuditEvent({
        eventType: 'ads.campaign.cancel.failed.campaign_update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id, error_message: updateError.message },
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await admin
      .from('ad_creatives')
      .update({
        validation_status: 'rejected',
        validation_errors: [adminReason],
      })
      .eq('campaign_id', id);

    if (campaign.owner_user_id) {
      try {
        await dispatchNotification({
          recipientUserId: campaign.owner_user_id,
          templateKey: 'ads_campaign_cancelled',
          locale: 'en',
          title: `Campaign cancelled: ${campaign.name}`,
          message: `Your campaign "${campaign.name}" has been cancelled by an admin. Reason: ${parsed.data.reason}`,
          link: '/advertise',
          metadata: {
            campaignId: campaign.id,
            status: 'completed',
            reason: parsed.data.reason,
            noRefund: true,
          },
        });
      } catch (notificationError) {
        console.error('Failed to send campaign cancelled notification:', notificationError);
      }
    }

    await logAuditEvent({
      eventType: 'ads.campaign.cancel.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: id,
        reason: parsed.data.reason,
        no_refund: true,
      },
    });

    return NextResponse.json({ success: true, noRefund: true });
  } catch (error) {
    console.error('Cancel campaign error:', error);
    await logAuditEvent({
      eventType: 'ads.campaign.cancel.failed.internal_error',
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

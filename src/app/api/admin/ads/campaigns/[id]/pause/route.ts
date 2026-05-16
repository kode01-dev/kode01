import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSupabaseOrNull } from '@/app/api/admin/ads/_lib';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { dispatchNotification } from '@/features/notifications/server/dispatch';

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
        eventType: 'ads.campaign.pause.failed.forbidden',
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
      .select('id, owner_user_id, name')
      .eq('id', id)
      .maybeSingle();

    if (campaignError || !campaign) {
      await logAuditEvent({
        eventType: 'ads.campaign.pause.failed.not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { error } = await admin
      .from('ad_campaigns')
      .update({ status: 'paused' })
      .eq('id', campaign.id);

    if (error) {
      await logAuditEvent({
        eventType: 'ads.campaign.pause.failed.campaign_update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id, error_message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (campaign.owner_user_id) {
      try {
        await dispatchNotification({
          recipientUserId: campaign.owner_user_id,
          templateKey: 'ads_campaign_paused',
          locale: 'en',
          title: `Campaign paused: ${campaign.name}`,
          message: `Your campaign "${campaign.name}" has been paused by an admin.`,
          link: '/advertise',
          metadata: {
            campaignId: campaign.id,
            status: 'paused',
          },
        });
      } catch (notificationError) {
        console.error('Failed to send campaign paused notification:', notificationError);
      }
    }

    await logAuditEvent({
      eventType: 'ads.campaign.pause.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { campaign_id: campaign.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Pause campaign error:', error);
    await logAuditEvent({
      eventType: 'ads.campaign.pause.failed.internal_error',
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

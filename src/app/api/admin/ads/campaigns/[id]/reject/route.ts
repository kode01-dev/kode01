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
        eventType: 'ads.campaign.reject.failed.forbidden',
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
        eventType: 'ads.campaign.reject.failed.validation',
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
      .select('id, owner_user_id, name')
      .eq('id', id)
      .maybeSingle();

    if (campaignError || !campaign) {
      await logAuditEvent({
        eventType: 'ads.campaign.reject.failed.not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { campaign_id: id },
      });
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { error: updateError } = await admin
      .from('ad_campaigns')
      .update({
        status: 'rejected',
        rejected_reason: parsed.data.reason,
        approved_by: adminSession.userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    if (updateError) {
      await logAuditEvent({
        eventType: 'ads.campaign.reject.failed.campaign_update',
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
        validation_errors: [parsed.data.reason],
      })
      .eq('campaign_id', campaign.id);

    if (campaign.owner_user_id) {
      try {
        await dispatchNotification({
          recipientUserId: campaign.owner_user_id,
          templateKey: 'ads_campaign_rejected',
          locale: 'en',
          title: `Campaign rejected: ${campaign.name}`,
          message: `Your campaign "${campaign.name}" was rejected. Reason: ${parsed.data.reason}`,
          link: '/advertise',
          metadata: {
            campaignId: campaign.id,
            status: 'rejected',
            reason: parsed.data.reason,
          },
        });
      } catch (notificationError) {
        console.error('Failed to send campaign rejected notification:', notificationError);
      }
    }

    await logAuditEvent({
      eventType: 'ads.campaign.reject.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { campaign_id: campaign.id, reason: parsed.data.reason },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reject campaign error:', error);
    await logAuditEvent({
      eventType: 'ads.campaign.reject.failed.internal_error',
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

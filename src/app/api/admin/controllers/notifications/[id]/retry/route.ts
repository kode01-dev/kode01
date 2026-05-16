import { NextResponse } from 'next/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { retryNotificationEmail } from '@/features/notifications/server/dispatch';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  let notificationId: string | null = null;

  try {
    const { id } = await params;
    notificationId = id;

    const adminSession = await getAdminSessionOrNull(req);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'controllers.notifications.retry.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { notification_id: id },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const result = await retryNotificationEmail(id);

    await logAuditEvent({
      eventType: 'controllers.notifications.retry.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        notification_id: id,
        email_status: result.emailStatus,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Admin controllers notification retry error:', error);

    await logAuditEvent({
      eventType: 'controllers.notifications.retry.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        notification_id: notificationId,
        error_message: errorMessage,
      },
    });

    const status = errorMessage.toLowerCase().includes('not found') ? 404 : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

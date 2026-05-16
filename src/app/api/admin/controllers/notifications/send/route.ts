import { NextResponse } from 'next/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import {
  dispatchNotification,
  dispatchNotificationSchema,
} from '@/features/notifications/server/dispatch';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';

export async function POST(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;

  try {
    const adminSession = await getAdminSessionOrNull(req);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'controllers.notifications.send.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const payload = await req.json().catch(() => null);
    const parsed = dispatchNotificationSchema.safeParse(payload);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'controllers.notifications.send.failed.validation',
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
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const result = await dispatchNotification(parsed.data);

    await logAuditEvent({
      eventType: 'controllers.notifications.send.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        template_key: parsed.data.templateKey,
        recipient_user_id: parsed.data.recipientUserId,
        notification_id: result.notificationId,
        email_status: result.emailStatus,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Controllers notifications send error:', error);

    await logAuditEvent({
      eventType: 'controllers.notifications.send.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: errorMessage },
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminActorSessionOrNull } from '@/app/api/admin/users/_lib';
import { isAdminRole, normalizeProfileRole } from '@/lib/auth/roles';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  let targetUserId: string | null = null;

  try {
    const { id } = await params;
    targetUserId = id;
    const adminSession = await getAdminActorSessionOrNull();

    if (!adminSession) {
      await logAuditEvent({
        eventType: 'admin.users.unblock.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const admin = createAdminClient();
    const { data: targetProfile, error: targetError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle();

    if (targetError) {
      await logAuditEvent({
        eventType: 'admin.users.unblock.failed.target_lookup',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id, error_message: targetError.message },
      });
      return NextResponse.json({ error: 'Failed to fetch target user' }, { status: 500 });
    }

    if (!targetProfile) {
      await logAuditEvent({
        eventType: 'admin.users.unblock.failed.target_not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id },
      });
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    if (isAdminRole(targetProfile.role)) {
      await logAuditEvent({
        eventType: 'admin.users.unblock.failed.target_admin_forbidden',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id },
      });
      return NextResponse.json({ error: 'Admin accounts cannot be managed here' }, { status: 400 });
    }

    const normalizedTargetRole = normalizeProfileRole(targetProfile.role);
    if (normalizedTargetRole !== 'buyer' && normalizedTargetRole !== 'seller') {
      await logAuditEvent({
        eventType: 'admin.users.unblock.failed.target_role_unsupported',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id, role: targetProfile.role },
      });
      return NextResponse.json({ error: 'This account type cannot be unblocked' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: 'none',
    });

    if (updateError) {
      await logAuditEvent({
        eventType: 'admin.users.unblock.failed.auth_update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id, error_message: updateError.message },
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'admin.users.unblock.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        target_user_id: id,
        reason: 'manual_unblock',
        duration: 'none',
        banned_until: updated.user?.banned_until ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      targetUserId: id,
      bannedUntil: updated.user?.banned_until ?? null,
    });
  } catch (error) {
    console.error('POST /api/admin/users/[id]/unblock error:', error);
    await logAuditEvent({
      eventType: 'admin.users.unblock.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        target_user_id: targetUserId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

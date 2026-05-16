import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminActorSessionOrNull } from '@/app/api/admin/users/_lib';
import { isAdminRole, normalizeProfileRole } from '@/lib/auth/roles';

const MAX_BLOCK_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

const bodySchema = z
  .object({
    durationMode: z.enum(['preset', 'custom']),
    preset: z.enum(['24h', '7d', '30d']).optional(),
    customUntil: z.string().datetime().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((value, ctx) => {
    if (value.durationMode === 'preset' && !value.preset) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'preset is required for preset mode',
        path: ['preset'],
      });
    }
    if (value.durationMode === 'custom' && !value.customUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customUntil is required for custom mode',
        path: ['customUntil'],
      });
    }
  });

function resolveBanDuration(payload: z.infer<typeof bodySchema>): string {
  if (payload.durationMode === 'preset') {
    if (payload.preset === '24h') return '24h';
    if (payload.preset === '7d') return '168h';
    return '720h';
  }

  const targetDate = new Date(payload.customUntil ?? '');
  if (Number.isNaN(targetDate.getTime())) {
    throw new Error('Invalid customUntil value');
  }

  const now = Date.now();
  const durationMs = targetDate.getTime() - now;
  if (durationMs <= 0) throw new Error('Custom date must be in the future');
  if (durationMs > MAX_BLOCK_DURATION_MS) throw new Error('Custom date exceeds max duration');

  const seconds = Math.ceil(durationMs / 1000);
  return `${seconds}s`;
}

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
        eventType: 'admin.users.block.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'admin.users.block.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          target_user_id: id,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json({ error: 'Validation error' }, { status: 400 });
    }

    if (actorUserId === id) {
      await logAuditEvent({
        eventType: 'admin.users.block.failed.self_action',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id },
      });
      return NextResponse.json({ error: 'You cannot block your own account' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: targetProfile, error: targetError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', id)
      .maybeSingle();

    if (targetError) {
      await logAuditEvent({
        eventType: 'admin.users.block.failed.target_lookup',
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
        eventType: 'admin.users.block.failed.target_not_found',
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
        eventType: 'admin.users.block.failed.target_admin_forbidden',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id },
      });
      return NextResponse.json({ error: 'Admin accounts cannot be blocked' }, { status: 400 });
    }

    const normalizedTargetRole = normalizeProfileRole(targetProfile.role);
    if (normalizedTargetRole !== 'buyer' && normalizedTargetRole !== 'seller') {
      await logAuditEvent({
        eventType: 'admin.users.block.failed.target_role_unsupported',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id, role: targetProfile.role },
      });
      return NextResponse.json({ error: 'This account type cannot be blocked' }, { status: 400 });
    }

    let banDuration = '';
    try {
      banDuration = resolveBanDuration(parsed.data);
    } catch (error) {
      await logAuditEvent({
        eventType: 'admin.users.block.failed.invalid_duration',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          target_user_id: id,
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
      return NextResponse.json({ error: 'Invalid block duration' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: banDuration,
    });

    if (updateError) {
      await logAuditEvent({
        eventType: 'admin.users.block.failed.auth_update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { target_user_id: id, error_message: updateError.message },
      });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'admin.users.block.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        target_user_id: id,
        reason: parsed.data.reason,
        duration: banDuration,
        banned_until: updated.user?.banned_until ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      targetUserId: id,
      bannedUntil: updated.user?.banned_until ?? null,
      duration: banDuration,
    });
  } catch (error) {
    console.error('POST /api/admin/users/[id]/block error:', error);
    await logAuditEvent({
      eventType: 'admin.users.block.failed.internal_error',
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

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent, getAuditContextFromRequest } from '@/lib/security/audit';

const deleteSchema = z.object({
  confirmEmail: z.string().email(),
});

/**
 * POST /api/account/delete
 * Permanently deletes the authenticated user's account and all associated data.
 * Supports GDPR Art. 17 (right to erasure) and CCPA right to delete.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Verify email matches as confirmation
    if (parsed.data.confirmEmail.toLowerCase() !== user.email?.toLowerCase()) {
      return NextResponse.json({ error: 'Email confirmation does not match' }, { status: 400 });
    }

    const auditContext = getAuditContextFromRequest(req);

    // Log the deletion request before proceeding
    await logAuditEvent({
      eventType: 'account_deletion_requested',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { email: user.email },
    });

    const admin = createAdminClient();

    // Delete auth first to avoid leaving a live auth user with partially deleted app data.
    const { error: authError } = await admin.auth.admin.deleteUser(user.id);

    if (authError) {
      console.error('Failed to delete auth user:', authError);
      return NextResponse.json({ error: 'Failed to delete auth account' }, { status: 500 });
    }

    // Best-effort cleanup in case the project does not cascade profile rows from auth.users.
    const { error: profileError } = await admin
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (profileError) {
      console.error('Profile cleanup failed after auth deletion:', profileError);
      await logAuditEvent({
        eventType: 'account_profile_cleanup_failed',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          deleted_user_id: user.id,
          error_message: profileError.message,
        },
      });
    }

    await logAuditEvent({
      eventType: 'account_deleted',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        deleted_user_id: user.id,
        profile_cleanup_failed: Boolean(profileError),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

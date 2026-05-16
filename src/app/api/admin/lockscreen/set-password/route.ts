import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { hashPassword } from '@/features/site-lockscreen/lib/lockscreen-server';

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * POST /api/admin/lockscreen/set-password
 * Set/update lockscreen password (admin only)
 * Password is hashed with bcrypt before storage
 */
export async function POST(request: Request) {
  const session = await getAdminSessionOrNull(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = setPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid password' },
        { status: 400 }
      );
    }

    // Hash the password
    const passwordHash = await hashPassword(parsed.data.password);

    const { supabase, userId } = session;

    // Get the first (and only) row's ID
    const { data: configRow } = await supabase
      .from('site_lockscreen_config')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!configRow) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    // Update password hash
    const { error } = await supabase
      .from('site_lockscreen_config')
      .update({
        password_hash: passwordHash,
        updated_by: userId,
      })
      .eq('id', configRow.id);

    if (error) {
      console.error('Error updating lockscreen password');
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    revalidateTag('lockscreen-config', 'default');

    return NextResponse.json({ success: true });
  } catch {
    console.error('Unexpected error updating lockscreen password');
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    );
  }
}

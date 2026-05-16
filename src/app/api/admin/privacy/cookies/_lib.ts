import { createClient } from '@/lib/supabase/server';
import { logAdminApiAuthDecision } from '@/app/api/admin/_audit';
import { isAdminRole } from '@/lib/auth/roles';

export async function getAdminClient(request?: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAdminApiAuthDecision({
      granted: false,
      request,
      scope: 'admin.privacy.cookies',
      reason: 'missing_user',
    });
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) {
    await logAdminApiAuthDecision({
      granted: false,
      userId: user.id,
      request,
      scope: 'admin.privacy.cookies',
      reason: 'role_not_admin',
      metadata: {
        role: profile?.role ?? null,
      },
    });
    return null;
  }

  await logAdminApiAuthDecision({
    granted: true,
    userId: user.id,
    request,
    scope: 'admin.privacy.cookies',
  });

  return supabase;
}

export function getRangeInMs(range: string): number {
  switch (range) {
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
    default:
      return 30 * 24 * 60 * 60 * 1000;
  }
}

export function sanitizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}


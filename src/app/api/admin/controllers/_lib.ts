import { createClient } from '@/lib/supabase/server';
import { logAdminApiAuthDecision } from '@/app/api/admin/_audit';
import { isAdminRole } from '@/lib/auth/roles';

export async function getAdminSessionOrNull(request?: Request, scope = 'admin.controllers') {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAdminApiAuthDecision({
      granted: false,
      request,
      scope,
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
      scope,
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
    scope,
  });

  return { supabase, userId: user.id };
}


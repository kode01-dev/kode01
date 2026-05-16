import { createClient } from '@/lib/supabase/server';
import { getApiMonitorFromDate, getApiMonitorRange, type ApiMonitorRange } from '@/features/api-monitoring/server/constants';
import { logAdminApiAuthDecision } from '@/app/api/admin/_audit';
import { isAdminRole } from '@/lib/auth/roles';

export async function getAdminSessionOrNull(request?: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAdminApiAuthDecision({
      granted: false,
      request,
      scope: 'admin.api-monitoring',
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
      scope: 'admin.api-monitoring',
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
    scope: 'admin.api-monitoring',
  });

  return { supabase, userId: user.id };
}

export function parseApiMonitorRange(rawRange: string | null): {
  range: ApiMonitorRange;
  fromDate: Date;
} {
  const range = getApiMonitorRange(rawRange);
  return {
    range,
    fromDate: getApiMonitorFromDate(range),
  };
}


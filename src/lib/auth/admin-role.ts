import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type RoleLookupResult = {
  role: string | null;
  resolved: boolean;
};

async function readRoleWithClient(
  client: SupabaseClient,
  userId: string,
): Promise<{ role: string | null; hasError: boolean }> {
  const { data, error } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  return {
    role: data?.role ?? null,
    hasError: Boolean(error),
  };
}

export async function getUserRoleWithAdminFallback(
  userId: string,
  fallbackClient?: SupabaseClient,
): Promise<RoleLookupResult> {
  try {
    const adminClient = createAdminClient();
    const result = await readRoleWithClient(adminClient, userId);
    if (!result.hasError) {
      return { role: result.role, resolved: true };
    }
  } catch {
    // Fallback below.
  }

  if (fallbackClient) {
    const result = await readRoleWithClient(fallbackClient, userId);
    if (!result.hasError) {
      return { role: result.role, resolved: true };
    }
  }

  return { role: null, resolved: false };
}

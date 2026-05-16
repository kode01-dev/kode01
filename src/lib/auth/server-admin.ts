import 'server-only';

import { isAdminRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

export type ServerAdminAuthState =
  | { state: 'unauthenticated' }
  | { state: 'forbidden'; userId: string }
  | { state: 'authorized'; userId: string };

export async function getServerAdminAuthState(): Promise<ServerAdminAuthState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { state: 'unauthenticated' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !isAdminRole(profile?.role)) {
    return { state: 'forbidden', userId: user.id };
  }

  return { state: 'authorized', userId: user.id };
}

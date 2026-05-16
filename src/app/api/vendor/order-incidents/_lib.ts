import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';

export async function getVendorSessionOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isSellerRole(profile?.role)) return null;
  return { userId: user.id };
}

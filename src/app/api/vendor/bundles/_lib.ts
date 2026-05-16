import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSellerRole } from '@/lib/auth/roles';

export async function getSellerSessionOrError() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    return {
      errorResponse: NextResponse.json({ error: 'Failed to load profile' }, { status: 500 }),
    };
  }
  if (!isSellerRole(profile?.role)) {
    return {
      errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    supabase,
    userId: user.id,
  };
}

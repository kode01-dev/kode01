import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isSellerRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

type DeniedSampleAccess = {
  ok: false;
  status: 401 | 403 | 404 | 500;
  error: string;
};

type AllowedSampleAccess = {
  ok: true;
  supabase: SupabaseClient<Database>;
  user: User;
  profile: {
    role: string | null;
    stripe_account_id: string | null;
  };
};

export type StripeConnectSampleAccess = AllowedSampleAccess | DeniedSampleAccess;

export function isStripeConnectSampleEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_STRIPE_CONNECT_SAMPLE === 'true';
}

export async function requireStripeConnectSampleSeller(): Promise<StripeConnectSampleAccess> {
  if (!isStripeConnectSampleEnabled()) {
    return { ok: false, status: 404, error: 'Not found' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, stripe_account_id')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { ok: false, status: 500, error: 'Failed to load profile' };
  }

  if (!profile || !isSellerRole(profile.role)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, supabase, user, profile };
}

export function stripeConnectSampleAccessResponse(access: DeniedSampleAccess): NextResponse {
  return NextResponse.json({ error: access.error }, { status: access.status });
}

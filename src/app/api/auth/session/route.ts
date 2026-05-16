import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isMissingSupabasePublicEnvError } from '@/lib/supabase/env';
import { normalizeProfileRole } from '@/lib/auth/roles';

export async function GET() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    if (isMissingSupabasePublicEnvError(error) && process.env.NODE_ENV !== 'production') {
      return NextResponse.json(
        { user: null, profile: null },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    throw error;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { user: null, profile: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, slug, display_name, shop_name, avatar_url, stripe_customer_id, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !data) {
    return NextResponse.json(
      { user, profile: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const normalizedRole = normalizeProfileRole(data.role);
  const profile = normalizedRole
    ? {
        id: data.id,
        role: normalizedRole,
        slug: data.slug,
        display_name: data.display_name,
        shop_name: data.shop_name,
        avatar_url: data.avatar_url,
        stripe_customer_id: data.stripe_customer_id,
        onboarding_completed: data.onboarding_completed ?? false,
      }
    : null;

  return NextResponse.json(
    { user, profile },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

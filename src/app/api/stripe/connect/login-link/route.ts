import { NextResponse } from 'next/server';
import {
  computeConnectAccountStatus,
  CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
  getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';
import { isSellerRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await req.json().catch(() => ({}));

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
    }

    if (!isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'Only sellers can manage Stripe Express' }, { status: 403 });
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({ error: 'Stripe account not connected' }, { status: 403 });
    }

    const stripeClient = getStripeClientForConnectSample();
    const account = await stripeClient.v2.core.accounts.retrieve(profile.stripe_account_id, {
      include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    });
    const accountStatus = computeConnectAccountStatus(account);

    if (!accountStatus.readyToReceivePayments || !accountStatus.onboardingComplete) {
      return NextResponse.json({ error: 'Stripe onboarding is not complete' }, { status: 403 });
    }

    const loginLink = await stripeClient.accounts.createLoginLink(profile.stripe_account_id);

    return NextResponse.json(
      { url: loginLink.url },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error: unknown) {
    console.error('Stripe Connect login-link error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

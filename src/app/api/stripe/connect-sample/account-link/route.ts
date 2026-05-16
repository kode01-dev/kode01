import { NextResponse } from 'next/server';
import { getAppBaseUrl } from '@/lib/env/server';
import {
  buildStripeConnectAccountUpdateParams,
  CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
  getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';
import { createClient } from '@/lib/supabase/server';

type CreateAccountLinkRequest = {
  locale?: string;
};

function normalizeLocale(input: string | undefined): string {
  if (!input) return 'en';
  const trimmed = input.trim().toLowerCase();
  return trimmed === 'fr' ? 'fr' : 'en';
}

/**
 * Generates a v2 Account Link used to onboard the current user's connected account.
 */
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

    const body = (await req.json().catch(() => ({}))) as CreateAccountLinkRequest;
    const locale = normalizeLocale(body.locale);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    if (!profile?.stripe_account_id) {
      return NextResponse.json(
        { error: 'No connected account found. Create the account first.' },
        { status: 400 },
      );
    }

    const appBaseUrl = getAppBaseUrl();
    const accountId = profile.stripe_account_id;
    const stripeClient = getStripeClientForConnectSample();

    try {
      await stripeClient.v2.core.accounts.update(
        accountId,
        buildStripeConnectAccountUpdateParams(),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown Stripe Connect capability sync error';
      return NextResponse.json(
        {
          error: `Connected account exists but required Stripe Connect capabilities could not be synchronized. ${message}`,
        },
        { status: 400 },
      );
    }

    const accountLink = await stripeClient.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
          refresh_url: `${appBaseUrl}/${locale}/stripe-connect-sample?onboarding=refresh`,
          return_url: `${appBaseUrl}/${locale}/stripe-connect-sample?accountId=${encodeURIComponent(accountId)}`,
        },
      },
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to create onboarding account link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

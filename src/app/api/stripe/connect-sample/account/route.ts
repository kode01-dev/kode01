import { NextResponse } from 'next/server';
import {
  requireStripeConnectSampleSeller,
  stripeConnectSampleAccessResponse,
} from '@/lib/stripe/connect-sample-access';
import {
  buildStripeConnectAccountCreateParams,
  buildStripeConnectAccountUpdateParams,
  computeConnectAccountStatus,
  CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
  getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';

type ConnectSampleAccountRequest = {
  displayName?: string;
  contactEmail?: string;
};

/**
 * Returns the connected account status by fetching Stripe directly.
 * For this demo we do not trust cached DB status for onboarding.
 */
export async function GET() {
  try {
    const access = await requireStripeConnectSampleSeller();
    if (!access.ok) return stripeConnectSampleAccessResponse(access);
    const { profile } = access;

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ connectedAccount: null });
    }

    const stripeClient = getStripeClientForConnectSample();
    const account = await stripeClient.v2.core.accounts.retrieve(profile.stripe_account_id, {
      include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    });

    return NextResponse.json({
      connectedAccount: computeConnectAccountStatus(account),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to retrieve connected account status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Creates a v2 connected account for the logged-in user and stores
 * the user -> connected account mapping in `profiles.stripe_account_id`.
 */
export async function POST(req: Request) {
  try {
    const access = await requireStripeConnectSampleSeller();
    if (!access.ok) return stripeConnectSampleAccessResponse(access);
    const { supabase, user, profile } = access;

    const body = (await req.json().catch(() => ({}))) as ConnectSampleAccountRequest;
    const trimmedDisplayName = body.displayName?.trim();
    const trimmedContactEmail = body.contactEmail?.trim() ?? user.email?.trim();

    if (!trimmedDisplayName) {
      return NextResponse.json(
        { error: 'displayName is required. Please enter the seller display name.' },
        { status: 400 },
      );
    }

    if (!trimmedContactEmail) {
      return NextResponse.json(
        { error: 'contactEmail is required. Add a valid seller contact email.' },
        { status: 400 },
      );
    }

    const stripeClient = getStripeClientForConnectSample();
    if (profile?.stripe_account_id) {
      try {
        await stripeClient.v2.core.accounts.update(
          profile.stripe_account_id,
          buildStripeConnectAccountUpdateParams({
            displayName: trimmedDisplayName,
            contactEmail: trimmedContactEmail,
          }),
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

      const existing = await stripeClient.v2.core.accounts.retrieve(profile.stripe_account_id, {
        include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
      });

      return NextResponse.json({
        created: false,
        connectedAccount: computeConnectAccountStatus(existing),
      });
    }

    const account = await stripeClient.v2.core.accounts.create(
      buildStripeConnectAccountCreateParams({
        displayName: trimmedDisplayName,
        contactEmail: trimmedContactEmail,
      }),
    );

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ stripe_account_id: account.id })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Account created, but failed to store the user/account mapping in DB.' },
        { status: 500 },
      );
    }

    const hydratedAccount = await stripeClient.v2.core.accounts.retrieve(account.id, {
      include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    });

    return NextResponse.json({
      created: true,
      connectedAccount: computeConnectAccountStatus(hydratedAccount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create connected account';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

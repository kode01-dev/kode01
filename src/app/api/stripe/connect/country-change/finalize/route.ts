import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  computeConnectAccountStatus,
  CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
  getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';
import { isSellerRole } from '@/lib/auth/roles';

type Payload = {
  eventId?: string;
  accountId?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const payload = (await req.json().catch(() => ({}))) as Payload;
    if (!payload.eventId || !payload.accountId) {
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'database' }, { status: 500 });
    }

    if (!isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { data: eventRow, error: eventError } = await supabase
      .from('vendor_country_change_events')
      .select('id, to_country, old_stripe_account_id, new_stripe_account_id, status')
      .eq('id', payload.eventId)
      .eq('user_id', user.id)
      .single();

    if (eventError || !eventRow) {
      return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
    }

    if (eventRow.new_stripe_account_id !== payload.accountId) {
      return NextResponse.json({ error: 'account_mismatch' }, { status: 400 });
    }

    const stripeClient = getStripeClientForConnectSample();
    const account = await stripeClient.v2.core.accounts.retrieve(payload.accountId, {
      include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    });
    const accountStatus = computeConnectAccountStatus(account);

    if (!accountStatus.readyToReceivePayments || !accountStatus.onboardingComplete) {
      await supabase
        .from('vendor_country_change_events')
        .update({
          status: 'onboarding_returned',
          reason: 'onboarding_incomplete',
          metadata: {
            requirements_status: accountStatus.requirementsStatus,
            transfer_capability_status: accountStatus.transferCapabilityStatus,
          },
        })
        .eq('id', eventRow.id)
        .eq('user_id', user.id);

      return NextResponse.json({ error: 'onboarding_incomplete' }, { status: 409 });
    }

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        country: eventRow.to_country,
        stripe_account_id: payload.accountId,
        stripe_charges_enabled: accountStatus.readyToReceivePayments,
        stripe_payouts_enabled: accountStatus.readyToReceivePayments,
        stripe_details_submitted: accountStatus.onboardingComplete,
        stripe_onboarding_completed_at: accountStatus.onboardingComplete ? new Date().toISOString() : null,
        is_verified: accountStatus.readyToReceivePayments,
      })
      .eq('id', user.id);

    if (profileUpdateError) {
      await supabase
        .from('vendor_country_change_events')
        .update({
          status: 'switch_failed',
          reason: profileUpdateError.message,
        })
        .eq('id', eventRow.id)
        .eq('user_id', user.id);

      return NextResponse.json({ error: 'switch_failed' }, { status: 500 });
    }

    await supabase
      .from('vendor_country_change_events')
      .update({
        status: 'switched',
        reason: null,
        metadata: {
          previous_stripe_account_id: eventRow.old_stripe_account_id,
          new_stripe_account_id: payload.accountId,
          profile_previous_stripe_account_id: profile.stripe_account_id,
        },
      })
      .eq('id', eventRow.id)
      .eq('user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('country-change/finalize error:', error);
    return NextResponse.json({ error: 'unknown' }, { status: 500 });
  }
}

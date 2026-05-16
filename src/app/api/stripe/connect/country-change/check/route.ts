import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  normalizeConnectCountryCode,
  parseAllowedConnectCountryCode,
} from '@/lib/stripe/connect-countries';
import { getStripeClientForConnectSample } from '@/lib/stripe/connect-sample';
import { isSellerRole } from '@/lib/auth/roles';

type Payload = {
  targetCountry?: string;
};

function sumAbsoluteCurrencyAmounts(list: Array<{ amount: number }> | null | undefined): number {
  return (list ?? []).reduce((sum, item) => sum + Math.abs(item.amount), 0);
}

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
    const normalizedTarget = normalizeConnectCountryCode(payload.targetCountry);
    if (!normalizedTarget) {
      return NextResponse.json({ error: 'country_required' }, { status: 400 });
    }

    const targetCountry = parseAllowedConnectCountryCode(normalizedTarget);
    if (!targetCountry) {
      return NextResponse.json({ error: 'country_unsupported' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, country, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'database' }, { status: 500 });
    }

    if (!isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({ error: 'missing_connected_account' }, { status: 400 });
    }

    const currentCountry = parseAllowedConnectCountryCode(profile.country);
    if (!currentCountry) {
      return NextResponse.json({ error: 'country_locked' }, { status: 400 });
    }

    if (currentCountry === targetCountry) {
      return NextResponse.json({ error: 'country_same' }, { status: 400 });
    }

    const stripeClient = getStripeClientForConnectSample();
    const balance = await stripeClient.balance.retrieve({}, { stripeAccount: profile.stripe_account_id });

    const availableAmount = sumAbsoluteCurrencyAmounts(balance.available);
    const pendingAmount = sumAbsoluteCurrencyAmounts(balance.pending);
    const hasNonZeroBalance = availableAmount > 0 || pendingAmount > 0;

    if (hasNonZeroBalance) {
      await supabase
        .from('vendor_country_change_events')
        .insert({
          user_id: user.id,
          from_country: currentCountry,
          to_country: targetCountry,
          old_stripe_account_id: profile.stripe_account_id,
          status: 'check_blocked_balance',
          reason: 'balance_not_zero',
          metadata: {
            available_amount: availableAmount,
            pending_amount: pendingAmount,
          },
        });

      return NextResponse.json(
        {
          error: 'balance_not_zero',
          availableAmount,
          pendingAmount,
        },
        { status: 409 },
      );
    }

    await supabase
      .from('vendor_country_change_events')
      .insert({
        user_id: user.id,
        from_country: currentCountry,
        to_country: targetCountry,
        old_stripe_account_id: profile.stripe_account_id,
        status: 'check_passed',
        metadata: {
          available_amount: availableAmount,
          pending_amount: pendingAmount,
        },
      });

    return NextResponse.json({
      ok: true,
      fromCountry: currentCountry,
      toCountry: targetCountry,
      availableAmount,
      pendingAmount,
    });
  } catch (error) {
    console.error('country-change/check error:', error);
    return NextResponse.json({ error: 'unknown' }, { status: 500 });
  }
}

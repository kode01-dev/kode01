import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRequestOrigin } from '@/lib/http/request-origin';
import {
  normalizeConnectCountryCode,
  parseAllowedConnectCountryCode,
} from '@/lib/stripe/connect-countries';
import {
  buildStripeConnectAccountCreateParams,
  CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
  getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';
import {
  normalizeVendorBusinessDescription,
  normalizeVendorBusinessMcc,
  normalizeVendorBusinessUrl,
} from '@/lib/stripe/connect-business-profile';
import { isSellerRole } from '@/lib/auth/roles';

type Payload = {
  targetCountry?: string;
  locale?: string;
  confirmationPhrase?: string;
};

const REQUIRED_CONFIRMATION_PHRASE = 'CHANGER MON PAYS';

function normalizeLocale(input: string | undefined): string {
  if (!input) return 'en';
  return input.trim().toLowerCase() === 'fr' ? 'fr' : 'en';
}

function buildVendorUrl(origin: string, locale: string, query: Record<string, string>): string {
  const url = new URL(`/${locale}/vendor`, origin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

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

    if (payload.confirmationPhrase?.trim() !== REQUIRED_CONFIRMATION_PHRASE) {
      return NextResponse.json({ error: 'confirmation_phrase_mismatch' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, country, stripe_account_id, display_name, shop_name, business_url, business_description, business_mcc')
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

    if (availableAmount > 0 || pendingAmount > 0) {
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

      return NextResponse.json({ error: 'balance_not_zero' }, { status: 409 });
    }

    const contactEmail = user.email?.trim();
    if (!contactEmail) {
      return NextResponse.json({ error: 'missing_contact_email' }, { status: 400 });
    }

    const displayName =
      profile.shop_name?.trim() ||
      profile.display_name?.trim() ||
      contactEmail.split('@')[0] ||
      `seller-${user.id.slice(0, 8)}`;
    const businessUrl = normalizeVendorBusinessUrl(profile.business_url);
    const businessDescription = normalizeVendorBusinessDescription(profile.business_description);
    const businessMcc = normalizeVendorBusinessMcc(profile.business_mcc);

    const nextAccount = await stripeClient.v2.core.accounts.create(
      buildStripeConnectAccountCreateParams({
        displayName,
        contactEmail,
        country: targetCountry,
        businessUrl,
        businessDescription,
        businessMcc,
      }),
    );

    const { data: eventRow, error: insertError } = await supabase
      .from('vendor_country_change_events')
      .insert({
        user_id: user.id,
        from_country: currentCountry,
        to_country: targetCountry,
        old_stripe_account_id: profile.stripe_account_id,
        new_stripe_account_id: nextAccount.id,
        status: 'start_created',
        metadata: {
          available_amount: availableAmount,
          pending_amount: pendingAmount,
        },
      })
      .select('id')
      .single();

    if (insertError || !eventRow) {
      return NextResponse.json({ error: 'database' }, { status: 500 });
    }

    const locale = normalizeLocale(payload.locale);
    const appBaseUrl = getRequestOrigin(req);
    const accountLink = await stripeClient.v2.core.accountLinks.create({
      account: nextAccount.id,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
          refresh_url: buildVendorUrl(appBaseUrl, locale, {
            country_change_refresh: 'true',
            country_change_event_id: eventRow.id,
            country_change_account_id: nextAccount.id,
          }),
          return_url: buildVendorUrl(appBaseUrl, locale, {
            onboarding_complete: 'true',
            country_change_event_id: eventRow.id,
            country_change_account_id: nextAccount.id,
          }),
        },
      },
    });

    return NextResponse.json({
      url: accountLink.url,
      eventId: eventRow.id,
      accountId: nextAccount.id,
    });
  } catch (error) {
    console.error('country-change/start error:', error);
    return NextResponse.json({ error: 'unknown' }, { status: 500 });
  }
}

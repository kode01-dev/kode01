import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import {
  buildStripeConnectAccountCreateParams,
  buildStripeConnectAccountUpdateParams,
  computeConnectAccountStatus,
  CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
  getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';
import {
  STRIPE_CONNECT_CALLBACK_HTTPS_ERROR,
  StripeConnectCallbackUrlError,
} from '@/lib/stripe/connect-callback-url';
import { createVendorOnboardingAccountLink } from '@/lib/stripe/connect-onboarding';
import {
  STRIPE_CONNECT_STATE_SECRET_ERROR,
  StripeConnectStateSecretError,
} from '@/lib/stripe/connect-state';
import {
  normalizeConnectCountryCode,
  parseAllowedConnectCountryCode,
} from '@/lib/stripe/connect-countries';
import {
  DEFAULT_VENDOR_BUSINESS_DESCRIPTION,
  getDefaultVendorBusinessDescriptionForLocale,
  normalizeVendorBusinessDescription,
  normalizeVendorBusinessMcc,
  normalizeVendorBusinessUrl,
} from '@/lib/stripe/connect-business-profile';
import { isSellerRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';

type ConnectRequestPayload = {
    locale?: string;
};

const STRIPE_CONNECT_SECRET_KEY_ERROR = 'stripe_connect_secret_key_missing';

function isMissingStripeSecretKeyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Missing STRIPE_SECRET_KEY')
  );
}

function normalizeLocale(input: string | undefined): string {
  if (!input) return 'en';
  const normalized = input.trim().toLowerCase();
  return normalized === 'fr' ? 'fr' : 'en';
}

function inferLocaleFromReferer(referer: string | null): string | undefined {
  if (!referer) return undefined;

  try {
    const parsed = new URL(referer);
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0];
    return firstSegment;
  } catch {
    return undefined;
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const auditContext = getAuditContextFromRequest(req);

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Your session has expired.' }, { status: 401 });
    }

    const payload = (await req.json().catch(() => ({}))) as ConnectRequestPayload;
    const locale = normalizeLocale(payload.locale ?? inferLocaleFromReferer(req.headers.get('referer')));
    let localizedDefaultDescription = getDefaultVendorBusinessDescriptionForLocale(locale);
    try {
      const t = await getTranslations({ locale, namespace: 'dashboard.vendor' });
      localizedDefaultDescription = t('stripe_prefill_description');
    } catch {
      // Keep locale fallback when translation loading is unavailable in API context.
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'role, stripe_account_id, display_name, shop_name, country, business_url, business_description, business_mcc',
      )
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'profile_not_found', message: 'Unable to load your seller profile.' }, { status: 400 });
    }

    if (!isSellerRole(profile.role)) {
      return NextResponse.json({ error: 'forbidden', message: 'Only sellers can connect Stripe.' }, { status: 403 });
    }

    const contactEmail = user.email?.trim();
    if (!contactEmail) {
      return NextResponse.json(
        { error: 'missing_contact_email', message: 'Add an email address before onboarding Stripe.' },
        { status: 400 },
      );
    }

    const displayName =
      profile.shop_name?.trim() ||
      profile.display_name?.trim() ||
      contactEmail.split('@')[0] ||
      `seller-${user.id.slice(0, 8)}`;
    const businessUrl = normalizeVendorBusinessUrl(profile.business_url);
    const businessDescription = normalizeVendorBusinessDescription(
      profile.business_description,
      localizedDefaultDescription || DEFAULT_VENDOR_BUSINESS_DESCRIPTION,
    );
    const businessMcc = normalizeVendorBusinessMcc(profile.business_mcc);
    const accountIdFromProfile = profile.stripe_account_id;
    const normalizedCountry = normalizeConnectCountryCode(profile.country);
    const country = parseAllowedConnectCountryCode(profile.country);
    if (!normalizedCountry && !accountIdFromProfile) {
      return NextResponse.json(
        { error: 'country_required', message: 'Add a valid country to your vendor profile before Stripe onboarding.' },
        { status: 400 },
      );
    }
    if (normalizedCountry && !country) {
      return NextResponse.json(
        { error: 'country_unsupported', message: 'Country is not supported for marketplace onboarding.' },
        { status: 400 },
      );
    }

    const stripeClient = getStripeClientForConnectSample();
    let accountId = accountIdFromProfile;

    if (!accountId) {
      const account = await stripeClient.v2.core.accounts.create(
        buildStripeConnectAccountCreateParams({
          displayName,
          contactEmail,
          country: country ?? undefined,
          businessUrl,
          businessDescription,
          businessMcc,
        }),
      );
      accountId = account.id;
    } else {
      try {
        await stripeClient.v2.core.accounts.update(
          accountId,
          buildStripeConnectAccountUpdateParams({
            displayName,
            contactEmail,
            country: country ?? undefined,
            businessUrl,
            businessDescription,
            businessMcc,
          }),
        );
      } catch (error) {
        console.error('Stripe Connect account sync error:', error);
        await logAuditEvent({
          eventType: 'stripe_connect.account_sync.failed',
          userId: user.id,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            request_id: requestId,
            stripe_account_id: accountId,
          },
        });

        return NextResponse.json(
          {
            error: 'stripe_account_sync_failed',
            message: 'Unable to prepare your Stripe Connect account. Please try again.',
          },
          { status: 400 },
        );
      }
    }

    const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
      include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    });
    const accountStatus = computeConnectAccountStatus(account);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        stripe_account_id: accountId,
        stripe_charges_enabled: accountStatus.readyToReceivePayments,
        stripe_payouts_enabled: accountStatus.readyToReceivePayments,
        stripe_details_submitted: accountStatus.onboardingComplete,
        stripe_onboarding_completed_at: accountStatus.onboardingComplete ? new Date().toISOString() : null,
        is_verified: accountStatus.readyToReceivePayments,
      })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        {
          error: 'profile_sync_failed',
          message: 'Stripe account was prepared, but the seller profile could not be updated.',
        },
        { status: 500 },
      );
    }

    await logAuditEvent({
      eventType: 'stripe_connect.status.synced',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        request_id: requestId,
        stripe_account_id: accountId,
        ready_to_receive_payments: accountStatus.readyToReceivePayments,
        onboarding_complete: accountStatus.onboardingComplete,
      },
    });

    const accountLink = await createVendorOnboardingAccountLink({
      request: req,
      accountLinks: stripeClient.v2.core.accountLinks,
      userId: user.id,
      stripeAccountId: accountId,
      locale,
    });

    await logAuditEvent({
      eventType: 'stripe_connect.account_link.created',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        request_id: requestId,
        stripe_account_id: accountId,
        environment: process.env.NODE_ENV ?? 'development',
        refresh_url_host: new URL(accountLink.refreshUrl).host,
        return_url_host: new URL(accountLink.returnUrl).host,
      },
    });

    return NextResponse.json({
      url: accountLink.url,
      connectedAccount: accountStatus,
    });
  } catch (error: unknown) {
    console.error('Stripe Connect error:', error);
    const isCallbackUrlError = error instanceof StripeConnectCallbackUrlError;
    const isStateSecretError = error instanceof StripeConnectStateSecretError;
    const isSecretKeyError = isMissingStripeSecretKeyError(error);
    const errorCode = isCallbackUrlError
      ? STRIPE_CONNECT_CALLBACK_HTTPS_ERROR
      : isStateSecretError
        ? STRIPE_CONNECT_STATE_SECRET_ERROR
        : isSecretKeyError
          ? STRIPE_CONNECT_SECRET_KEY_ERROR
          : 'stripe_connect_failed';
    const message = isCallbackUrlError || isStateSecretError
      ? error.publicMessage
      : isSecretKeyError
        ? 'Stripe onboarding is not configured. Add STRIPE_SECRET_KEY before connecting sellers.'
      : 'Unable to start Stripe onboarding. Please try again.';
    const status = isSecretKeyError ? 503 : 500;

    return NextResponse.json({ error: errorCode, message }, { status });
  }
}

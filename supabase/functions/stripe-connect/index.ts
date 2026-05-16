import { getEdgeEnv } from '../_shared/env.ts';
import { badRequest, internalServerError, isInternalAuthorized, json, methodNotAllowed, unauthorized } from '../_shared/http.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';
import { normalizeConnectCountryCode, parseAllowedConnectCountryCode } from '../_shared/connect-countries.ts';
import type Stripe from 'https://esm.sh/stripe@20.4.0?target=deno';

const DEFAULT_VENDOR_BUSINESS_URL = 'https://www.kode01.com';
const DEFAULT_VENDOR_BUSINESS_DESCRIPTION_EN = 'Digital assets and tools marketplace';
const DEFAULT_VENDOR_BUSINESS_DESCRIPTION_FR = 'Marketplace d actifs numeriques et outils';
const DEFAULT_VENDOR_BUSINESS_MCC = '5817';
const CONNECT_ACCOUNT_RETRIEVE_INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  'configuration.recipient',
  'configuration.merchant',
  'requirements',
];
const CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS: Array<'recipient' | 'merchant'> = [
  'recipient',
  'merchant',
];

const schema = z.object({
  userId: z.string().uuid(),
  userEmail: z.string().email().optional(),
  locale: z.string().optional(),
});

function normalizeLocale(input: string | undefined): 'en' | 'fr' {
  if (!input) return 'en';
  return input.trim().toLowerCase() === 'fr' ? 'fr' : 'en';
}

function getDefaultBusinessDescription(locale: 'en' | 'fr'): string {
  return locale === 'fr' ? DEFAULT_VENDOR_BUSINESS_DESCRIPTION_FR : DEFAULT_VENDOR_BUSINESS_DESCRIPTION_EN;
}

function normalizeBusinessUrl(input: string | null | undefined): string {
  const value = input?.trim();
  if (!value) return DEFAULT_VENDOR_BUSINESS_URL;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    // fall through
  }

  return DEFAULT_VENDOR_BUSINESS_URL;
}

function normalizeBusinessDescription(input: string | null | undefined, fallback: string): string {
  const value = input?.trim();
  if (!value) return fallback;
  return value.slice(0, 500);
}

function normalizeBusinessMcc(input: string | null | undefined): string {
  const value = input?.trim();
  if (value && /^\d{4}$/.test(value)) return value;
  return DEFAULT_VENDOR_BUSINESS_MCC;
}

type ConnectCapabilityParams = Pick<
  Stripe.V2.Core.AccountUpdateParams,
  'identity' | 'defaults' | 'configuration'
>;

function buildConnectCapabilityParams(country: string): ConnectCapabilityParams {
  return {
    identity: {
      country,
    },
    defaults: {
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: {
              requested: true,
            },
          },
        },
      },
      merchant: {
        capabilities: {
          card_payments: {
            requested: true,
          },
        },
      },
    },
  };
}

type BuildAccountParamsInput = {
  displayName?: string;
  contactEmail?: string;
  country: string;
  businessUrl?: string;
  businessDescription?: string;
  businessMcc?: string;
};

function buildConnectAccountCreateParams(
  input: BuildAccountParamsInput,
): Stripe.V2.Core.AccountCreateParams {
  return {
    display_name: input.displayName,
    contact_email: input.contactEmail,
    dashboard: 'express',
    ...buildConnectCapabilityParams(input.country),
    business_profile: {
      url: normalizeBusinessUrl(input.businessUrl),
      product_description: normalizeBusinessDescription(
        input.businessDescription,
        DEFAULT_VENDOR_BUSINESS_DESCRIPTION_EN,
      ),
      mcc: normalizeBusinessMcc(input.businessMcc),
    },
  } as Stripe.V2.Core.AccountCreateParams;
}

function buildConnectAccountUpdateParams(
  input: BuildAccountParamsInput,
): Stripe.V2.Core.AccountUpdateParams {
  return {
    display_name: input.displayName,
    contact_email: input.contactEmail,
    dashboard: 'express',
    ...buildConnectCapabilityParams(input.country),
    business_profile: {
      url: normalizeBusinessUrl(input.businessUrl),
      product_description: normalizeBusinessDescription(
        input.businessDescription,
        DEFAULT_VENDOR_BUSINESS_DESCRIPTION_EN,
      ),
      mcc: normalizeBusinessMcc(input.businessMcc),
    },
  } as Stripe.V2.Core.AccountUpdateParams;
}

function getStripeOnboardingState(account: Stripe.V2.Core.Account) {
  const transferCapabilityStatus =
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;
  const requirementsStatus = account.requirements?.summary?.minimum_deadline?.status ?? null;
  const readyToReceivePayments = transferCapabilityStatus === 'active';
  const onboardingComplete = requirementsStatus !== 'currently_due' && requirementsStatus !== 'past_due';

  return {
    readyToReceivePayments,
    onboardingComplete,
    requirementsStatus,
    transferCapabilityStatus,
  };
}

async function syncProfileStripeState(userId: string, account: Stripe.V2.Core.Account) {
  const state = getStripeOnboardingState(account);
  const onboardingCompletedAt = state.onboardingComplete ? new Date().toISOString() : null;

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      stripe_account_id: account.id,
      stripe_charges_enabled: state.readyToReceivePayments,
      stripe_payouts_enabled: state.readyToReceivePayments,
      stripe_details_submitted: state.onboardingComplete,
      stripe_onboarding_completed_at: onboardingCompletedAt,
      is_verified: state.readyToReceivePayments,
    })
    .eq('id', userId);

  return updateError;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!isInternalAuthorized(req)) return unauthorized();

  const payload = await req.json().catch(() => null);
  const parsed = parseWithSchema(schema, payload);
  if (!parsed.success) return badRequest('Invalid request payload');

  const { userId, userEmail, locale } = parsed.data;
  const normalizedLocale = normalizeLocale(locale);
  const stripe = getStripe();
  const env = getEdgeEnv();

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(
        'stripe_account_id, role, display_name, shop_name, country, business_url, business_description, business_mcc',
      )
      .eq('id', userId)
      .single();

    if (profileError || !profile) return badRequest('Profile not found');
    if (profile.role !== 'seller') return unauthorized('Only sellers can connect Stripe');

    const contactEmail = userEmail?.trim();
    const displayName =
      profile.shop_name?.trim()
      ?? profile.display_name?.trim()
      ?? contactEmail?.split('@')[0]
      ?? `seller-${userId.slice(0, 8)}`;
    const businessUrl = normalizeBusinessUrl(profile.business_url);
    const businessDescription = normalizeBusinessDescription(
      profile.business_description,
      getDefaultBusinessDescription(normalizedLocale),
    );
    const businessMcc = normalizeBusinessMcc(profile.business_mcc);
    const normalizedCountry = normalizeConnectCountryCode(profile.country);
    const connectedAccountCountry = parseAllowedConnectCountryCode(profile.country)?.toLowerCase();
    if (!normalizedCountry) {
      return badRequest(profile.stripe_account_id ? 'country_locked' : 'country_required');
    }
    if (!connectedAccountCountry) {
      return badRequest('country_unsupported');
    }

    let accountId = profile.stripe_account_id;
    if (!accountId) {
      if (!contactEmail) return badRequest('Missing user email for Stripe Connect onboarding');

      const account = await stripe.v2.core.accounts.create(
        buildConnectAccountCreateParams({
          displayName,
          contactEmail,
          country: connectedAccountCountry,
          businessUrl,
          businessDescription,
          businessMcc,
        }),
      );
      accountId = account.id;
    } else {
      try {
        await stripe.v2.core.accounts.update(
          accountId,
          buildConnectAccountUpdateParams({
            displayName,
            contactEmail,
            country: connectedAccountCountry,
            businessUrl,
            businessDescription,
            businessMcc,
          }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown Stripe Connect capability sync error';
        return badRequest(
          `Connected account exists but required Stripe Connect capabilities could not be synchronized. ${message}`,
        );
      }
    }

    const account = await stripe.v2.core.accounts.retrieve(accountId, {
      include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    });
    const syncError = await syncProfileStripeState(userId, account);
    if (syncError) {
      console.error('Failed to persist stripe account state:', syncError);
      return internalServerError();
    }

    const accountLink = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
          refresh_url: `${env.appBaseUrl}/${normalizedLocale}/vendor?onboarding=refresh`,
          return_url: `${env.appBaseUrl}/${normalizedLocale}/vendor?onboarding_complete=true&accountId=${encodeURIComponent(accountId)}`,
        },
      },
    });

    return json({
      url: accountLink.url,
      connectedAccount: getStripeOnboardingState(account),
    });
  } catch (error) {
    console.error('stripe-connect error:', error);
    return internalServerError();
  }
});

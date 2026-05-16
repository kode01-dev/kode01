import 'server-only';

import Stripe from 'stripe';
import { getServerEnv } from '@/lib/env/server';
import { normalizeConnectCountryCode } from '@/lib/stripe/connect-countries';
import {
  normalizeVendorBusinessDescription,
  normalizeVendorBusinessMcc,
  normalizeVendorBusinessUrl,
} from '@/lib/stripe/connect-business-profile';

const STRIPE_SECRET_PLACEHOLDER_PATTERN = /^sk_(?:test|live)_x+$/i;
const STRIPE_THIN_WEBHOOK_SECRET_PLACEHOLDER_PATTERN = /^whsec_x+$/i;
const DEFAULT_CONNECTED_ACCOUNT_COUNTRY = 'ca';

export const CONNECT_ACCOUNT_RETRIEVE_INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  'configuration.recipient',
  'configuration.merchant',
  'requirements',
];

export const CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS: Array<'recipient' | 'merchant'> = [
  'recipient',
  'merchant',
];

let cachedStripeClient: Stripe | null = null;

function isStripeSecretPlaceholder(secret: string | undefined): boolean {
  if (!secret) return false;
  return STRIPE_SECRET_PLACEHOLDER_PATTERN.test(secret);
}

function isStripeThinWebhookSecretPlaceholder(secret: string | undefined): boolean {
  if (!secret) return false;
  return STRIPE_THIN_WEBHOOK_SECRET_PLACEHOLDER_PATTERN.test(secret);
}

/**
 * Builds a Stripe client for the Connect sample integration.
 * We intentionally do not force an API version here because the SDK auto-uses
 * the latest preview/stable behavior configured by Stripe.
 */
export function getStripeClientForConnectSample(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  // PLACEHOLDER: Set STRIPE_SECRET_KEY=sk_test_xxx in your .env.local file.
  if (!secretKey || isStripeSecretPlaceholder(secretKey)) {
    throw new Error(
      'Missing STRIPE_SECRET_KEY. Add a real key in .env.local (example placeholder: STRIPE_SECRET_KEY=sk_test_xxx).',
    );
  }

  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey, {
      appInfo: {
        name: 'kode01 Stripe Connect Sample',
        url: 'https://kode01.co',
      },
    });
  }

  return cachedStripeClient;
}

/**
 * Returns the thin-event webhook secret for this sample.
 * Falls back to STRIPE_WEBHOOK_SECRET so existing setups keep working.
 */
export function getStripeConnectThinWebhookSecret(): string {
  const connectThinWebhookSecret = process.env.STRIPE_CONNECT_THIN_WEBHOOK_SECRET?.trim();
  const fallbackWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const hasRealConnectThinWebhookSecret =
    Boolean(connectThinWebhookSecret) &&
    !isStripeThinWebhookSecretPlaceholder(connectThinWebhookSecret);
  const webhookSecret = hasRealConnectThinWebhookSecret
    ? connectThinWebhookSecret
    : fallbackWebhookSecret;

  // PLACEHOLDER: Set STRIPE_CONNECT_THIN_WEBHOOK_SECRET=whsec_xxx in .env.local.
  if (!webhookSecret || isStripeThinWebhookSecretPlaceholder(webhookSecret)) {
    throw new Error(
      'Missing STRIPE_CONNECT_THIN_WEBHOOK_SECRET (or STRIPE_WEBHOOK_SECRET). Add a real webhook secret (placeholder: whsec_xxx).',
    );
  }

  return webhookSecret;
}

export function getStripeConnectedAccountCountry(): string {
  const normalized = normalizeConnectCountryCode(getServerEnv().STRIPE_CONNECTED_ACCOUNT_COUNTRY);
  if (!normalized) return DEFAULT_CONNECTED_ACCOUNT_COUNTRY;
  return normalized.toLowerCase();
}

type ConnectCapabilityParams = Pick<
  Stripe.V2.Core.AccountCreateParams,
  'identity' | 'defaults' | 'configuration'
>;

function buildStripeConnectCapabilityParams(country?: string): ConnectCapabilityParams {
  const params: ConnectCapabilityParams = {
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

  if (country) {
    params.identity = {
      country,
    };
  }

  return params;
}

type BuildConnectAccountParamsInput = {
  displayName?: string;
  contactEmail?: string;
  country?: string;
  businessUrl?: string;
  businessDescription?: string;
  businessMcc?: string;
};

function getConnectCountryOrDefault(country: string | undefined): string {
  const normalized = normalizeConnectCountryCode(country);
  if (normalized) return normalized.toLowerCase();
  return getStripeConnectedAccountCountry();
}

function buildBusinessProfileParams(input: BuildConnectAccountParamsInput) {
  return {
    business_profile: {
      url: normalizeVendorBusinessUrl(input.businessUrl),
      mcc: normalizeVendorBusinessMcc(input.businessMcc),
      product_description: normalizeVendorBusinessDescription(input.businessDescription),
    },
  };
}

export function buildStripeConnectAccountCreateParams(
  input: BuildConnectAccountParamsInput,
): Stripe.V2.Core.AccountCreateParams {
  return {
    display_name: input.displayName,
    contact_email: input.contactEmail,
    dashboard: 'express',
    ...buildStripeConnectCapabilityParams(getConnectCountryOrDefault(input.country)),
    ...buildBusinessProfileParams(input),
  } as Stripe.V2.Core.AccountCreateParams;
}

export function buildStripeConnectAccountUpdateParams(
  input: BuildConnectAccountParamsInput = {},
): Stripe.V2.Core.AccountUpdateParams {
  const country = normalizeConnectCountryCode(input.country)?.toLowerCase();

  return {
    display_name: input.displayName,
    contact_email: input.contactEmail,
    dashboard: 'express',
    ...buildStripeConnectCapabilityParams(country),
    ...buildBusinessProfileParams(input),
  } as Stripe.V2.Core.AccountUpdateParams;
}

export type ConnectAccountStatus = {
  accountId: string;
  readyToReceivePayments: boolean;
  onboardingComplete: boolean;
  requirementsStatus: string | null;
  transferCapabilityStatus: string | null;
};

/**
 * Evaluates onboarding/readiness from a v2 account response.
 * This mirrors Stripe's recommended checks for recipient onboarding.
 */
export function computeConnectAccountStatus(account: Stripe.V2.Core.Account): ConnectAccountStatus {
  const transferCapabilityStatus =
    account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;

  const requirementsStatus = account.requirements?.summary?.minimum_deadline?.status ?? null;

  const readyToReceivePayments = transferCapabilityStatus === 'active';
  const onboardingComplete = requirementsStatus !== 'currently_due' && requirementsStatus !== 'past_due';

  return {
    accountId: account.id,
    readyToReceivePayments,
    onboardingComplete,
    requirementsStatus,
    transferCapabilityStatus,
  };
}

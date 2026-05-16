import 'server-only';

import {
  CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
} from '@/lib/stripe/connect-sample';
import { resolveStripeConnectCallbackBaseUrl } from '@/lib/stripe/connect-callback-url';
import { createStripeConnectState } from '@/lib/stripe/connect-state';

type StripeConnectAccountLinkClient = {
  create(params: {
    account: string;
    use_case: {
      type: 'account_onboarding';
      account_onboarding: {
        configurations: Array<'recipient' | 'merchant'>;
        refresh_url: string;
        return_url: string;
      };
    };
  }): Promise<{ url: string }>;
};

type CreateVendorOnboardingAccountLinkInput = {
  request: Request;
  accountLinks: StripeConnectAccountLinkClient;
  userId: string;
  stripeAccountId: string;
  locale: string;
};

function normalizeLocale(input: string | undefined): string {
  return input?.trim().toLowerCase() === 'fr' ? 'fr' : 'en';
}

export async function createVendorOnboardingAccountLink(
  input: CreateVendorOnboardingAccountLinkInput,
): Promise<{
  url: string;
  state: string;
  refreshUrl: string;
  returnUrl: string;
}> {
  const locale = normalizeLocale(input.locale);
  const callbackBaseUrl = resolveStripeConnectCallbackBaseUrl(input.request);
  const state = createStripeConnectState({
    userId: input.userId,
    stripeAccountId: input.stripeAccountId,
    locale,
    purpose: 'vendor_onboarding',
  });

  const refreshUrl = new URL('/api/stripe/connect/refresh', callbackBaseUrl);
  refreshUrl.searchParams.set('state', state);

  const returnUrl = new URL(`/${locale}/vendor`, callbackBaseUrl);
  returnUrl.searchParams.set('stripe_connect_return', '1');
  returnUrl.searchParams.set('state', state);

  const accountLink = await input.accountLinks.create({
    account: input.stripeAccountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS,
        refresh_url: refreshUrl.toString(),
        return_url: returnUrl.toString(),
      },
    },
  });

  return {
    url: accountLink.url,
    state,
    refreshUrl: refreshUrl.toString(),
    returnUrl: returnUrl.toString(),
  };
}

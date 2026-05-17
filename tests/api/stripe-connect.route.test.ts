import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: undefined,
});

type UserLike = {
  id: string;
  email?: string | null;
} | null;

type ProfileLike = {
  role: string;
  stripe_account_id: string | null;
  display_name?: string | null;
  shop_name?: string | null;
  country?: string | null;
  business_url?: string | null;
  business_description?: string | null;
  business_mcc?: string | null;
} | null;

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

const stripeCreateMock = mock.fn(async (_params: unknown) => {
  void _params;
  return { id: 'acct_new' };
});
const stripeUpdateMock = mock.fn(async () => ({}));
const stripeRetrieveMock = mock.fn(async () => ({ id: 'acct_new' }));
const stripeAccountLinkCreateMock = mock.fn(async () => ({ url: 'https://connect.stripe.com/onboarding/test' }));

function makeStripeClientMock() {
  return {
    v2: {
      core: {
        accounts: {
          create: stripeCreateMock,
          update: stripeUpdateMock,
          retrieve: stripeRetrieveMock,
        },
        accountLinks: {
          create: stripeAccountLinkCreateMock,
        },
      },
    },
  };
}

let getStripeClientImpl = makeStripeClientMock;

test.beforeEach(() => {
  getStripeClientImpl = makeStripeClientMock;
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => 'http://localhost:3000',
    getServerEnv: () => ({
      NODE_ENV: 'test',
      STRIPE_CONNECT_CALLBACK_BASE_URL: 'https://seller.test',
      STRIPE_CONNECT_STATE_SECRET: 'test-stripe-connect-state-secret-value',
    }),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/stripe/connect',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    }),
    logAuditEvent: async () => undefined,
  },
});

mock.module('next-intl/server', {
  namedExports: {
    getTranslations: async () => ((key: string) => {
      if (key === 'stripe_prefill_description') return 'Localized Stripe prefill description';
      return key;
    }),
  },
});

mock.module('@/lib/stripe/connect-sample', {
  namedExports: {
    CONNECT_ACCOUNT_RETRIEVE_INCLUDE: ['requirements'],
    CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS: ['recipient', 'merchant'],
    computeConnectAccountStatus: () => ({
      accountId: 'acct_new',
      readyToReceivePayments: true,
      onboardingComplete: true,
      requirementsStatus: 'not_due',
      transferCapabilityStatus: 'active',
    }),
    buildStripeConnectAccountCreateParams: (input: {
      displayName?: string;
      contactEmail?: string;
      country?: string;
      businessUrl?: string;
      businessDescription?: string;
      businessMcc?: string;
    }) => ({
      display_name: input.displayName,
      contact_email: input.contactEmail,
      dashboard: 'express',
      identity: { country: input.country?.toLowerCase() },
      business_profile: {
        url: input.businessUrl,
        product_description: input.businessDescription,
        mcc: input.businessMcc,
      },
    }),
    buildStripeConnectAccountUpdateParams: (input: {
      displayName?: string;
      contactEmail?: string;
      country?: string;
      businessUrl?: string;
      businessDescription?: string;
      businessMcc?: string;
    }) => ({
      display_name: input.displayName,
      contact_email: input.contactEmail,
      dashboard: 'express',
      identity: { country: input.country?.toLowerCase() },
      business_profile: {
        url: input.businessUrl,
        product_description: input.businessDescription,
        mcc: input.businessMcc,
      },
    }),
    getStripeClientForConnectSample: () => getStripeClientImpl(),
  },
});

function makeSupabaseClient(user: UserLike, profile: ProfileLike) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => {
      if (table !== 'profiles') {
        throw new Error(`Unexpected table ${table}`);
      }

      const selectQuery = {
        select: () => selectQuery,
        eq: () => selectQuery,
        single: async () => ({ data: profile, error: profile ? null : { message: 'not found' } }),
      };

      return {
        ...selectQuery,
        update: (_payload: unknown) => {
          void _payload;
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  };
}

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/stripe/connect/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST ?? routeModule.default?.POST;
}

function makeRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/stripe/connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      referer: 'http://localhost:3000/en/vendor',
    },
    body: JSON.stringify(payload),
  });
}

test('POST /api/stripe/connect returns country_required when profile.country is missing', async () => {
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '11111111-1111-4111-8111-111111111111', email: 'seller@example.com' },
      {
        role: 'seller',
        stripe_account_id: null,
        display_name: 'Seller',
        shop_name: 'Shop',
        country: null,
      },
    );

  const POST = await loadPostHandler('country-required');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'country_required',
    message: 'Add a valid country to your vendor profile before Stripe onboarding.',
  });
});

test('POST /api/stripe/connect returns country_unsupported when profile.country is not in allowlist', async () => {
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '22222222-2222-4222-8222-222222222222', email: 'seller@example.com' },
      {
        role: 'seller',
        stripe_account_id: null,
        display_name: 'Seller',
        shop_name: 'Shop',
        country: 'ZZ',
      },
    );

  const POST = await loadPostHandler('country-unsupported');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'country_unsupported',
    message: 'Country is not supported for marketplace onboarding.',
  });
});

test('POST /api/stripe/connect returns setup error when Stripe secret key is missing', async () => {
  getStripeClientImpl = () => {
    throw new Error(
      'Missing STRIPE_SECRET_KEY. Configure a real Stripe secret key before using Stripe Connect.',
    );
  };

  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '55555555-5555-4555-8555-555555555555', email: 'seller@example.com' },
      {
        role: 'seller',
        stripe_account_id: null,
        display_name: 'Seller',
        shop_name: 'Shop',
        country: 'CA',
      },
    );

  const POST = await loadPostHandler('missing-stripe-secret-key');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: 'stripe_connect_secret_key_missing',
    message: 'Stripe onboarding is not configured. Add STRIPE_SECRET_KEY before connecting sellers.',
  });
});

test('POST /api/stripe/connect creates account with country from profile', async () => {
  stripeCreateMock.mock.resetCalls();
  stripeAccountLinkCreateMock.mock.resetCalls();

  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '33333333-3333-4333-8333-333333333333', email: 'seller@example.com' },
      {
        role: 'seller',
        stripe_account_id: null,
        display_name: 'Seller',
        shop_name: 'Shop',
        country: 'CA',
        business_url: 'https://vendor.example.com',
        business_description: null,
        business_mcc: '5817',
      },
    );

  const POST = await loadPostHandler('create-success');
  const response = await POST(makeRequest({ locale: 'fr' }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.url, 'string');
  assert.equal(stripeCreateMock.mock.callCount(), 1);
  const createArgs = stripeCreateMock.mock.calls[0]?.arguments?.[0] as {
    identity?: { country?: string };
    business_profile?: { url?: string; product_description?: string; mcc?: string };
  };
  assert.equal(createArgs.identity?.country, 'ca');
  assert.equal(createArgs.business_profile?.url, 'https://vendor.example.com/');
  assert.equal(createArgs.business_profile?.product_description, 'Localized Stripe prefill description');
  assert.equal(createArgs.business_profile?.mcc, '5817');

  const accountLinkCalls = stripeAccountLinkCreateMock.mock.calls as unknown as Array<{ arguments: unknown[] }>;
  const accountLinkArgs = accountLinkCalls[0]?.arguments?.[0] as {
    use_case?: { account_onboarding?: { refresh_url?: string; return_url?: string } };
  };
  const refreshUrl = new URL(accountLinkArgs.use_case?.account_onboarding?.refresh_url ?? '');
  const returnUrl = new URL(accountLinkArgs.use_case?.account_onboarding?.return_url ?? '');
  assert.equal(refreshUrl.origin, 'https://seller.test');
  assert.equal(refreshUrl.pathname, '/api/stripe/connect/refresh');
  assert.equal(refreshUrl.searchParams.has('state'), true);
  assert.equal(returnUrl.origin, 'https://seller.test');
  assert.equal(returnUrl.pathname, '/fr/vendor');
  assert.equal(returnUrl.searchParams.get('stripe_connect_return'), '1');
  assert.equal(returnUrl.searchParams.has('state'), true);
});

test('POST /api/stripe/connect resumes existing account when country is missing', async () => {
  stripeCreateMock.mock.resetCalls();
  stripeUpdateMock.mock.resetCalls();
  stripeAccountLinkCreateMock.mock.resetCalls();

  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '44444444-4444-4444-8444-444444444444', email: 'seller@example.com' },
      {
        role: 'seller',
        stripe_account_id: 'acct_existing',
        display_name: 'Seller',
        shop_name: 'Shop',
        country: null,
      },
    );

  const POST = await loadPostHandler('resume-existing');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 200);
  assert.equal(stripeCreateMock.mock.callCount(), 0);
  assert.equal(stripeUpdateMock.mock.callCount(), 1);
  assert.equal(stripeAccountLinkCreateMock.mock.callCount(), 1);
  const accountLinkCalls = stripeAccountLinkCreateMock.mock.calls as unknown as Array<{ arguments: unknown[] }>;
  const accountLinkArgs = accountLinkCalls[0]?.arguments?.[0] as {
    account?: string;
    use_case?: { account_onboarding?: { refresh_url?: string } };
  };
  assert.equal(accountLinkArgs.account, 'acct_existing');
  assert.equal(new URL(accountLinkArgs.use_case?.account_onboarding?.refresh_url ?? '').pathname, '/api/stripe/connect/refresh');
});

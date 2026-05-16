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
} | null;

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

const accountLinkCreateMock = mock.fn(async () => ({
  url: 'https://connect.stripe.com/onboarding/refreshed',
}));

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => 'https://seller.test',
    getServerEnv: () => ({
      NODE_ENV: 'test',
      STRIPE_CONNECT_CALLBACK_BASE_URL: 'https://seller.test',
      STRIPE_CONNECT_STATE_SECRET: 'test-stripe-connect-state-secret-value',
    }),
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/stripe/connect/refresh',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    }),
    logAuditEvent: async () => undefined,
  },
});

mock.module('@/lib/stripe/connect-sample', {
  namedExports: {
    CONNECT_ACCOUNT_ONBOARDING_CONFIGURATIONS: ['recipient', 'merchant'],
    getStripeClientForConnectSample: () => ({
      v2: {
        core: {
          accountLinks: {
            create: accountLinkCreateMock,
          },
        },
      },
    }),
  },
});

function makeProfileQuery(profile: ProfileLike) {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: profile, error: profile ? null : { message: 'not found' } }),
  };
  return query;
}

function makeSupabaseClient(user: UserLike, profile: ProfileLike) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => {
      if (table !== 'profiles') {
        throw new Error(`Unexpected table ${table}`);
      }
      return makeProfileQuery(profile);
    },
  };
}

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/stripe/connect/refresh/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET ?? routeModule.default?.GET;
}

async function createState() {
  const { createStripeConnectState } = await import(
    `../../src/lib/stripe/connect-state.ts?state=${Date.now()}-${Math.random()}`
  );

  return createStripeConnectState({
    userId: 'user_refresh',
    stripeAccountId: 'acct_refresh',
    locale: 'fr',
    purpose: 'vendor_onboarding',
  });
}

test('GET /api/stripe/connect/refresh redirects to a fresh Stripe Account Link', async () => {
  accountLinkCreateMock.mock.resetCalls();
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: 'user_refresh', email: 'seller@example.com' },
      { role: 'seller', stripe_account_id: 'acct_refresh' },
    );
  const state = await createState();
  const GET = await loadGetHandler('valid-refresh');
  const response = await GET(new Request(`https://seller.test/api/stripe/connect/refresh?state=${encodeURIComponent(state)}`));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://connect.stripe.com/onboarding/refreshed');
  assert.equal(accountLinkCreateMock.mock.callCount(), 1);
  const accountLinkCalls = accountLinkCreateMock.mock.calls as unknown as Array<{ arguments: unknown[] }>;
  const accountLinkArgs = accountLinkCalls[0]?.arguments?.[0] as {
    account?: string;
    use_case?: { account_onboarding?: { refresh_url?: string; return_url?: string } };
  };
  assert.equal(accountLinkArgs.account, 'acct_refresh');
  assert.equal(new URL(accountLinkArgs.use_case?.account_onboarding?.refresh_url ?? '').pathname, '/api/stripe/connect/refresh');
  assert.equal(new URL(accountLinkArgs.use_case?.account_onboarding?.return_url ?? '').searchParams.get('stripe_connect_return'), '1');
});

test('GET /api/stripe/connect/refresh redirects invalid state back to vendor dashboard', async () => {
  const GET = await loadGetHandler('invalid-state');
  const response = await GET(new Request('https://seller.test/api/stripe/connect/refresh?state=bad'));

  assert.equal(response.status, 303);
  const location = new URL(response.headers.get('location') ?? '');
  assert.equal(location.pathname, '/en/vendor');
  assert.equal(location.searchParams.get('stripe_connect_error'), 'invalid_state');
});

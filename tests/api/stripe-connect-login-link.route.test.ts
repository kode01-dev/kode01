import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type UserLike = {
  id: string;
  email?: string | null;
} | null;

type ProfileLike = {
  role: string;
  stripe_account_id: string | null;
} | null;

type AccountStatusLike = {
  readyToReceivePayments: boolean;
  onboardingComplete: boolean;
};

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

let getStripeClientForConnectSampleImpl: () => {
  v2: {
    core: {
      accounts: {
        retrieve: (accountId: string, params: { include: string[] }) => Promise<unknown>;
      };
    };
  };
  accounts: {
    createLoginLink: (accountId: string) => Promise<{ url: string }>;
  };
} = () => {
  throw new Error('getStripeClientForConnectSample mock not configured');
};

let computeConnectAccountStatusImpl: (account: unknown) => AccountStatusLike = () => ({
  readyToReceivePayments: false,
  onboardingComplete: false,
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/stripe/connect-sample', {
  namedExports: {
    CONNECT_ACCOUNT_RETRIEVE_INCLUDE: [
      'configuration.recipient',
      'configuration.merchant',
      'requirements',
    ],
    getStripeClientForConnectSample: () => getStripeClientForConnectSampleImpl(),
    computeConnectAccountStatus: (account: unknown) => computeConnectAccountStatusImpl(account),
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

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/stripe/connect/login-link/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST ?? routeModule.default?.POST;
}

function makeRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/stripe/connect/login-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

test('POST /api/stripe/connect/login-link returns 401 when user is unauthenticated', async () => {
  createClientImpl = async () => makeSupabaseClient(null, null);

  const POST = await loadPostHandler('unauthorized');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('POST /api/stripe/connect/login-link returns 403 when role is not seller', async () => {
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '11111111-1111-4111-8111-111111111111' },
      { role: 'buyer', stripe_account_id: 'acct_test_123' },
    );

  const POST = await loadPostHandler('forbidden-non-seller');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Only sellers can manage Stripe Express' });
});

test('POST /api/stripe/connect/login-link returns 403 when seller onboarding is incomplete', async () => {
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '22222222-2222-4222-8222-222222222222' },
      { role: 'seller', stripe_account_id: 'acct_test_incomplete' },
    );

  getStripeClientForConnectSampleImpl = () => ({
    v2: {
      core: {
        accounts: {
          retrieve: async () => ({ id: 'acct_test_incomplete' }),
        },
      },
    },
    accounts: {
      createLoginLink: async () => ({ url: 'https://connect.stripe.com/express/test-incomplete' }),
    },
  });

  computeConnectAccountStatusImpl = () => ({
    readyToReceivePayments: false,
    onboardingComplete: false,
  });

  const POST = await loadPostHandler('onboarding-incomplete');
  const response = await POST(makeRequest({ locale: 'en' }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Stripe onboarding is not complete' });
});

test('POST /api/stripe/connect/login-link returns 200 with URL when seller is ready', async () => {
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '33333333-3333-4333-8333-333333333333' },
      { role: 'seller', stripe_account_id: 'acct_test_ready' },
    );

  const createLoginLinkMock = mock.fn(
    async (_accountId: string) => {
      void _accountId;
      return {
        url: 'https://connect.stripe.com/express/test-ready',
      };
    },
  );

  getStripeClientForConnectSampleImpl = () => ({
    v2: {
      core: {
        accounts: {
          retrieve: async () => ({ id: 'acct_test_ready' }),
        },
      },
    },
    accounts: {
      createLoginLink: createLoginLinkMock,
    },
  });

  computeConnectAccountStatusImpl = () => ({
    readyToReceivePayments: true,
    onboardingComplete: true,
  });

  const POST = await loadPostHandler('seller-ready');
  const response = await POST(makeRequest({ locale: 'fr' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: 'https://connect.stripe.com/express/test-ready',
  });
  assert.equal(createLoginLinkMock.mock.callCount(), 1);
  const firstCallArgs = createLoginLinkMock.mock.calls[0]?.arguments;
  assert.equal(firstCallArgs?.[0], 'acct_test_ready');
});

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type UserLike = {
  id: string;
  email?: string | null;
} | null;

type ProfileLike = {
  role: string;
  country: string | null;
  stripe_account_id: string | null;
} | null;

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

const stripeBalanceRetrieveMock = mock.fn(async () => ({
  available: [{ amount: 0 }],
  pending: [{ amount: 0 }],
}));

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/stripe/connect-sample', {
  namedExports: {
    getStripeClientForConnectSample: () => ({
      balance: {
        retrieve: stripeBalanceRetrieveMock,
      },
    }),
  },
});

function makeSupabaseClient(user: UserLike, profile: ProfileLike) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        const query = {
          select: () => query,
          eq: () => query,
          single: async () => ({ data: profile, error: profile ? null : { message: 'not found' } }),
        };
        return query;
      }

      if (table === 'vendor_country_change_events') {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/stripe/connect/country-change/check/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST ?? routeModule.default?.POST;
}

function makeRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/stripe/connect/country-change/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

test('country-change/check blocks when connected account balance is not zero', async () => {
  stripeBalanceRetrieveMock.mock.resetCalls();
  stripeBalanceRetrieveMock.mock.mockImplementation(async () => ({
    available: [{ amount: 1500 }],
    pending: [{ amount: 0 }],
  }));

  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '11111111-1111-4111-8111-111111111111', email: 'seller@example.com' },
      {
        role: 'seller',
        country: 'CA',
        stripe_account_id: 'acct_old',
      },
    );

  const POST = await loadPostHandler('blocked-balance');
  const response = await POST(makeRequest({ targetCountry: 'US' }));

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error, 'balance_not_zero');
  assert.equal(stripeBalanceRetrieveMock.mock.callCount(), 1);
});

test('country-change/check passes when balances are zero', async () => {
  stripeBalanceRetrieveMock.mock.resetCalls();
  stripeBalanceRetrieveMock.mock.mockImplementation(async () => ({
    available: [{ amount: 0 }],
    pending: [{ amount: 0 }],
  }));

  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '22222222-2222-4222-8222-222222222222', email: 'seller@example.com' },
      {
        role: 'seller',
        country: 'CA',
        stripe_account_id: 'acct_old',
      },
    );

  const POST = await loadPostHandler('check-passed');
  const response = await POST(makeRequest({ targetCountry: 'US' }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.fromCountry, 'CA');
  assert.equal(payload.toCountry, 'US');
});

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type UserLike = {
  id: string;
  email?: string | null;
} | null;

type ProfileLike = {
  role: string | null;
  stripe_account_id: string | null;
} | null;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ENABLE_SAMPLE = process.env.ENABLE_STRIPE_CONNECT_SAMPLE;
const MUTABLE_ENV = process.env as Record<string, string | undefined>;

let createClientCalls = 0;
let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => {
      createClientCalls += 1;
      return createClientImpl();
    },
  },
});

function restoreEnv() {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete MUTABLE_ENV.NODE_ENV;
  } else {
    MUTABLE_ENV.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_ENABLE_SAMPLE === undefined) {
    delete MUTABLE_ENV.ENABLE_STRIPE_CONNECT_SAMPLE;
  } else {
    MUTABLE_ENV.ENABLE_STRIPE_CONNECT_SAMPLE = ORIGINAL_ENABLE_SAMPLE;
  }
}

test.beforeEach(() => {
  createClientCalls = 0;
  restoreEnv();
  createClientImpl = async () => {
    throw new Error('createClient mock not configured');
  };
});

test.after(restoreEnv);

function makeProfileQuery(profile: ProfileLike, error: { message: string } | null = null) {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: profile, error }),
  };
  return query;
}

function makeSupabaseClient(user: UserLike, profile: ProfileLike, profileError: { message: string } | null = null) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => {
      assert.equal(table, 'profiles');
      return makeProfileQuery(profile, profileError);
    },
  };
}

async function loadAccessHelper(scenario: string) {
  return import(
    `../../src/lib/stripe/connect-sample-access.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
}

test('Stripe Connect sample access is disabled in production before auth lookup', async () => {
  MUTABLE_ENV.NODE_ENV = 'production';
  MUTABLE_ENV.ENABLE_STRIPE_CONNECT_SAMPLE = 'true';

  const { requireStripeConnectSampleSeller } = await loadAccessHelper('production-disabled');
  const access = await requireStripeConnectSampleSeller();

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.status, 404);
  }
  assert.equal(createClientCalls, 0);
});

test('Stripe Connect sample access requires the explicit non-production feature flag', async () => {
  MUTABLE_ENV.NODE_ENV = 'development';
  delete MUTABLE_ENV.ENABLE_STRIPE_CONNECT_SAMPLE;

  const { requireStripeConnectSampleSeller } = await loadAccessHelper('flag-disabled');
  const access = await requireStripeConnectSampleSeller();

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.status, 404);
  }
  assert.equal(createClientCalls, 0);
});

test('Stripe Connect sample access rejects authenticated non-sellers', async () => {
  MUTABLE_ENV.NODE_ENV = 'development';
  MUTABLE_ENV.ENABLE_STRIPE_CONNECT_SAMPLE = 'true';
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.com' },
      { role: 'buyer', stripe_account_id: null },
    );

  const { requireStripeConnectSampleSeller } = await loadAccessHelper('non-seller');
  const access = await requireStripeConnectSampleSeller();

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.status, 403);
  }
});

test('Stripe Connect sample access allows flagged non-production sellers', async () => {
  MUTABLE_ENV.NODE_ENV = 'development';
  MUTABLE_ENV.ENABLE_STRIPE_CONNECT_SAMPLE = 'true';
  createClientImpl = async () =>
    makeSupabaseClient(
      { id: '22222222-2222-4222-8222-222222222222', email: 'seller@example.com' },
      { role: 'seller', stripe_account_id: 'acct_test_123' },
    );

  const { requireStripeConnectSampleSeller } = await loadAccessHelper('seller');
  const access = await requireStripeConnectSampleSeller();

  assert.equal(access.ok, true);
  if (access.ok) {
    assert.equal(access.user.id, '22222222-2222-4222-8222-222222222222');
    assert.equal(access.profile.stripe_account_id, 'acct_test_123');
  }
});

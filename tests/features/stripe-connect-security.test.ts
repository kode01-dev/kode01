import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: undefined,
});

const MUTABLE_ENV = process.env as Record<string, string | undefined>;
const ORIGINAL_ENV = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  STRIPE_CONNECT_CALLBACK_BASE_URL: process.env.STRIPE_CONNECT_CALLBACK_BASE_URL,
  STRIPE_CONNECT_STATE_SECRET: process.env.STRIPE_CONNECT_STATE_SECRET,
};

function resetEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete MUTABLE_ENV[key];
    } else {
      MUTABLE_ENV[key] = value;
    }
  }
}

test.beforeEach(resetEnv);
test.after(resetEnv);

async function importStateModule(scenario: string) {
  return import(`../../src/lib/stripe/connect-state.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

async function importCallbackUrlModule(scenario: string) {
  return import(`../../src/lib/stripe/connect-callback-url.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('Stripe Connect state verifies valid signed payloads', async () => {
  MUTABLE_ENV.STRIPE_CONNECT_STATE_SECRET = 'test-stripe-connect-state-secret-value';
  const { createStripeConnectState, verifyStripeConnectState } = await importStateModule('valid-state');

  const state = createStripeConnectState({
    userId: 'user_123',
    stripeAccountId: 'acct_123',
    locale: 'fr',
    purpose: 'vendor_onboarding',
  }, 1000);

  const result = verifyStripeConnectState(state, {
    expectedUserId: 'user_123',
    expectedStripeAccountId: 'acct_123',
    expectedPurpose: 'vendor_onboarding',
    now: 1000,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.locale, 'fr');
  }
});

test('Stripe Connect state creation still requires its own secret', async () => {
  delete MUTABLE_ENV.STRIPE_CONNECT_STATE_SECRET;
  const { createStripeConnectState, StripeConnectStateSecretError } = await importStateModule('missing-state-secret');

  assert.throws(
    () =>
      createStripeConnectState({
        userId: 'user_123',
        stripeAccountId: 'acct_123',
        locale: 'fr',
        purpose: 'vendor_onboarding',
      }),
    (error: unknown) => error instanceof StripeConnectStateSecretError,
  );
});

test('Stripe Connect state rejects expired, tampered, and wrong-user payloads', async () => {
  MUTABLE_ENV.STRIPE_CONNECT_STATE_SECRET = 'test-stripe-connect-state-secret-value';
  const { createStripeConnectState, verifyStripeConnectState } = await importStateModule('invalid-state');
  const state = createStripeConnectState({
    userId: 'user_123',
    stripeAccountId: 'acct_123',
    locale: 'en',
    purpose: 'vendor_onboarding',
  }, 1000);

  assert.deepEqual(
    verifyStripeConnectState(state, { expectedUserId: 'user_123', now: 1000 + 11 * 60 * 1000 }),
    { ok: false, reason: 'expired' },
  );
  assert.deepEqual(
    verifyStripeConnectState(`${state.slice(0, -3)}abc`, { now: 1000 }),
    { ok: false, reason: 'signature_mismatch' },
  );
  assert.deepEqual(
    verifyStripeConnectState(state, { expectedUserId: 'user_456', now: 1000 }),
    { ok: false, reason: 'wrong_user' },
  );
});

test('Stripe Connect callback URL resolver accepts HTTPS callback override', async () => {
  MUTABLE_ENV.STRIPE_CONNECT_CALLBACK_BASE_URL = 'https://stripe-callback.example.com/path';
  MUTABLE_ENV.APP_BASE_URL = 'http://localhost:3000';

  const { resolveStripeConnectCallbackBaseUrl } = await importCallbackUrlModule('https-override');
  assert.equal(
    resolveStripeConnectCallbackBaseUrl(new Request('http://localhost:3000/api/stripe/connect')),
    'https://stripe-callback.example.com',
  );
});

test('Stripe Connect callback URL resolver refuses HTTP-only local configuration', async () => {
  delete MUTABLE_ENV.STRIPE_CONNECT_CALLBACK_BASE_URL;
  MUTABLE_ENV.APP_BASE_URL = 'http://localhost:3000';
  delete MUTABLE_ENV.NEXT_PUBLIC_APP_URL;

  const {
    resolveStripeConnectCallbackBaseUrl,
    STRIPE_CONNECT_CALLBACK_HTTPS_ERROR,
    StripeConnectCallbackUrlError,
  } = await importCallbackUrlModule('http-refused');

  assert.throws(
    () => resolveStripeConnectCallbackBaseUrl(new Request('http://localhost:3000/api/stripe/connect')),
    (error: unknown) => {
      const candidate = error as { code?: string };
      return (
        error instanceof StripeConnectCallbackUrlError &&
        candidate.code === STRIPE_CONNECT_CALLBACK_HTTPS_ERROR
      );
    },
  );
});

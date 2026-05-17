import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: undefined,
});

const MUTABLE_ENV = process.env as Record<string, string | undefined>;
const ORIGINAL_STRIPE_ENV = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_CONNECT_THIN_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_THIN_WEBHOOK_SECRET,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
};

function resetStripeEnv(): void {
  if (ORIGINAL_STRIPE_ENV.STRIPE_SECRET_KEY === undefined) {
    delete MUTABLE_ENV.STRIPE_SECRET_KEY;
  } else {
    MUTABLE_ENV.STRIPE_SECRET_KEY = ORIGINAL_STRIPE_ENV.STRIPE_SECRET_KEY;
  }

  if (ORIGINAL_STRIPE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET === undefined) {
    delete MUTABLE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET;
  } else {
    MUTABLE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET =
      ORIGINAL_STRIPE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET;
  }

  if (ORIGINAL_STRIPE_ENV.STRIPE_WEBHOOK_SECRET === undefined) {
    delete MUTABLE_ENV.STRIPE_WEBHOOK_SECRET;
  } else {
    MUTABLE_ENV.STRIPE_WEBHOOK_SECRET = ORIGINAL_STRIPE_ENV.STRIPE_WEBHOOK_SECRET;
  }
}

test.beforeEach(resetStripeEnv);
test.after(resetStripeEnv);

async function importConnectSample() {
  return import(
    `../../src/lib/stripe/connect-sample.ts?case=${Date.now()}-${Math.random()}`
  );
}

test('getStripeClientForConnectSample rejects placeholder-like secret keys', async () => {
  const { getStripeClientForConnectSample } = await importConnectSample();

  for (const secretKey of ['sk_test_xxx', 'sk_test_xxxxxx', 'sk_live_xxx']) {
    MUTABLE_ENV.STRIPE_SECRET_KEY = secretKey;
    assert.throws(
      () => getStripeClientForConnectSample(),
      /Missing STRIPE_SECRET_KEY/,
      `Expected placeholder key ${secretKey} to be rejected`,
    );
  }
});

test('getStripeClientForConnectSample accepts a configured Stripe secret key', async () => {
  const { getStripeClientForConnectSample } = await importConnectSample();

  MUTABLE_ENV.STRIPE_SECRET_KEY = 'sk_test_valid_connect_sample_secret_123';

  assert.doesNotThrow(() => getStripeClientForConnectSample());
});

test('getStripeConnectThinWebhookSecret rejects placeholder-like webhook secrets', async () => {
  const { getStripeConnectThinWebhookSecret } = await importConnectSample();

  for (const webhookSecret of ['whsec_xxx', 'whsec_xxxxx']) {
    MUTABLE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET = webhookSecret;
    delete MUTABLE_ENV.STRIPE_WEBHOOK_SECRET;

    assert.throws(
      () => getStripeConnectThinWebhookSecret(),
      /Missing STRIPE_CONNECT_THIN_WEBHOOK_SECRET/,
      `Expected placeholder webhook secret ${webhookSecret} to be rejected`,
    );
  }
});

test('getStripeConnectThinWebhookSecret falls back to STRIPE_WEBHOOK_SECRET', async () => {
  const { getStripeConnectThinWebhookSecret } = await importConnectSample();

  delete MUTABLE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET;
  MUTABLE_ENV.STRIPE_WEBHOOK_SECRET = 'whsec_live_realsecret123';

  assert.equal(getStripeConnectThinWebhookSecret(), 'whsec_live_realsecret123');
});

test('getStripeConnectThinWebhookSecret falls back when connect thin secret is placeholder or blank', async () => {
  const { getStripeConnectThinWebhookSecret } = await importConnectSample();

  MUTABLE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET = 'whsec_xxx';
  MUTABLE_ENV.STRIPE_WEBHOOK_SECRET = 'whsec_live_realsecret456';
  assert.equal(getStripeConnectThinWebhookSecret(), 'whsec_live_realsecret456');

  MUTABLE_ENV.STRIPE_CONNECT_THIN_WEBHOOK_SECRET = '  ';
  assert.equal(getStripeConnectThinWebhookSecret(), 'whsec_live_realsecret456');
});

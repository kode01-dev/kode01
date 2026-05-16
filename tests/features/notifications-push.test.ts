import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type MutableEnv = Record<string, string | undefined>;

const MUTABLE_ENV = process.env as MutableEnv;

mock.module('server-only', {
  defaultExport: {},
});

function withEnv(overrides: MutableEnv, run: () => Promise<void> | void) {
  const snapshot = { ...MUTABLE_ENV };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete MUTABLE_ENV[key];
    } else {
      MUTABLE_ENV[key] = value;
    }
  }

  return Promise.resolve(run()).finally(() => {
    for (const key of Object.keys(MUTABLE_ENV)) {
      delete MUTABLE_ENV[key];
    }
    for (const [key, value] of Object.entries(snapshot)) {
      MUTABLE_ENV[key] = value;
    }
  });
}

async function loadPushModule(scenario: string) {
  return import(`../../src/features/notifications/server/push.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('push subscription schema validates browser subscription payloads', async () => {
  const { pushSubscriptionSchema } = await loadPushModule('schema');

  const parsed = pushSubscriptionSchema.safeParse({
    endpoint: 'https://push.example.test/send/abc',
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
  });

  assert.equal(parsed.success, true);
});

test('push subscription schema rejects missing crypto keys', async () => {
  const { pushSubscriptionSchema } = await loadPushModule('schema-invalid');

  const parsed = pushSubscriptionSchema.safeParse({
    endpoint: 'https://push.example.test/send/abc',
    keys: {
      p256dh: 'p256dh-key',
    },
  });

  assert.equal(parsed.success, false);
});

test('push retry delay uses capped exponential backoff', async () => {
  const { getPushRetryDelaySeconds } = await loadPushModule('retry');

  assert.equal(getPushRetryDelaySeconds(1), 60);
  assert.equal(getPushRetryDelaySeconds(3), 240);
  assert.equal(getPushRetryDelaySeconds(20), 3600);
});

test('push permanent error detection covers expired subscriptions', async () => {
  const { isPermanentWebPushError } = await loadPushModule('permanent-errors');

  assert.equal(isPermanentWebPushError({ statusCode: 410 }), true);
  assert.equal(isPermanentWebPushError({ statusCode: 404 }), true);
  assert.equal(isPermanentWebPushError({ statusCode: 503 }), false);
});

test('push public config does not expose private VAPID key', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'public-key',
      VAPID_PRIVATE_KEY: 'private-key',
    },
    async () => {
      const { getPushPublicConfig } = await loadPushModule('public-config');
      assert.deepEqual(getPushPublicConfig(), {
        enabled: true,
        publicKey: 'public-key',
      });
    },
  );
});

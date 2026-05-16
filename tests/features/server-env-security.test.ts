import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type MutableEnv = Record<string, string | undefined>;

const MUTABLE_ENV = process.env as MutableEnv;
const TEST_STRIPE_CONNECT_STATE_SECRET = 'test_stripe_connect_state_secret_32_chars';

mock.module('server-only', {
  defaultExport: {},
});

function withEnv(overrides: MutableEnv, run: () => Promise<void> | void) {
  const snapshot = { ...MUTABLE_ENV };
  for (const key of Object.keys(MUTABLE_ENV)) {
    delete MUTABLE_ENV[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    MUTABLE_ENV[key] = value;
  }
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

async function loadServerEnv(scenario: string) {
  return import(`../../src/lib/env/server.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('server env parses production config without requiring unrelated feature secrets', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      AUDIT_LOG_INTEGRITY_SECRET: undefined,
      STRIPE_CONNECT_STATE_SECRET: undefined,
    },
    async () => {
      const { getServerEnv } = await loadServerEnv('missing-feature-secrets');
      const env = getServerEnv();
      assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://project.supabase.co');
      assert.equal(env.AUDIT_LOG_INTEGRITY_SECRET, undefined);
      assert.equal(env.STRIPE_CONNECT_STATE_SECRET, undefined);
    },
  );
});

test('server env required helper rejects only the keys requested by the caller', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      AUDIT_LOG_INTEGRITY_SECRET: undefined,
      STRIPE_CONNECT_STATE_SECRET: undefined,
    },
    async () => {
      const { getRequiredServerEnv, MissingServerEnvError } = await loadServerEnv('requested-keys-only');

      const env = getRequiredServerEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
      assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://project.supabase.co');
      assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'service-role');

      assert.throws(
        () => getRequiredServerEnv(['NEXT_PUBLIC_SUPABASE_ANON_KEY']),
        (error: unknown) => {
          if (!(error instanceof MissingServerEnvError)) return false;
          const candidate = error as Error & { keys: string[] };
          return (
            candidate.message === 'Missing required environment variables: NEXT_PUBLIC_SUPABASE_ANON_KEY' &&
            candidate.keys.length === 1 &&
            candidate.keys[0] === 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
          );
        },
      );
    },
  );
});

test('server env allows production boot when audit integrity secret is provided', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      STRIPE_CONNECT_STATE_SECRET: TEST_STRIPE_CONNECT_STATE_SECRET,
    },
    async () => {
      const { getServerEnv } = await loadServerEnv('with-audit-secret');
      const env = getServerEnv();
      assert.equal(env.AUDIT_LOG_INTEGRITY_SECRET, 'audit-log-integrity-secret-value');
    },
  );
});

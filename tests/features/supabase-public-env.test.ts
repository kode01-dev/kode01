import assert from 'node:assert/strict';
import { test } from 'node:test';

type MutableEnv = Record<string, string | undefined>;

const MUTABLE_ENV = process.env as MutableEnv;

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

async function loadSupabaseEnv(scenario: string) {
  return import(`../../src/lib/supabase/env.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('supabase public env accepts publishable key without legacy anon key', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://noemwcxtlibtimusldyn.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value',
    },
    async () => {
      const { getSupabasePublicEnv, isSupabasePublicEnvConfigured } = await loadSupabaseEnv('publishable');
      const env = getSupabasePublicEnv();

      assert.equal(isSupabasePublicEnvConfigured(), true);
      assert.equal(env.supabaseUrl, 'https://noemwcxtlibtimusldyn.supabase.co');
      assert.equal(env.supabaseAnonKey, 'sb_publishable_test_value');
    },
  );
});

test('supabase public env rejects secret API keys', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://noemwcxtlibtimusldyn.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_this_must_not_be_public',
    },
    async () => {
      const { getSupabasePublicEnv } = await loadSupabaseEnv('secret-key');

      assert.throws(
        () => getSupabasePublicEnv(),
        /secret keys must never be exposed to browser clients/,
      );
    },
  );
});

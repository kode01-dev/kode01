import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { mock, test } from 'node:test';
import { buildInternalAuthHeaders } from '@/lib/security/internal-auth';

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

async function loadCronAuth(scenario: string) {
  return import(`../../src/lib/security/cron-auth.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

function createJwt(payload: Record<string, unknown>, secret: string): string {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function makeRequest(urlPath: string, headers: HeadersInit, method = 'GET'): Request {
  return new Request(`https://kode01.test${urlPath}`, { method, headers });
}

test('cron auth accepts legacy bearer secret in development when signed auth is not required', async () => {
  await withEnv(
    {
      NODE_ENV: 'development',
      CRON_SECRET: 'dev-cron-secret',
      CRON_AUTH_REQUIRE_SIGNATURE: 'false',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    },
    async () => {
      const { isCronAuthorized } = await loadCronAuth('dev-plain-bearer');
      const authorized = isCronAuthorized(
        makeRequest('/api/cron/keep-warm', { Authorization: 'Bearer dev-cron-secret' }),
      );
      assert.equal(authorized, true);
    },
  );
});

test('cron auth requires signed requests by default in production', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      CRON_SECRET: 'prod-cron-secret',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      STRIPE_CONNECT_STATE_SECRET: TEST_STRIPE_CONNECT_STATE_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    },
    async () => {
      const { isCronAuthorized } = await loadCronAuth('prod-signature-required');
      const authorized = isCronAuthorized(
        makeRequest('/api/cron/keep-warm', { Authorization: 'Bearer prod-cron-secret' }),
      );
      assert.equal(authorized, false);
    },
  );
});

test('cron auth accepts valid signed requests in production', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      CRON_SECRET: 'prod-cron-secret',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      STRIPE_CONNECT_STATE_SECRET: TEST_STRIPE_CONNECT_STATE_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    },
    async () => {
      const path = '/api/cron/weekly-ai-recap';
      const method = 'POST';
      const signedHeaders = buildInternalAuthHeaders({
        method,
        path,
        secret: 'prod-cron-secret',
      });

      const { isCronAuthorized } = await loadCronAuth('prod-valid-signature');
      const authorized = isCronAuthorized(makeRequest(path, signedHeaders, method));
      assert.equal(authorized, true);
    },
  );
});

test('cron auth rejects expired signed requests', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      CRON_SECRET: 'prod-cron-secret',
      CRON_AUTH_MAX_SKEW_SECONDS: '300',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      STRIPE_CONNECT_STATE_SECRET: TEST_STRIPE_CONNECT_STATE_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    },
    async () => {
      const path = '/api/cron/weekly-ai-recap';
      const method = 'POST';
      const staleDate = new Date(Date.now() - 10 * 60 * 1000);
      const signedHeaders = buildInternalAuthHeaders({
        method,
        path,
        secret: 'prod-cron-secret',
        now: staleDate,
      });

      const { isCronAuthorized } = await loadCronAuth('prod-expired-signature');
      const authorized = isCronAuthorized(makeRequest(path, signedHeaders, method));
      assert.equal(authorized, false);
    },
  );
});

test('cron auth validates HS256 JWT issuer/audience/expiry claims', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      CRON_SECRET: 'prod-cron-secret',
      CRON_AUTH_REQUIRE_SIGNATURE: 'false',
      CRON_JWT_ISSUER: 'kode01-cron',
      CRON_JWT_AUDIENCE: 'kode01-api',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      STRIPE_CONNECT_STATE_SECRET: TEST_STRIPE_CONNECT_STATE_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    },
    async () => {
      const exp = Math.floor(Date.now() / 1000) + 60;
      const token = createJwt(
        {
          iss: 'kode01-cron',
          aud: 'kode01-api',
          exp,
        },
        'prod-cron-secret',
      );

      const { isCronAuthorized } = await loadCronAuth('prod-jwt-valid');
      const authorized = isCronAuthorized(
        makeRequest('/api/cron/send-emails', { Authorization: `Bearer ${token}` }),
      );
      assert.equal(authorized, true);
    },
  );
});

test('cron auth rejects JWT with audience mismatch', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      CRON_SECRET: 'prod-cron-secret',
      CRON_AUTH_REQUIRE_SIGNATURE: 'false',
      CRON_JWT_ISSUER: 'kode01-cron',
      CRON_JWT_AUDIENCE: 'kode01-api',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      STRIPE_CONNECT_STATE_SECRET: TEST_STRIPE_CONNECT_STATE_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    },
    async () => {
      const exp = Math.floor(Date.now() / 1000) + 60;
      const token = createJwt(
        {
          iss: 'kode01-cron',
          aud: 'unexpected-audience',
          exp,
        },
        'prod-cron-secret',
      );

      const { isCronAuthorized } = await loadCronAuth('prod-jwt-invalid-aud');
      const authorized = isCronAuthorized(
        makeRequest('/api/cron/send-emails', { Authorization: `Bearer ${token}` }),
      );
      assert.equal(authorized, false);
    },
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

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

async function loadRateLimiter(scenario: string) {
  return import(`../../src/lib/security/rate-limiter.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('rate limiter applies in-memory fallback limits when Redis/RPC backend is unavailable', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      RATE_LIMIT_FAILURE_MODE: 'open',
      RATE_LIMIT_IN_MEMORY_FALLBACK_ENABLED: 'true',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
    },
    async () => {
      const originalFetch = globalThis.fetch;
      const originalConsoleError = console.error;
      const consoleErrors: unknown[] = [];

      globalThis.fetch = (async () => {
        throw new Error('simulated redis/rpc outage');
      }) as typeof fetch;
      console.error = (...args: unknown[]) => {
        consoleErrors.push(args);
      };

      try {
        const { checkRateLimit } = await loadRateLimiter('in-memory-fallback');
        const first = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.1',
        });
        const second = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.1',
        });
        const third = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.1',
        });
        const fourth = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.1',
        });

        assert.equal(first.degraded, true);
        assert.equal(first.allowed, true);
        assert.equal(second.allowed, true);
        assert.equal(third.allowed, true);
        assert.equal(fourth.allowed, false);
        assert.equal(fourth.remaining, 0);
        assert.equal(consoleErrors.length > 0, true);
      } finally {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
      }
    },
  );
});

test('rate limiter keeps legacy mode-based fallback when in-memory fallback is disabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      RATE_LIMIT_FAILURE_MODE: 'open',
      RATE_LIMIT_IN_MEMORY_FALLBACK_ENABLED: 'false',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
    },
    async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error('simulated redis/rpc outage');
      }) as typeof fetch;

      try {
        const { checkRateLimit } = await loadRateLimiter('mode-fallback');
        const one = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.2',
        });
        const two = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.2',
        });
        const three = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.2',
        });
        const four = await checkRateLimit({
          action: 'SIGNUP',
          key: 'rate-limit:signup:198.51.100.2',
        });

        assert.equal(one.allowed, true);
        assert.equal(two.allowed, true);
        assert.equal(three.allowed, true);
        assert.equal(four.allowed, true);
        assert.equal(four.degraded, true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

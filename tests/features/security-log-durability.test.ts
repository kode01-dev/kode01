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

async function loadSecurityLogModule(scenario: string) {
  return import(`../../src/lib/security/security-log.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('audit logging queues failed inserts and flushes the queue when backend recovers', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      AUDIT_LOG_INTEGRITY_SECRET: 'audit-log-integrity-secret-value',
      SERVER_EGRESS_ENFORCE: 'false',
    },
    async () => {
      let failWrites = true;
      let calls = 0;
      const originalFetch = globalThis.fetch;
      const originalConsoleError = console.error;
      const consoleErrors: unknown[] = [];

      globalThis.fetch = (async () => {
        calls += 1;
        if (failWrites) {
          throw new Error('simulated supabase outage');
        }
        return new Response('', { status: 201 });
      }) as typeof fetch;
      console.error = (...args: unknown[]) => {
        consoleErrors.push(args);
      };

      try {
        const { getAuditDeliveryMetrics, logSecurityEvent } = await loadSecurityLogModule('audit-queue');

        await logSecurityEvent({
          eventType: 'security.test.failure',
          metadata: { test_case: 'queue' },
        });

        const afterFailure = getAuditDeliveryMetrics();
        assert.equal(afterFailure.queueDepth >= 1, true);
        assert.equal(afterFailure.failuresInWindow > 0, true);

        failWrites = false;
        await logSecurityEvent({
          eventType: 'security.test.recovery',
          metadata: { test_case: 'recovery' },
        });

        await wait(1_200);
        const afterRecovery = getAuditDeliveryMetrics();
        assert.equal(afterRecovery.queueDepth, 0);
        assert.equal(calls >= 4, true);
        assert.equal(consoleErrors.length > 0, true);
      } finally {
        globalThis.fetch = originalFetch;
        console.error = originalConsoleError;
      }
    },
  );
});

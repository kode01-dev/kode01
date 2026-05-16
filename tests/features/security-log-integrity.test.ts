import assert from 'node:assert/strict';
import test from 'node:test';
import { logSecurityEvent } from '@/lib/security/security-log';

type EnvSnapshot = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AUDIT_LOG_INTEGRITY_SECRET?: string;
  AUDIT_LOG_INTEGRITY_KEY_ID?: string;
};

function withEnv(overrides: Partial<EnvSnapshot>, run: () => Promise<void>) {
  const snapshot: EnvSnapshot = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUDIT_LOG_INTEGRITY_SECRET: process.env.AUDIT_LOG_INTEGRITY_SECRET,
    AUDIT_LOG_INTEGRITY_KEY_ID: process.env.AUDIT_LOG_INTEGRITY_KEY_ID,
  };

  Object.assign(process.env, overrides);
  return run().finally(() => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });
}

test('logSecurityEvent writes correlation and integrity metadata', async () => {
  await withEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      AUDIT_LOG_INTEGRITY_SECRET: 'test-audit-integrity-secret-value-32chars',
      AUDIT_LOG_INTEGRITY_KEY_ID: 'test-key-v1',
    },
    async () => {
      const originalFetch = globalThis.fetch;
      let capturedBody: Record<string, unknown> | null = null;

      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? init.body : '{}';
        capturedBody = JSON.parse(body) as Record<string, unknown>;
        return new Response('', { status: 201 });
      }) as typeof fetch;

      try {
        await logSecurityEvent({
          eventType: 'security.test.event',
          path: '/api/test',
          metadata: {
            action: 'test',
            correlation_id: 'req-123',
          },
        });
      } finally {
        globalThis.fetch = originalFetch;
      }

      assert.notEqual(capturedBody, null);
      const persistedBody = capturedBody as unknown as Record<string, unknown>;
      const metadata = (persistedBody.metadata ?? {}) as Record<string, unknown>;
      assert.equal(metadata.correlation_id, 'req-123');

      const integrity = (metadata._audit ?? {}) as Record<string, unknown>;
      assert.equal(integrity.schema, 'soc2.v1');
      assert.equal(integrity.correlation_id, 'req-123');
      assert.equal(integrity.hash_algorithm, 'hmac-sha256');
      assert.equal(integrity.key_id, 'test-key-v1');
      assert.equal(typeof integrity.hash, 'string');
      assert.equal((integrity.hash as string).length > 20, true);
    },
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { assertServerEgressAllowed } from '@/lib/security/egress-policy';

type EnvSnapshot = {
  NODE_ENV?: string;
  SERVER_EGRESS_ENFORCE?: string;
  SERVER_EGRESS_ALLOWLIST?: string;
};

function withEnv(overrides: Partial<EnvSnapshot>, run: () => void) {
  const snapshot: EnvSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    SERVER_EGRESS_ENFORCE: process.env.SERVER_EGRESS_ENFORCE,
    SERVER_EGRESS_ALLOWLIST: process.env.SERVER_EGRESS_ALLOWLIST,
  };

  Object.assign(process.env, overrides);
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

test('egress policy blocks private IP destinations in production', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      SERVER_EGRESS_ENFORCE: 'true',
      SERVER_EGRESS_ALLOWLIST: '127.0.0.1',
    },
    () => {
      assert.throws(
        () => assertServerEgressAllowed('https://127.0.0.1/admin', { dependency: 'test.private' }),
        /private or blocked host/i,
      );
    },
  );
});

test('egress policy blocks China-hosted endpoints regardless of allowlist', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      SERVER_EGRESS_ENFORCE: 'true',
      SERVER_EGRESS_ALLOWLIST: '*.cn',
    },
    () => {
      assert.throws(
        () => assertServerEgressAllowed('https://api.vendor.cn/v1', { dependency: 'test.china' }),
        /violates no-China policy/i,
      );
    },
  );
});

test('egress policy enforces explicit allowlist in production', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      SERVER_EGRESS_ENFORCE: 'true',
      SERVER_EGRESS_ALLOWLIST: 'api.example.com',
    },
    () => {
      assert.throws(
        () => assertServerEgressAllowed('https://not-allowed.example.org', { dependency: 'test.allowlist' }),
        /not present in SERVER_EGRESS_ALLOWLIST/i,
      );
    },
  );
});

test('egress policy allows localhost in non-production for developer workflows', () => {
  withEnv(
    {
      NODE_ENV: 'development',
      SERVER_EGRESS_ENFORCE: 'false',
      SERVER_EGRESS_ALLOWLIST: '',
    },
    () => {
      assert.doesNotThrow(() => {
        assertServerEgressAllowed('http://localhost:3000/health', { dependency: 'test.localhost' });
      });
    },
  );
});

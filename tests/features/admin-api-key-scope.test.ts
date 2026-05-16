import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAdminApiKeyScope } from '@/app/api/admin/_api-key';

type EnvSnapshot = {
  ADMIN_API_KEY?: string;
  ADMIN_API_KEY_SCOPES?: string;
  ADMIN_API_KEY_ENFORCE?: string;
  ADMIN_API_KEY_NEXT?: string;
  ADMIN_API_KEY_NEXT_SCOPES?: string;
  ADMIN_API_KEYS_JSON?: string;
};

function withEnv(overrides: Partial<EnvSnapshot>, run: () => void) {
  const snapshot: EnvSnapshot = {
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
    ADMIN_API_KEY_SCOPES: process.env.ADMIN_API_KEY_SCOPES,
    ADMIN_API_KEY_ENFORCE: process.env.ADMIN_API_KEY_ENFORCE,
    ADMIN_API_KEY_NEXT: process.env.ADMIN_API_KEY_NEXT,
    ADMIN_API_KEY_NEXT_SCOPES: process.env.ADMIN_API_KEY_NEXT_SCOPES,
    ADMIN_API_KEYS_JSON: process.env.ADMIN_API_KEYS_JSON,
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

function buildRequest(apiKey?: string): Request {
  const headers = new Headers();
  if (apiKey) {
    headers.set('x-admin-api-key', apiKey);
  }
  return new Request('https://example.com/api/admin/test', { headers });
}

test('admin API key check allows missing key when enforcement is disabled', () => {
  withEnv(
    {
      ADMIN_API_KEY_ENFORCE: 'false',
      ADMIN_API_KEY: '',
      ADMIN_API_KEY_SCOPES: '',
      ADMIN_API_KEYS_JSON: '',
    },
    () => {
      const result = evaluateAdminApiKeyScope(buildRequest(), 'admin.controllers');
      assert.equal(result.granted, true);
      assert.equal(result.reason, 'not_provided');
    },
  );
});

test('admin API key check requires key when enforcement is enabled', () => {
  withEnv(
    {
      ADMIN_API_KEY_ENFORCE: 'true',
      ADMIN_API_KEY: 'super-secret-primary-key',
      ADMIN_API_KEY_SCOPES: 'admin.controllers',
      ADMIN_API_KEYS_JSON: '',
    },
    () => {
      const result = evaluateAdminApiKeyScope(buildRequest(), 'admin.controllers');
      assert.equal(result.granted, false);
      assert.equal(result.reason, 'enforced_missing');
    },
  );
});

test('admin API key check validates scope including wildcard prefixes', () => {
  withEnv(
    {
      ADMIN_API_KEY_ENFORCE: 'true',
      ADMIN_API_KEY: 'scoped-admin-key',
      ADMIN_API_KEY_SCOPES: 'admin.api-monitoring.*,admin.controllers',
      ADMIN_API_KEYS_JSON: '',
    },
    () => {
      const allowed = evaluateAdminApiKeyScope(
        buildRequest('scoped-admin-key'),
        'admin.api-monitoring.deliveries',
      );
      assert.equal(allowed.granted, true);
      assert.equal(allowed.reason, 'valid');

      const denied = evaluateAdminApiKeyScope(
        buildRequest('scoped-admin-key'),
        'admin.order-incidents',
      );
      assert.equal(denied.granted, false);
      assert.equal(denied.reason, 'insufficient_scope');
    },
  );
});

test('admin API key check rejects invalid provided keys', () => {
  withEnv(
    {
      ADMIN_API_KEY_ENFORCE: 'false',
      ADMIN_API_KEY: 'known-good-key',
      ADMIN_API_KEY_SCOPES: 'admin.*',
      ADMIN_API_KEYS_JSON: '',
    },
    () => {
      const result = evaluateAdminApiKeyScope(buildRequest('wrong-key'), 'admin.controllers');
      assert.equal(result.granted, false);
      assert.equal(result.reason, 'invalid_key');
    },
  );
});

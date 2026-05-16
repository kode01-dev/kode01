import assert from 'node:assert/strict';
import test from 'node:test';
import { getTrustedSubdomainOrigins } from '@/lib/routing/subdomains';

function withEnv(
  updates: Record<string, string | undefined>,
  callback: () => void,
): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('getTrustedSubdomainOrigins includes canonical kode01 origins', () => {
  const origins = getTrustedSubdomainOrigins('admin.kode01.com', 'https://admin.kode01.com');

  assert.equal(origins.includes('https://kode01.com'), true);
  assert.equal(origins.includes('https://dashboard.kode01.com'), true);
  assert.equal(origins.includes('https://admin.kode01.com'), true);
});

test('getTrustedSubdomainOrigins preserves local dev ports for sibling subdomains', () => {
  const origins = getTrustedSubdomainOrigins(
    'admin.localtest.me',
    'http://admin.localtest.me:3000',
  );

  assert.equal(origins.includes('http://localtest.me:3000'), true);
  assert.equal(origins.includes('http://dashboard.localtest.me:3000'), true);
  assert.equal(origins.includes('http://admin.localtest.me:3000'), true);
});

test('getTrustedSubdomainOrigins includes configured hosts and app base url', () => {
  withEnv(
    {
      DASHBOARD_HOSTS: 'dashboard.acme.com',
      ADMIN_DASHBOARD_HOSTS: 'admin.acme.com',
      APP_BASE_URL: 'https://app.acme.com',
    },
    () => {
      const origins = getTrustedSubdomainOrigins('app.acme.com', 'https://app.acme.com');
      assert.equal(origins.includes('https://dashboard.acme.com'), true);
      assert.equal(origins.includes('https://admin.acme.com'), true);
      assert.equal(origins.includes('https://app.acme.com'), true);
    },
  );
});

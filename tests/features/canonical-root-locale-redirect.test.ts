import assert from 'node:assert/strict';
import test from 'node:test';
import { getCanonicalRootLocaleRedirectUrl } from '@/lib/routing/canonical-root-locale-redirect';

function getRedirectUrl(input: {
  host: string;
  method?: string;
  pathname?: string;
  url?: string;
}): string | null {
  const redirectUrl = getCanonicalRootLocaleRedirectUrl({
    host: input.host,
    method: input.method ?? 'GET',
    pathname: input.pathname ?? '/',
    url: input.url ?? `https://${input.host}${input.pathname ?? '/'}`,
  });

  return redirectUrl?.toString() ?? null;
}

test('canonical apex root redirects permanently to default locale target', () => {
  assert.equal(getRedirectUrl({ host: 'kode01.com' }), 'https://kode01.com/en');
});

test('canonical www root redirects directly to apex default locale target', () => {
  assert.equal(
    getRedirectUrl({ host: 'www.kode01.com', url: 'https://www.kode01.com/' }),
    'https://kode01.com/en',
  );
});

test('canonical root locale redirect preserves query strings', () => {
  assert.equal(
    getRedirectUrl({ host: 'kode01.com', url: 'https://kode01.com/?utm=seo' }),
    'https://kode01.com/en?utm=seo',
  );
});

test('canonical root locale redirect supports HEAD requests', () => {
  assert.equal(
    getRedirectUrl({ host: 'kode01.com', method: 'HEAD' }),
    'https://kode01.com/en',
  );
});

test('canonical root locale redirect does not affect localized, api, or subdomain routes', () => {
  assert.equal(getRedirectUrl({ host: 'kode01.com', pathname: '/en' }), null);
  assert.equal(getRedirectUrl({ host: 'kode01.com', pathname: '/fr' }), null);
  assert.equal(getRedirectUrl({ host: 'kode01.com', pathname: '/api/news/list' }), null);
  assert.equal(getRedirectUrl({ host: 'dashboard.kode01.com' }), null);
  assert.equal(getRedirectUrl({ host: 'admin.kode01.com' }), null);
});

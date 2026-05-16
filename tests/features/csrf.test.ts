import assert from 'node:assert/strict';
import test from 'node:test';
import { hasTrustedCsrfSource, isMutatingHttpMethod } from '@/lib/security/csrf';

const ORIGIN = 'https://kode01.example';

function makeHeaders(init: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(init)) {
    headers.set(key, value);
  }
  return headers;
}

test('isMutatingHttpMethod identifies mutating methods', () => {
  assert.equal(isMutatingHttpMethod('POST'), true);
  assert.equal(isMutatingHttpMethod('patch'), true);
  assert.equal(isMutatingHttpMethod('GET'), false);
  assert.equal(isMutatingHttpMethod('OPTIONS'), false);
});

test('hasTrustedCsrfSource accepts same-origin origin and referer', () => {
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ origin: 'https://kode01.example' }), ORIGIN),
    true,
  );
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ referer: 'https://kode01.example/admin' }), ORIGIN),
    true,
  );
});

test('hasTrustedCsrfSource rejects cross-origin origin and referer', () => {
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ origin: 'https://attacker.example' }), ORIGIN),
    false,
  );
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ referer: 'https://attacker.example/form' }), ORIGIN),
    false,
  );
});

test('hasTrustedCsrfSource falls back to sec-fetch-site for clients without origin/referer', () => {
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ 'sec-fetch-site': 'same-origin' }), ORIGIN),
    true,
  );
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ 'sec-fetch-site': 'same-site' }), ORIGIN),
    true,
  );
  assert.equal(
    hasTrustedCsrfSource(makeHeaders({ 'sec-fetch-site': 'cross-site' }), ORIGIN),
    false,
  );
});

test('hasTrustedCsrfSource rejects missing csrf headers', () => {
  assert.equal(hasTrustedCsrfSource(makeHeaders({}), ORIGIN), false);
});

test('hasTrustedCsrfSource accepts explicit trusted cross-subdomain origins', () => {
  assert.equal(
    hasTrustedCsrfSource(
      makeHeaders({ origin: 'https://admin.kode01.com' }),
      ORIGIN,
      ['https://admin.kode01.com', 'https://dashboard.kode01.com'],
    ),
    true,
  );
});

test('hasTrustedCsrfSource rejects malformed origin headers', () => {
  assert.equal(
    hasTrustedCsrfSource(
      makeHeaders({
        origin: '::not-a-valid-origin::',
        referer: 'https://kode01.example/admin',
      }),
      ORIGIN,
    ),
    false,
  );
});

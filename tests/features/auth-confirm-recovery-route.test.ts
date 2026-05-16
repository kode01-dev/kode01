import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { NextRequest } from 'next/server';

let exchangeCodeError: { message: string } | null = null;
const exchangeCodeCalls: string[] = [];

mock.module('@/i18n/routing', {
  namedExports: {
    routing: {
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: {
        exchangeCodeForSession: async (code: string) => {
          exchangeCodeCalls.push(code);
          return { data: {}, error: exchangeCodeError };
        },
        verifyOtp: async () => ({ data: {}, error: null }),
      },
    }),
  },
});

async function loadConfirmRoute(scenario: string) {
  return import(`../../src/app/auth/confirm/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

function makeRequest(url: string) {
  return new NextRequest(url);
}

function getLocation(response: Response) {
  const location = response.headers.get('location');
  assert.ok(location, 'response should include a redirect location');
  return location;
}

test('GET /auth/confirm redirects recovery links to reset-password when next targets reset page', async () => {
  exchangeCodeError = null;
  exchangeCodeCalls.length = 0;
  const { GET } = await loadConfirmRoute('recovery-next-success');

  const response = await GET(makeRequest('https://kode01.test/fr/auth/confirm?code=abc&next=/fr/auth/reset-password'));

  assert.equal(exchangeCodeCalls[0], 'abc');
  assert.equal(getLocation(response), 'https://kode01.test/fr/auth/reset-password');
});

test('GET /auth/confirm redirects type=recovery links without next to reset-password', async () => {
  exchangeCodeError = null;
  exchangeCodeCalls.length = 0;
  const { GET } = await loadConfirmRoute('recovery-type-success');

  const response = await GET(makeRequest('https://kode01.test/fr/auth/confirm?code=abc&type=recovery'));

  assert.equal(exchangeCodeCalls[0], 'abc');
  assert.equal(getLocation(response), 'https://kode01.test/fr/auth/reset-password');
});

test('GET /auth/confirm redirects broken recovery links to reset-password error page', async () => {
  exchangeCodeError = { message: 'expired code' };
  exchangeCodeCalls.length = 0;
  const { GET } = await loadConfirmRoute('recovery-error');

  const response = await GET(makeRequest('https://kode01.test/fr/auth/confirm?code=abc&type=recovery'));

  assert.equal(exchangeCodeCalls[0], 'abc');
  assert.equal(
    getLocation(response),
    'https://kode01.test/fr/auth/reset-password?status=error&reason=verification_failed',
  );
});

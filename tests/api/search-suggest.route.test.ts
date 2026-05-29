import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let createPublicServerClientImpl: () => unknown = () => {
  throw new Error('createPublicServerClient mock not configured');
};

mock.module('@/lib/supabase/server-public', {
  namedExports: {
    createPublicServerClient: () => createPublicServerClientImpl(),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/search/suggest/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET as (request: Request) => Promise<Response>;
}

test('GET /api/search/suggest returns an empty cached result for missing query', async () => {
  const createClientMock = mock.fn(() => ({
    rpc: async () => ({ data: [], error: null }),
  }));
  createPublicServerClientImpl = createClientMock;

  const GET = await loadGetHandler('missing-query');
  const response = await GET(new Request('http://localhost/api/search/suggest'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { suggestions: [] });
  assert.equal(response.headers.get('cache-control'), 'public, max-age=15, s-maxage=30, stale-while-revalidate=120');
  assert.equal(createClientMock.mock.callCount(), 0);
});

test('GET /api/search/suggest returns empty suggestions while public marketplace is disabled', async () => {
  const createClientMock = mock.fn(() => ({
    rpc: async () => ({ data: [{ title: 'Alpha' }], error: null }),
  }));
  createPublicServerClientImpl = createClientMock;

  const GET = await loadGetHandler('marketplace-disabled');
  const response = await GET(
    new Request('http://localhost/api/search/suggest?q=%20alpha,%25%20%20beta%20'),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { suggestions: [] });
  assert.equal(response.headers.get('cache-control'), 'public, max-age=15, s-maxage=30, stale-while-revalidate=120');
  assert.equal(createClientMock.mock.callCount(), 0);
});

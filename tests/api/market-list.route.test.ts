import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getMarketListDataCachedImpl: (query: unknown) => Promise<unknown> = async () => {
  throw new Error('getMarketListDataCached mock not configured');
};

mock.module('@/features/market/server/list-repository', {
  namedExports: {
    getMarketListDataCached: (query: unknown) => getMarketListDataCachedImpl(query),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/market/list/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET ?? routeModule.default?.GET;
}

test('returns 503 with DB_UNAVAILABLE contract when market DB is unreachable', async () => {
  const dbError = Object.assign(new Error('fetch failed: connection reset'), { code: '08006' });
  getMarketListDataCachedImpl = async () => {
    throw dbError;
  };

  const GET = await loadGetHandler('db-unavailable');
  const response = await GET(new Request('http://localhost/api/market/list?locale=en'));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '10');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const body = await response.json();
  assert.equal(body.code, 'DB_UNAVAILABLE');
  assert.equal(body.incidentActive, true);
  assert.equal(body.suggestedAction, 'refresh');
});

test('keeps non-db market failures as internal server error', async () => {
  getMarketListDataCachedImpl = async () => {
    throw new Error('Unexpected serialization failure');
  };

  const GET = await loadGetHandler('non-db-error');
  const response = await GET(new Request('http://localhost/api/market/list?locale=en'));

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, 'Internal Server Error');
});

test('forwards `type` filter to market repository', async () => {
  let capturedQuery: Record<string, unknown> | null = null;
  getMarketListDataCachedImpl = async (query: unknown) => {
    capturedQuery = query as Record<string, unknown>;
    return {
      items: [],
      categories: [],
      subcategories: [],
      availableTags: [],
      total: 0,
      hasMore: false,
      nextOffset: null,
    };
  };

  const GET = await loadGetHandler('type-filter');
  const response = await GET(new Request('http://localhost/api/market/list?locale=en&type=bundle'));

  assert.equal(response.status, 200);
  assert.equal((capturedQuery as { type?: string } | null)?.type, 'bundle');
  const body = await response.json();
  assert.equal(Array.isArray(body.items), true);
  assert.equal(body.total, 0);
});

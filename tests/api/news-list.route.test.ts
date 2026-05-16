import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getPublishedRecapPostsPageImpl: (args: unknown) => Promise<{ data: unknown[]; total: number }> = async () => {
  throw new Error('getPublishedRecapPostsPage mock not configured');
};

mock.module('@/features/ai-recap/server/repository', {
  namedExports: {
    getPublishedRecapPostsPage: (args: unknown) => getPublishedRecapPostsPageImpl(args),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/news/list/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET ?? routeModule.default?.GET;
}

test('returns paginated news list payload with hasMore/nextOffset', async () => {
  getPublishedRecapPostsPageImpl = async () => ({
    data: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
    total: 3,
  });

  const GET = await loadGetHandler('list');
  const response = await GET(new Request('http://localhost/api/news/list?locale=en&limit=3&offset=0&sort=newest'));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.items.length, 3);
  assert.equal(body.total, 3);
  assert.equal(body.hasMore, false);
  assert.equal(body.nextOffset, null);
});

test('validates query params', async () => {
  const GET = await loadGetHandler('validation');
  const response = await GET(new Request('http://localhost/api/news/list?limit=0'));
  assert.equal(response.status, 400);
});

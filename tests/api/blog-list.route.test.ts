import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getPublishedEditorialPostsImpl: (args: unknown) => Promise<{ data: unknown[]; total: number }> = async () => {
  throw new Error('getPublishedEditorialPosts mock not configured');
};

mock.module('@/features/editorial/server/repository', {
  namedExports: {
    getPublishedEditorialPosts: (args: unknown) => getPublishedEditorialPostsImpl(args),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/blog/list/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET ?? routeModule.default?.GET;
}

test('returns paginated blog list payload with hasMore/nextOffset', async () => {
  getPublishedEditorialPostsImpl = async () => ({
    data: [{ id: 'a' }, { id: 'b' }],
    total: 10,
  });

  const GET = await loadGetHandler('list');
  const response = await GET(new Request('http://localhost/api/blog/list?locale=en&limit=2&offset=0&sort=newest'));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.items.length, 2);
  assert.equal(body.total, 10);
  assert.equal(body.hasMore, true);
  assert.equal(body.nextOffset, 2);
});

test('validates query params', async () => {
  const GET = await loadGetHandler('validation');
  const response = await GET(new Request('http://localhost/api/blog/list?limit=0'));
  assert.equal(response.status, 400);
});

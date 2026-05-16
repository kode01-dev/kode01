import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const getServerEnvImpl = () => ({
  NODE_ENV: 'test',
  CRON_SECRET: 'cron-secret',
  EDGE_INTERNAL_AUTH_TOKEN: 'edge-secret',
});

const revalidateCalls: string[][] = [];

mock.module('@/lib/env/server', {
  namedExports: {
    getServerEnv: () => getServerEnvImpl(),
  },
});

mock.module('@/lib/cache/revalidate', {
  namedExports: {
    isPublicCacheTag: (value: string) => ['editorial', 'news', 'market'].includes(value),
    revalidatePublicCacheTags: (tags: string[]) => {
      revalidateCalls.push([...tags]);
    },
  },
});

async function loadPostHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/internal/cache/revalidate/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.POST ?? routeModule.default?.POST;
}

test('returns 401 without valid internal credentials', async () => {
  revalidateCalls.length = 0;
  const POST = await loadPostHandler('unauthorized');
  const response = await POST(
    new Request('http://localhost/api/internal/cache/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['news'] }),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(revalidateCalls.length, 0);
});

test('returns 400 when unsupported tags are provided', async () => {
  revalidateCalls.length = 0;
  const POST = await loadPostHandler('invalid-tags');
  const response = await POST(
    new Request('http://localhost/api/internal/cache/revalidate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer cron-secret',
      },
      body: JSON.stringify({ tags: ['news', 'invalid_tag'] }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(revalidateCalls.length, 0);
});

test('revalidates allowed tags with bearer authorization', async () => {
  revalidateCalls.length = 0;
  const POST = await loadPostHandler('bearer-authorized');
  const response = await POST(
    new Request('http://localhost/api/internal/cache/revalidate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer cron-secret',
      },
      body: JSON.stringify({ tags: ['news', 'market'] }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(revalidateCalls.length, 1);
  assert.deepEqual(revalidateCalls[0], ['news', 'market']);
  const body = await response.json();
  assert.deepEqual(body.revalidated, ['news', 'market']);
});

test('accepts x-internal-auth credential', async () => {
  revalidateCalls.length = 0;
  const POST = await loadPostHandler('internal-header');
  const response = await POST(
    new Request('http://localhost/api/internal/cache/revalidate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-auth': 'edge-secret',
      },
      body: JSON.stringify({ tags: ['editorial'] }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(revalidateCalls.length, 1);
  assert.deepEqual(revalidateCalls[0], ['editorial']);
});

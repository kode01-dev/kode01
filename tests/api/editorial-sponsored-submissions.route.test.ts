import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let createClientImpl: () => Promise<unknown> = async () => ({
  auth: { getUser: async () => ({ data: { user: null } }) },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => ({
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  },
});

mock.module('@/lib/stripe/server', {
  namedExports: {
    stripe: {
      checkout: {
        sessions: {
          create: async () => ({ id: 'cs_test', url: 'https://example.com/checkout' }),
        },
      },
    },
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => 'http://localhost:3000',
  },
});

mock.module('@/lib/images/server/core-image-pipeline', {
  namedExports: {
    ensureOptimizedStorageImageUrl: async ({ sourceUrl }: { sourceUrl: string }) => sourceUrl,
  },
});

async function loadRoute(scenario: string) {
  return import(`../../src/app/api/editorial/sponsored/submissions/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('GET /api/editorial/sponsored/submissions returns 401 when unauthenticated', async () => {
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  });

  const routeModule = await loadRoute('get-unauthorized');
  const response = await routeModule.GET();
  assert.equal(response.status, 401);
});

test('GET /api/editorial/sponsored/submissions returns 403 for unsupported role', async () => {
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'admin' } }),
        }),
      }),
    }),
  });

  const routeModule = await loadRoute('get-forbidden-role');
  const response = await routeModule.GET();
  assert.equal(response.status, 403);
});

test('POST /api/editorial/sponsored/submissions returns 401 when unauthenticated', async () => {
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
  });

  const routeModule = await loadRoute('post-unauthorized');
  const response = await routeModule.POST(
    new Request('http://localhost/api/editorial/sponsored/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: [] }),
    }),
  );

  assert.equal(response.status, 401);
});

test('POST /api/editorial/sponsored/submissions returns 403 for unsupported role', async () => {
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'admin' } }),
        }),
      }),
    }),
  });

  const routeModule = await loadRoute('post-forbidden-role');
  const response = await routeModule.POST(
    new Request('http://localhost/api/editorial/sponsored/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: [] }),
    }),
  );

  assert.equal(response.status, 403);
});

test('POST /api/editorial/sponsored/submissions validates payload', async () => {
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'buyer' } }),
        }),
      }),
    }),
  });

  const routeModule = await loadRoute('post-invalid-payload');
  const response = await routeModule.POST(
    new Request('http://localhost/api/editorial/sponsored/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: [] }),
    }),
  );

  assert.equal(response.status, 400);
});

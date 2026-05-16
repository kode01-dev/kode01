import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type AdminClient = {
  from: (table: string) => unknown;
};

let getAdminSessionOrNullImpl: () => Promise<{ userId: string } | null> = async () => null;
let createAdminClientImpl: () => AdminClient = () => ({ from: () => ({}) });
const revalidateMarketContentMock = mock.fn(() => undefined);

mock.module('@/app/api/admin/controllers/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionOrNullImpl(),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

mock.module('@/lib/cache/revalidate', {
  namedExports: {
    revalidateMarketContent: () => revalidateMarketContentMock(),
  },
});

async function loadHandlers(scenario: string) {
  const routeModule = await import(`../../src/app/api/admin/market-categories/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return {
    GET: routeModule.GET as () => Promise<Response>,
    POST: routeModule.POST as (request: Request) => Promise<Response>,
    PATCH: routeModule.PATCH as (request: Request) => Promise<Response>,
  };
}

test('GET /api/admin/market-categories returns 403 when not admin', async () => {
  getAdminSessionOrNullImpl = async () => null;
  createAdminClientImpl = () => {
    throw new Error('createAdminClient should not be called');
  };

  const { GET } = await loadHandlers('get-forbidden');
  const response = await GET();

  assert.equal(response.status, 403);
});

test('POST /api/admin/market-categories validates payload and returns 400', async () => {
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  createAdminClientImpl = () => {
    throw new Error('createAdminClient should not be called');
  };

  const { POST } = await loadHandlers('post-invalid');
  const response = await POST(
    new Request('http://localhost/api/admin/market-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: '',
        name_en: '',
        name_fr: '',
      }),
    }),
  );

  assert.equal(response.status, 400);
});

test('POST /api/admin/market-categories creates a category and revalidates market cache', async () => {
  revalidateMarketContentMock.mock.resetCalls();
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  createAdminClientImpl = () => ({
    from: (table: string) => {
      assert.equal(table, 'product_categories');
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => ({
              data: {
                id: '11111111-1111-4111-8111-111111111111',
                slug: payload.slug,
                name_en: payload.name_en,
                name_fr: payload.name_fr,
                description_en: payload.description_en ?? null,
                description_fr: payload.description_fr ?? null,
                display_order: payload.display_order ?? 0,
                is_active: payload.is_active ?? true,
                created_at: '2026-03-17T00:00:00.000Z',
                updated_at: '2026-03-17T00:00:00.000Z',
              },
              error: null,
            }),
          }),
        }),
      };
    },
  });

  const { POST } = await loadHandlers('post-success');
  const response = await POST(
    new Request('http://localhost/api/admin/market-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'automation-tools',
        name_en: 'Automation tools',
        name_fr: 'Outils automatisation',
        display_order: 10,
        is_active: true,
      }),
    }),
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.slug, 'automation-tools');
  assert.equal(revalidateMarketContentMock.mock.callCount(), 1);
});

test('PATCH /api/admin/market-categories rejects slug mutation with 400', async () => {
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  createAdminClientImpl = () => {
    throw new Error('createAdminClient should not be called');
  };

  const { PATCH } = await loadHandlers('patch-slug-immutable');
  const response = await PATCH(
    new Request('http://localhost/api/admin/market-categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'new-slug',
      }),
    }),
  );

  assert.equal(response.status, 400);
});

test('PATCH /api/admin/market-categories returns 409 on unique conflict', async () => {
  getAdminSessionOrNullImpl = async () => ({ userId: 'admin-user' });
  createAdminClientImpl = () => ({
    from: (table: string) => {
      assert.equal(table, 'product_categories');
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              }),
            }),
          }),
        }),
      };
    },
  });

  const { PATCH } = await loadHandlers('patch-conflict');
  const response = await PATCH(
    new Request('http://localhost/api/admin/market-categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        name_en: 'Updated',
      }),
    }),
  );

  assert.equal(response.status, 409);
});

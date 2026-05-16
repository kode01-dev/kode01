import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getSellerSessionOrErrorImpl: () => Promise<unknown> = async () => {
  throw new Error('getSellerSessionOrError mock not configured');
};
const revalidateMarketContentMock = mock.fn(() => undefined);

mock.module('@/app/api/vendor/bundles/_lib', {
  namedExports: {
    getSellerSessionOrError: async () => getSellerSessionOrErrorImpl(),
  },
});

mock.module('@/lib/cache/revalidate', {
  namedExports: {
    revalidateMarketContent: () => revalidateMarketContentMock(),
  },
});

async function loadHandlers(scenario: string) {
  const routeModule = await import(`../../src/app/api/vendor/bundles/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return {
    GET: routeModule.GET as () => Promise<Response>,
    POST: routeModule.POST as (request: Request) => Promise<Response>,
  };
}

test('POST /api/vendor/bundles creates a draft bundle for seller sessions', async () => {
  revalidateMarketContentMock.mock.resetCalls();

  const sellerId = '11111111-1111-4111-8111-111111111111';
  const createdAt = '2026-03-18T00:00:00.000Z';
  let insertedPayload: Record<string, unknown> | null = null;

  const supabase = {
    from: (table: string) => {
      assert.equal(table, 'products');
      return {
        insert: (payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: '22222222-2222-4222-8222-222222222222',
                  title: payload.title,
                  slug: payload.slug,
                  description: payload.description ?? null,
                  price: payload.price,
                  status: payload.status,
                  cover_image_url: payload.cover_image_url ?? null,
                  created_at: createdAt,
                  updated_at: createdAt,
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };

  getSellerSessionOrErrorImpl = async () => ({
    supabase,
    userId: sellerId,
  });

  const { POST } = await loadHandlers('post-success');
  const response = await POST(
    new Request('http://localhost/api/vendor/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Creator Growth Pack',
        slug: 'creator-growth-pack',
        description: 'Bundle for growth',
        price: 89,
      }),
    }),
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.slug, 'creator-growth-pack');
  assert.equal(body.data.status, 'draft');
  assert.equal(revalidateMarketContentMock.mock.callCount(), 1);
  assert.equal(insertedPayload?.['seller_id'], sellerId);
  assert.equal(insertedPayload?.['is_bundle'], true);
});

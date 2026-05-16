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
  const routeModule = await import(`../../src/app/api/vendor/bundles/[bundleId]/items/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return {
    PUT: routeModule.PUT as (request: Request, context: { params: Promise<{ bundleId: string }> }) => Promise<Response>,
  };
}

test('PUT /api/vendor/bundles/[bundleId]/items rejects non-owned products', async () => {
  revalidateMarketContentMock.mock.resetCalls();

  const bundleId = '33333333-3333-4333-8333-333333333333';
  const sellerId = '44444444-4444-4444-8444-444444444444';
  const ownedProductId = '55555555-5555-4555-8555-555555555555';
  const foreignProductId = '66666666-6666-4666-8666-666666666666';
  let productsQueryCalls = 0;

  const bundleQuery = {
    select: () => bundleQuery,
    eq: () => bundleQuery,
    maybeSingle: async () => ({
      data: { id: bundleId, status: 'draft' },
      error: null,
    }),
  };

  const ownedProductsQuery = {
    select: () => ownedProductsQuery,
    eq: () => ownedProductsQuery,
    in: async () => ({
      data: [{ id: ownedProductId }],
      error: null,
    }),
  };

  const supabase = {
    from: (table: string) => {
      if (table === 'products') {
        productsQueryCalls += 1;
        return productsQueryCalls === 1 ? bundleQuery : ownedProductsQuery;
      }
      if (table === 'product_bundle_items') {
        throw new Error('product_bundle_items should not be touched when ownership validation fails');
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  getSellerSessionOrErrorImpl = async () => ({
    supabase,
    userId: sellerId,
  });

  const { PUT } = await loadHandlers('reject-foreign-product');
  const response = await PUT(
    new Request(`http://localhost/api/vendor/bundles/${bundleId}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productIds: [ownedProductId, foreignProductId],
      }),
    }),
    {
      params: Promise.resolve({ bundleId }),
    },
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, 'All included items must be non-bundle products owned by the same seller');
  assert.equal(revalidateMarketContentMock.mock.callCount(), 0);
});

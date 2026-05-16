import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type ProfileRow = {
  id: string;
  display_name: string | null;
  shop_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  slug: string | null;
};

type ProductRow = {
  seller_id: string;
};

let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

let createPublicServerClientImpl: () => unknown = () => {
  throw new Error('createPublicServerClient mock not configured');
};

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

mock.module('@/lib/supabase/server-public', {
  namedExports: {
    createPublicServerClient: () => createPublicServerClientImpl(),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/creators/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET as () => Promise<Response>;
}

function createSupabaseMock({
  profiles,
  publishedProducts,
  profileError = null,
  productsError = null,
}: {
  profiles: ProfileRow[];
  publishedProducts: ProductRow[];
  profileError?: { message: string } | null;
  productsError?: { message: string } | null;
}) {
  let productsQueryCount = 0;

  const supabase = {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: profileError ? null : profiles,
                error: profileError,
              }),
            }),
          }),
        };
      }

      if (table === 'products') {
        return {
          select: () => {
            const state: { status: string | null; sellerIds: string[] } = {
              status: null,
              sellerIds: [],
            };

            return {
              eq: (column: string, value: string) => {
                if (column === 'status') {
                  state.status = value;
                }
                return {
                  in: (_inColumn: string, sellerIds: string[]) => {
                    state.sellerIds = sellerIds;
                    return {
                      order: () => ({
                        range: async (from: number, to: number) => {
                          productsQueryCount += 1;
                          if (productsError) {
                            return { data: null, error: productsError };
                          }

                          assert.equal(state.status, 'published');
                          const sellerIdSet = new Set(state.sellerIds);
                          const filtered = publishedProducts.filter((row) => sellerIdSet.has(row.seller_id));
                          return { data: filtered.slice(from, to + 1), error: null };
                        },
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    supabase,
    getProductsQueryCount: () => productsQueryCount,
  };
}

test('GET /api/creators batches product counting and returns only active creators', async () => {
  const mockData = createSupabaseMock({
    profiles: [
      { id: 'seller-1', display_name: 'A', shop_name: 'Shop A', avatar_url: null, is_verified: true, slug: 'a' },
      { id: 'seller-2', display_name: 'B', shop_name: 'Shop B', avatar_url: null, is_verified: false, slug: 'b' },
      { id: 'seller-3', display_name: 'C', shop_name: 'Shop C', avatar_url: null, is_verified: true, slug: 'c' },
    ],
    publishedProducts: [
      { seller_id: 'seller-1' },
      { seller_id: 'seller-1' },
      { seller_id: 'seller-3' },
    ],
  });

  createAdminClientImpl = () => mockData.supabase;
  createPublicServerClientImpl = () => {
    throw new Error('fallback should not be used');
  };

  const GET = await loadGetHandler('batched-count');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.deepEqual(body.items, [
    {
      id: 'seller-1',
      display_name: 'A',
      shop_name: 'Shop A',
      avatar_url: null,
      is_verified: true,
      slug: 'a',
      productsCount: 2,
    },
    {
      id: 'seller-3',
      display_name: 'C',
      shop_name: 'Shop C',
      avatar_url: null,
      is_verified: true,
      slug: 'c',
      productsCount: 1,
    },
  ]);

  assert.equal(mockData.getProductsQueryCount(), 1);
});

test('GET /api/creators paginates batched product query to avoid truncating counts', async () => {
  const publishedProducts: ProductRow[] = Array.from({ length: 1001 }, () => ({ seller_id: 'seller-1' }));
  const mockData = createSupabaseMock({
    profiles: [{ id: 'seller-1', display_name: 'A', shop_name: 'Shop A', avatar_url: null, is_verified: true, slug: 'a' }],
    publishedProducts,
  });

  createAdminClientImpl = () => mockData.supabase;
  createPublicServerClientImpl = () => {
    throw new Error('fallback should not be used');
  };

  const GET = await loadGetHandler('pagination');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.items[0]?.productsCount, 1001);
  assert.equal(mockData.getProductsQueryCount(), 2);
});

test('GET /api/creators falls back to public client when admin client creation throws', async () => {
  const mockData = createSupabaseMock({
    profiles: [{ id: 'seller-1', display_name: 'A', shop_name: 'Shop A', avatar_url: null, is_verified: true, slug: 'a' }],
    publishedProducts: [{ seller_id: 'seller-1' }],
  });

  createAdminClientImpl = () => {
    throw new Error('admin unavailable');
  };
  createPublicServerClientImpl = () => mockData.supabase;

  const GET = await loadGetHandler('public-fallback');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0]?.id, 'seller-1');
});

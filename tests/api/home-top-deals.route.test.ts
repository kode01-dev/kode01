import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type RpcError = { code?: string; message: string } | null;

type RpcRow = {
  product_id: string;
  sales_count: number;
};

type ProductRow = {
  id: string;
  slug: string | null;
  title: string | null;
  price: number;
  is_pwyw: boolean;
  min_price: number;
  cover_image_url: string | null;
  tags: unknown;
  created_at: string | null;
  is_bundle: boolean;
  content_locales: string[] | null;
  content_source_locale: string | null;
  profiles: { display_name: string | null; shop_name: string | null } | null;
};

let createPublicServerClientImpl: () => unknown = () => {
  throw new Error('createPublicServerClient mock not configured');
};

let createAdminClientCalls = 0;

mock.module('@/lib/supabase/server-public', {
  namedExports: {
    createPublicServerClient: () => createPublicServerClientImpl(),
  },
});

mock.module('@/lib/supabase/env', {
  namedExports: {
    isSupabasePublicEnvConfigured: () => true,
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => {
      createAdminClientCalls += 1;
      throw new Error('Public top-deals route must not use createAdminClient');
    },
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/home/top-deals/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET as (request: Request) => Promise<Response>;
}

function createProductRow(id: string, title: string, createdAt: string): ProductRow {
  return {
    id,
    slug: `${id}-slug`,
    title,
    price: 10,
    is_pwyw: false,
    min_price: 10,
    cover_image_url: null,
    tags: ['ai'],
    created_at: createdAt,
    is_bundle: false,
    content_locales: ['en'],
    content_source_locale: 'en',
    profiles: {
      display_name: `Seller ${id}`,
      shop_name: `Shop ${id}`,
    },
  };
}

function createSupabaseMock({
  rpcRows,
  rpcError = null,
  candidateProducts = [],
  fallbackProducts = [],
}: {
  rpcRows: RpcRow[] | null;
  rpcError?: RpcError;
  candidateProducts?: ProductRow[];
  fallbackProducts?: ProductRow[];
}) {
  const calls = {
    rpc: 0,
    productsIn: 0,
    productsFallback: 0,
    purchases: 0,
  };

  const supabase = {
    rpc: async (fn: string, params: { p_since: string; p_limit: number }) => {
      calls.rpc += 1;
      assert.equal(fn, 'list_top_deals');
      assert.equal(typeof params.p_since, 'string');
      assert.equal(params.p_limit >= 64, true);
      return { data: rpcRows, error: rpcError };
    },
    from: (table: string) => {
      if (table === 'purchases') {
        calls.purchases += 1;
        throw new Error('Route fallback must never query purchases with elevated privileges');
      }

      assert.equal(table, 'products');

      return {
        select: () => ({
          eq: (column: string, value: string) => {
            assert.equal(column, 'status');
            assert.equal(value, 'published');

            return {
              in: async (_inColumn: string, ids: string[]) => {
                calls.productsIn += 1;
                const idSet = new Set(ids);
                return {
                  data: candidateProducts.filter((row) => idSet.has(row.id)),
                  error: null,
                };
              },
              order: () => ({
                limit: async (limit: number) => {
                  calls.productsFallback += 1;
                  return {
                    data: fallbackProducts.slice(0, limit),
                    error: null,
                  };
                },
              }),
            };
          },
        }),
      };
    },
  };

  return { supabase, calls };
}

test('GET /api/home/top-deals uses public client and ranks by RPC sales count', async () => {
  createAdminClientCalls = 0;

  const { supabase, calls } = createSupabaseMock({
    rpcRows: [
      { product_id: 'p2', sales_count: 11 },
      { product_id: 'p1', sales_count: 4 },
    ],
    candidateProducts: [
      createProductRow('p1', 'Product One', '2026-01-02T00:00:00.000Z'),
      createProductRow('p2', 'Product Two', '2026-01-03T00:00:00.000Z'),
    ],
  });

  createPublicServerClientImpl = () => supabase;

  const GET = await loadGetHandler('rpc-ranking');
  const response = await GET(new Request('http://localhost/api/home/top-deals?limit=2&days=7'));
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.items.length, 2);
  assert.deepEqual(
    body.items.map((item: { id: string }) => item.id),
    ['p2', 'p1'],
  );
  assert.equal(calls.rpc, 1);
  assert.equal(calls.productsIn, 1);
  assert.equal(calls.purchases, 0);
  assert.equal(createAdminClientCalls, 0);
});

test('GET /api/home/top-deals falls back to published products when top-deals RPC is missing', async () => {
  createAdminClientCalls = 0;

  const { supabase, calls } = createSupabaseMock({
    rpcRows: null,
    rpcError: { code: 'PGRST202', message: 'function public.list_top_deals not found' },
    fallbackProducts: [createProductRow('fresh-1', 'Fresh Product', '2026-01-05T00:00:00.000Z')],
  });

  createPublicServerClientImpl = () => supabase;

  const GET = await loadGetHandler('missing-rpc-fallback');
  const response = await GET(new Request('http://localhost/api/home/top-deals?limit=1&days=7'));
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0]?.id, 'fresh-1');
  assert.equal(body.items[0]?.sales_count, 0);
  assert.equal(calls.rpc, 1);
  assert.equal(calls.productsIn, 0);
  assert.equal(calls.productsFallback, 1);
  assert.equal(calls.purchases, 0);
  assert.equal(createAdminClientCalls, 0);
});

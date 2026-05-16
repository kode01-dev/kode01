import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type TableName = 'products' | 'ai_recap_posts' | 'profiles';

type HomeStatsCounts = {
  products: number;
  articles: number;
  creators: number;
  totalSales: number;
};

let createPublicServerClientImpl: () => unknown = () => {
  throw new Error('createPublicServerClient mock not configured');
};

let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

let isSupabaseAdminEnvConfiguredImpl = () => true;
let isSupabasePublicEnvConfiguredImpl = () => true;

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

mock.module('@/lib/supabase/env', {
  namedExports: {
    isSupabaseAdminEnvConfigured: () => isSupabaseAdminEnvConfiguredImpl(),
    isSupabasePublicEnvConfigured: () => isSupabasePublicEnvConfiguredImpl(),
  },
});

mock.module('server-only', {
  defaultExport: {},
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/home/stats/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET as () => Promise<Response>;
}

function createSupabaseMock({
  counts,
  publishedProductSellers = [],
  totalSalesError = null,
}: {
  counts: HomeStatsCounts;
  publishedProductSellers?: Array<{ seller_id: string | null }>;
  totalSalesError?: { message: string } | null;
}) {
  const fromCalls: string[] = [];
  let rpcCallCount = 0;

  const tableCounts = new Map<TableName, number>([
    ['products', counts.products],
    ['ai_recap_posts', counts.articles],
    ['profiles', counts.creators],
  ]);

  const filters = new Map<TableName, { column: string; value: string | boolean } | null>([
    ['products', { column: 'status', value: 'published' }],
    ['ai_recap_posts', { column: 'is_published', value: true }],
    ['profiles', { column: 'role', value: 'seller' }],
  ]);

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      assert.notEqual(table, 'purchases', 'home stats route must not count purchases directly');

      if (!tableCounts.has(table as TableName)) {
        throw new Error(`Unexpected table: ${table}`);
      }

      const tableKey = table as TableName;
      const tableCount = tableCounts.get(tableKey) ?? 0;
      const filter = filters.get(tableKey) ?? null;

      return {
        select: (columns: string, options?: { count: string; head: boolean }) => {
          if (tableKey === 'products' && columns === 'seller_id') {
            return {
              eq: (column: string, value: unknown) => {
                assert.equal(column, 'status');
                assert.equal(value, 'published');

                return {
                  order: () => ({
                    range: async (from: number, to: number) => ({
                      data: publishedProductSellers.slice(from, to + 1),
                      error: null,
                    }),
                  }),
                };
              },
            };
          }

          assert.ok(options);
          assert.equal(options.count, 'exact');
          assert.equal(options.head, true);

          if (!filter) {
            return Promise.resolve({ count: tableCount, error: null });
          }

          return {
            eq: async (column: string, value: unknown) => {
              assert.equal(column, filter.column);
              assert.equal(value, filter.value);
              return { count: tableCount, error: null };
            },
          };
        },
      };
    },
    rpc: async (fn: string) => {
      rpcCallCount += 1;
      assert.equal(fn, 'get_total_sales_count');

      if (totalSalesError) {
        return { data: null, error: totalSalesError };
      }

      return { data: counts.totalSales, error: null };
    },
  };

  return {
    supabase,
    fromCalls,
    getRpcCallCount: () => rpcCallCount,
  };
}

test('GET /api/home/stats reads with admin client when available and sales rpc', async () => {
  const counts: HomeStatsCounts = {
    products: 11,
    articles: 13,
    creators: 19,
    totalSales: 29,
  };
  const mockData = createSupabaseMock({ counts });
  const createAdminClientMock = mock.fn(() => mockData.supabase);
  createAdminClientImpl = createAdminClientMock;
  createPublicServerClientImpl = () => {
    throw new Error('public fallback should not be used');
  };
  isSupabaseAdminEnvConfiguredImpl = () => true;
  isSupabasePublicEnvConfiguredImpl = () => true;

  const GET = await loadGetHandler('admin-rpc');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.deepEqual(body, {
    productsAndArticles: counts.products + counts.articles,
    creators: counts.creators,
    totalSales: counts.totalSales,
  });

  assert.equal(createAdminClientMock.mock.callCount(), 1);
  assert.equal(mockData.getRpcCallCount(), 1);
  assert.deepEqual(
    [...new Set(mockData.fromCalls)].sort(),
    ['ai_recap_posts', 'products', 'profiles'],
  );
});

test('GET /api/home/stats falls back to zero totalSales when public sales rpc errors', async () => {
  const counts: HomeStatsCounts = {
    products: 2,
    articles: 3,
    creators: 7,
    totalSales: 13,
  };
  const mockData = createSupabaseMock({
    counts,
    totalSalesError: { message: 'permission denied for function get_total_sales_count' },
  });
  createAdminClientImpl = () => mockData.supabase;
  createPublicServerClientImpl = () => {
    throw new Error('public fallback should not be used');
  };
  isSupabaseAdminEnvConfiguredImpl = () => true;
  isSupabasePublicEnvConfiguredImpl = () => true;

  const GET = await loadGetHandler('rpc-error');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.totalSales, 0);
  assert.equal(body.productsAndArticles, counts.products + counts.articles);
  assert.equal(mockData.getRpcCallCount(), 1);
});

test('GET /api/home/stats falls back to public client when admin is unavailable', async () => {
  const counts: HomeStatsCounts = {
    products: 3,
    articles: 4,
    creators: 2,
    totalSales: 7,
  };
  const mockData = createSupabaseMock({ counts });
  const createPublicClientMock = mock.fn(() => mockData.supabase);
  createAdminClientImpl = () => {
    throw new Error('admin unavailable');
  };
  createPublicServerClientImpl = createPublicClientMock;
  isSupabaseAdminEnvConfiguredImpl = () => true;
  isSupabasePublicEnvConfiguredImpl = () => true;

  const GET = await loadGetHandler('admin-fallback');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.creators, counts.creators);
  assert.equal(createPublicClientMock.mock.callCount(), 1);
});

test('GET /api/home/stats counts distinct published sellers when profiles are hidden', async () => {
  const counts: HomeStatsCounts = {
    products: 4,
    articles: 1,
    creators: 0,
    totalSales: 1,
  };
  const mockData = createSupabaseMock({
    counts,
    publishedProductSellers: [
      { seller_id: 'seller-1' },
      { seller_id: 'seller-1' },
      { seller_id: 'seller-2' },
      { seller_id: null },
    ],
  });
  createAdminClientImpl = () => {
    throw new Error('admin unavailable');
  };
  createPublicServerClientImpl = () => mockData.supabase;
  isSupabaseAdminEnvConfiguredImpl = () => true;
  isSupabasePublicEnvConfiguredImpl = () => true;

  const GET = await loadGetHandler('published-seller-fallback');
  const response = await GET();
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.creators, 2);
});

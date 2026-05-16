import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type ProductRow = {
  id: string;
  slug: string | null;
  title: string | null;
  price: number;
  cover_image_url: string | null;
  category: string | null;
  tags: unknown;
  created_at: string | null;
};

let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

mock.module('@/lib/supabase/env', {
  namedExports: {
    isSupabaseAdminEnvConfigured: () => true,
    isSupabasePublicEnvConfigured: () => true,
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => {
      throw new Error('home/products test should use admin client');
    },
  },
});

class ProductQuery {
  private selectedColumns = '';

  constructor(private readonly rows: ProductRow[]) {}

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    if (this.selectedColumns.includes('profile_marketplace_data')) {
      return Promise.resolve({
        data: null,
        error: {
          code: 'PGRST200',
          message: "Could not find a relationship between 'products' and 'profile_marketplace_data'",
        },
      });
    }

    return Promise.resolve({
      data: this.rows.slice(0, value),
      error: null,
    });
  }
}

class ReviewStatsQuery {
  select() {
    return this;
  }

  in() {
    return Promise.resolve({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "public.product_review_stats" does not exist',
      },
    });
  }
}

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/home/products/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET as (request: Request) => Promise<Response>;
}

test('GET /api/home/products returns products with compatibility fallback when optional views are missing', async () => {
  createAdminClientImpl = () => ({
    from: (table: string) => {
      if (table === 'products') {
        return new ProductQuery([
          {
            id: 'p1',
            slug: 'starter-kit',
            title: 'Starter Kit',
            price: 29,
            cover_image_url: null,
            category: 'templates',
            tags: ['ai', 123],
            created_at: '2026-03-12T00:00:00.000Z',
          },
        ]);
      }
      if (table === 'product_review_stats') return new ReviewStatsQuery();
      throw new Error(`Unexpected table ${table}`);
    },
  });

  const GET = await loadGetHandler('compat-products');
  const response = await GET(new Request('http://localhost/api/home/products?limit=4'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].slug, 'starter-kit');
  assert.deepEqual(body.items[0].tags, ['ai']);
  assert.equal(body.items[0].reviews_count, 0);
});

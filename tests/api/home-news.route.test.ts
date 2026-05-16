import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type NewsRow = {
  id: string;
  edition_id: string;
  locale: 'en' | 'fr';
  slug: string;
  title: string;
  intro: string;
  excerpt: string | null;
  tags: unknown;
  published_at: string | null;
  is_published: boolean;
};

let createAdminClientCalls = 0;
let createServerClientCalls = 0;
let createServerClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createServerClient mock not configured');
};
let failTagsSelectOnce = false;

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => {
      createAdminClientCalls += 1;
      throw new Error('home/news route must not use admin client');
    },
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => {
      createServerClientCalls += 1;
      return createServerClientImpl();
    },
  },
});

mock.module('@/lib/supabase/env', {
  namedExports: {
    isSupabasePublicEnvConfigured: () => true,
  },
});

class NewsQuery {
  private locale: 'en' | 'fr' | null = null;
  private isPublished: boolean | null = null;
  private limitValue = 0;
  private selectedColumns = '';

  constructor(private readonly rows: NewsRow[]) {}

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  eq(column: string, value: string | boolean) {
    if (column === 'locale' && (value === 'en' || value === 'fr')) this.locale = value;
    if (column === 'is_published' && typeof value === 'boolean') this.isPublished = value;
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    if (failTagsSelectOnce && this.selectedColumns.includes('tags')) {
      failTagsSelectOnce = false;
      return Promise.resolve({
        data: null,
        error: {
          code: '42703',
          message: 'column ai_recap_posts.tags does not exist',
        },
      });
    }

    this.limitValue = value;
    const filtered = this.rows
      .filter((row) => (this.locale ? row.locale === this.locale : true))
      .filter((row) => (this.isPublished === null ? true : row.is_published === this.isPublished))
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
      .slice(0, this.limitValue);

    return Promise.resolve({ data: filtered, error: null });
  }
}

function createSupabaseMock(rows: NewsRow[]) {
  return {
    from(table: string) {
      assert.equal(table, 'ai_recap_posts');
      return new NewsQuery(rows);
    },
  };
}

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/home/news/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET as (request: Request) => Promise<Response>;
}

test('GET /api/home/news uses anon server client and returns localized published items', async () => {
  createAdminClientCalls = 0;
  createServerClientCalls = 0;
  createServerClientImpl = async () =>
    createSupabaseMock([
      {
        id: 'n1',
        edition_id: 'e1',
        locale: 'en',
        slug: 'first',
        title: 'First',
        intro: 'Intro 1',
        excerpt: null,
        tags: ['ai', 123, 'news'],
        published_at: '2026-03-12T00:00:00.000Z',
        is_published: true,
      },
      {
        id: 'n2',
        edition_id: 'e2',
        locale: 'en',
        slug: 'second',
        title: 'Second',
        intro: 'Intro 2',
        excerpt: 'Summary',
        tags: ['security'],
        published_at: '2026-03-11T00:00:00.000Z',
        is_published: true,
      },
      {
        id: 'n3',
        edition_id: 'e3',
        locale: 'fr',
        slug: 'troisieme',
        title: 'Troisieme',
        intro: 'Intro 3',
        excerpt: null,
        tags: ['fr'],
        published_at: '2026-03-10T00:00:00.000Z',
        is_published: true,
      },
      {
        id: 'n4',
        edition_id: 'e4',
        locale: 'en',
        slug: 'draft',
        title: 'Draft',
        intro: 'Draft intro',
        excerpt: null,
        tags: ['draft'],
        published_at: '2026-03-09T00:00:00.000Z',
        is_published: false,
      },
    ]);

  const GET = await loadGetHandler('anon-only');
  const response = await GET(new Request('http://localhost/api/home/news?locale=en&limit=2'));

  assert.equal(response.status, 200);
  assert.equal(createServerClientCalls, 1);
  assert.equal(createAdminClientCalls, 0);

  const body = await response.json();
  assert.equal(Array.isArray(body.items), true);
  assert.equal(body.items.length, 2);
  assert.deepEqual(body.items[0].tags, ['ai', 'news']);
  assert.equal(body.items[0].id, 'n1');
  assert.equal(body.items[1].id, 'n2');
});

test('GET /api/home/news validates query params', async () => {
  createServerClientCalls = 0;
  createServerClientImpl = async () => createSupabaseMock([]);

  const GET = await loadGetHandler('validation');
  const response = await GET(new Request('http://localhost/api/home/news?limit=0'));
  assert.equal(response.status, 400);
  assert.equal(createServerClientCalls, 0);
});

test('GET /api/home/news falls back when tags column is missing', async () => {
  failTagsSelectOnce = true;
  createServerClientCalls = 0;
  createServerClientImpl = async () =>
    createSupabaseMock([
      {
        id: 'n1',
        edition_id: 'e1',
        locale: 'en',
        slug: 'first',
        title: 'First',
        intro: 'Intro 1',
        excerpt: null,
        tags: ['ai'],
        published_at: '2026-03-12T00:00:00.000Z',
        is_published: true,
      },
    ]);

  const GET = await loadGetHandler('missing-tags-fallback');
  const response = await GET(new Request('http://localhost/api/home/news?locale=en&limit=1'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 1);
  assert.deepEqual(body.items[0].tags, []);
});

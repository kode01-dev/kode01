import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type EditorialRow = {
  id: string;
  translation_group_id: string;
  source_locale: 'en' | 'fr';
  locale: 'en' | 'fr';
  status: 'draft' | 'published';
  is_sponsored: boolean;
  sponsorship_status: 'none';
  sponsored_owner_user_id: null;
  sponsored_submitted_at: null;
  sponsored_approved_at: null;
  sponsored_approved_by: null;
  sponsored_rejected_at: null;
  sponsored_rejected_by: null;
  sponsored_rejection_reason: null;
  slug: string;
  category: string | null;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  clap_count?: number;
};

function makeRow(overrides: Partial<EditorialRow> & Pick<EditorialRow, 'id' | 'slug' | 'title' | 'locale'>): EditorialRow {
  return {
    translation_group_id: `tg-${overrides.id}`,
    source_locale: overrides.locale,
    status: 'published',
    is_sponsored: false,
    sponsorship_status: 'none',
    sponsored_owner_user_id: null,
    sponsored_submitted_at: null,
    sponsored_approved_at: null,
    sponsored_approved_by: null,
    sponsored_rejected_at: null,
    sponsored_rejected_by: null,
    sponsored_rejection_reason: null,
    category: null,
    excerpt: null,
    cover_image_url: null,
    author_name: null,
    published_at: '2026-03-12T00:00:00.000Z',
    created_at: '2026-03-12T00:00:00.000Z',
    updated_at: '2026-03-12T00:00:00.000Z',
    ...overrides,
  };
}

type RepoArgs = { locale: 'en' | 'fr'; page?: number; pageSize?: number; sort?: 'newest' | 'oldest' };
type RepoResult = { data: EditorialRow[]; total: number };

let repoCalls: RepoArgs[] = [];
let repoImpl: (args: RepoArgs) => Promise<RepoResult> = async () => ({ data: [], total: 0 });

mock.module('@/features/editorial/server/repository', {
  namedExports: {
    getPublishedEditorialPosts: async (args: RepoArgs) => {
      repoCalls.push(args);
      return repoImpl(args);
    },
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/home/blog/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET as (request: Request) => Promise<Response>;
}

test('GET /api/home/blog returns published editorial items', async () => {
  repoCalls = [];
  repoImpl = async ({ pageSize }) => {
    const rows = [
      makeRow({ id: 'b1', slug: 'first', title: 'First', locale: 'en' }),
      makeRow({ id: 'b2', slug: 'second', title: 'Second', locale: 'en', excerpt: 'Summary' }),
      makeRow({ id: 'b3', slug: 'third', title: 'Third', locale: 'en' }),
    ];
    return { data: rows.slice(0, pageSize ?? rows.length), total: rows.length };
  };

  const GET = await loadGetHandler('items');
  const response = await GET(new Request('http://localhost/api/home/blog?locale=en&limit=2'));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Array.isArray(body.items), true);
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].id, 'b1');
  assert.equal(body.items[1].id, 'b2');
  assert.equal(repoCalls.length, 1);
  assert.deepEqual(repoCalls[0], { locale: 'en', page: 1, pageSize: 2, sort: 'newest' });
});

test('GET /api/home/blog validates query params', async () => {
  repoCalls = [];
  repoImpl = async () => ({ data: [], total: 0 });

  const GET = await loadGetHandler('validation');
  const response = await GET(new Request('http://localhost/api/home/blog?limit=0'));

  assert.equal(response.status, 400);
  assert.equal(repoCalls.length, 0);
});

test('GET /api/home/blog passes through fr locale and defaults to en', async () => {
  repoCalls = [];
  repoImpl = async () => ({ data: [], total: 0 });

  const GETfr = await loadGetHandler('fr-locale');
  await GETfr(new Request('http://localhost/api/home/blog?locale=fr&limit=5'));
  assert.equal(repoCalls[0].locale, 'fr');
  assert.equal(repoCalls[0].pageSize, 5);

  repoCalls = [];
  const GETdefault = await loadGetHandler('default-locale');
  await GETdefault(new Request('http://localhost/api/home/blog'));
  assert.equal(repoCalls[0].locale, 'en');
  assert.equal(repoCalls[0].pageSize, 3);
  assert.equal(repoCalls[0].sort, 'newest');
});

test('GET /api/home/blog returns 503 on transient DB unavailability', async () => {
  repoCalls = [];
  repoImpl = async () => {
    throw new Error('fetch failed');
  };

  const GET = await loadGetHandler('db-unavailable');
  const response = await GET(new Request('http://localhost/api/home/blog?locale=en&limit=3'));

  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(typeof body, 'object');
});

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type MockPost = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url?: string | null;
  published_at: string | null;
  created_at: string;
};

let getPublishedEditorialPostsImpl: (args: unknown) => Promise<{ data: MockPost[]; total: number }> = async () => {
  throw new Error('getPublishedEditorialPosts mock not configured');
};

let getAppBaseUrlImpl: () => string = () => 'https://example.com';

mock.module('@/features/editorial/server/repository', {
  namedExports: {
    getPublishedEditorialPosts: (args: unknown) => getPublishedEditorialPostsImpl(args),
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => getAppBaseUrlImpl(),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/blog/rss/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET ?? routeModule.default?.GET;
}

function makePost(overrides: Partial<MockPost> = {}): MockPost {
  return {
    slug: 'first-post',
    title: 'First Post',
    excerpt: 'Summary',
    cover_image_url: 'https://cdn.example.com/default.jpg',
    published_at: '2026-03-20T12:00:00.000Z',
    created_at: '2026-03-20T11:00:00.000Z',
    ...overrides,
  };
}

test('returns RSS XML feed for locale with expected headers and structure', async () => {
  let capturedArgs: unknown = null;
  getPublishedEditorialPostsImpl = async (args) => {
    capturedArgs = args;
    return {
      data: [
        makePost({ slug: 'nouveau-b', title: 'B', published_at: '2026-03-20T12:00:00.000Z' }),
        makePost({ slug: 'nouveau-a', title: 'A', published_at: '2026-03-19T12:00:00.000Z' }),
      ],
      total: 2,
    };
  };
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('rss-structure');
  const response = await GET(new Request('http://localhost/api/blog/rss?locale=fr'));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  assert.deepEqual(capturedArgs, {
    locale: 'fr',
    page: 1,
    pageSize: 10,
    sort: 'newest',
  });
  assert.match(body, /<rss version="2.0" xmlns:atom="http:\/\/www.w3.org\/2005\/Atom" xmlns:media="http:\/\/search.yahoo.com\/mrss\/">/);
  assert.match(body, /<channel>/);
  assert.match(body, /<item>/);
  assert.match(body, /<atom:link href="https:\/\/example.com\/api\/blog\/rss\?locale=fr" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(body, /<link>https:\/\/example.com\/fr\/blog\/nouveau-b<\/link>/);
  assert.match(body, /<guid isPermaLink="true">https:\/\/example.com\/fr\/blog\/nouveau-b<\/guid>/);
  assert.match(body, /<language>fr<\/language>/);
  assert.match(body, /<enclosure url="https:\/\/cdn.example.com\/default.jpg" type="image\/jpeg" length="0" \/>/);
  assert.match(body, /<media:content url="https:\/\/cdn.example.com\/default.jpg" medium="image" \/>/);
  assert.equal(body.includes('?utm_'), false);

  const firstIndex = body.indexOf('/fr/blog/nouveau-b');
  const secondIndex = body.indexOf('/fr/blog/nouveau-a');
  assert.equal(firstIndex < secondIndex, true);
});

test('returns 400 when locale query param is invalid', async () => {
  const GET = await loadGetHandler('rss-validation');
  const response = await GET(new Request('http://localhost/api/blog/rss?locale=es'));
  assert.equal(response.status, 400);
});

test('returns valid channel XML when there are no published posts', async () => {
  getPublishedEditorialPostsImpl = async () => ({ data: [], total: 0 });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('rss-empty');
  const response = await GET(new Request('http://localhost/api/blog/rss?locale=en'));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /<rss version="2.0"/);
  assert.match(body, /<channel>/);
  assert.equal(body.includes('<item>'), false);
});

test('uses RFC-822 pubDate format and caps rendered items at 10', async () => {
  const posts = Array.from({ length: 11 }, (_, index) =>
    makePost({
      slug: `post-${index + 1}`,
      title: `Post ${index + 1}`,
      published_at: `2026-03-${String(20 - index).padStart(2, '0')}T12:00:00.000Z`,
    }),
  );

  getPublishedEditorialPostsImpl = async () => ({ data: posts, total: posts.length });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('rss-limit');
  const response = await GET(new Request('http://localhost/api/blog/rss?locale=en'));
  const body = await response.text();

  const itemMatches = body.match(/<item>/g) ?? [];
  assert.equal(itemMatches.length, 10);
  assert.match(body, /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/);
});

test('does not emit image tags when a post has no cover image', async () => {
  getPublishedEditorialPostsImpl = async () => ({
    data: [makePost({ cover_image_url: null })],
    total: 1,
  });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('rss-no-image');
  const response = await GET(new Request('http://localhost/api/blog/rss?locale=en'));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body.includes('<enclosure '), false);
  assert.equal(body.includes('<media:content '), false);
});

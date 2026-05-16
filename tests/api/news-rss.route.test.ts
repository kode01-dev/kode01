import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type MockNewsPost = {
  id?: string;
  slug: string;
  title: string;
  intro: string;
  excerpt: string | null;
  published_at: string | null;
};

let getPublishedRecapPostsPageImpl: (
  args: unknown,
) => Promise<{ data: MockNewsPost[]; total: number }> = async () => {
  throw new Error('getPublishedRecapPostsPage mock not configured');
};

let getAppBaseUrlImpl: () => string = () => 'https://example.com';

mock.module('@/features/ai-recap/server/repository', {
  namedExports: {
    getPublishedRecapPostsPage: (args: unknown) => getPublishedRecapPostsPageImpl(args),
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => getAppBaseUrlImpl(),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/news/rss/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.GET ?? routeModule.default?.GET;
}

function makeNewsPost(overrides: Partial<MockNewsPost> = {}): MockNewsPost {
  return {
    slug: 'ai-update-1',
    title: 'AI Update 1',
    intro: 'Intro',
    excerpt: 'Summary',
    published_at: '2026-03-20T12:00:00.000Z',
    ...overrides,
  };
}

test('returns AI News RSS XML with image links and expected headers', async () => {
  let capturedArgs: unknown = null;
  getPublishedRecapPostsPageImpl = async (args) => {
    capturedArgs = args;
    return {
      data: [
        makeNewsPost({ slug: 'ai-b', title: 'AI B' }),
        makeNewsPost({ slug: 'ai-a', title: 'AI A', published_at: '2026-03-19T12:00:00.000Z' }),
      ],
      total: 2,
    };
  };
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('news-rss-structure');
  const response = await GET(new Request('http://localhost/api/news/rss?locale=fr'));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  assert.deepEqual(capturedArgs, {
    locale: 'fr',
    limit: 10,
    offset: 0,
    sort: 'newest',
  });
  assert.match(body, /<rss version="2.0" xmlns:atom="http:\/\/www.w3.org\/2005\/Atom" xmlns:media="http:\/\/search.yahoo.com\/mrss\/">/);
  assert.match(body, /<channel>/);
  assert.match(body, /<item>/);
  assert.match(body, /<atom:link href="https:\/\/example.com\/api\/news\/rss\?locale=fr" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(body, /<link>https:\/\/example.com\/fr\/news\/ai-b<\/link>/);
  assert.match(body, /<guid isPermaLink="true">https:\/\/example.com\/fr\/news\/ai-b<\/guid>/);
  assert.match(body, /<language>fr<\/language>/);
  assert.match(body, /<enclosure url="https:\/\/example.com\/api\/og\?title=AI\+B&amp;desc=Summary" type="image\/jpeg" length="0" \/>/);
  assert.match(body, /<media:content url="https:\/\/example.com\/api\/og\?title=AI\+B&amp;desc=Summary" medium="image" \/>/);
});

test('returns 400 when AI News RSS locale query param is invalid', async () => {
  const GET = await loadGetHandler('news-rss-validation');
  const response = await GET(new Request('http://localhost/api/news/rss?locale=es'));
  assert.equal(response.status, 400);
});

test('returns valid channel XML when there are no AI News posts', async () => {
  getPublishedRecapPostsPageImpl = async () => ({ data: [], total: 0 });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('news-rss-empty');
  const response = await GET(new Request('http://localhost/api/news/rss?locale=en'));
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /<rss version="2.0"/);
  assert.match(body, /<channel>/);
  assert.equal(body.includes('<item>'), false);
});

test('uses RFC-822 pubDate format and caps AI News items at 10', async () => {
  const posts = Array.from({ length: 11 }, (_, index) =>
    makeNewsPost({
      slug: `news-${index + 1}`,
      title: `News ${index + 1}`,
      published_at: `2026-03-${String(20 - index).padStart(2, '0')}T12:00:00.000Z`,
    }),
  );

  getPublishedRecapPostsPageImpl = async () => ({ data: posts, total: posts.length });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('news-rss-limit');
  const response = await GET(new Request('http://localhost/api/news/rss?locale=en'));
  const body = await response.text();

  const itemMatches = body.match(/<item>/g) ?? [];
  assert.equal(itemMatches.length, 10);
  assert.match(body, /<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/);
});

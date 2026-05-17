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

async function loadAliasGetHandler(scenario: string) {
  const routeModule = await import(`../../src/app/[locale]/(marketing)/news/rss.xml/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
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
        makeNewsPost({ slug: 'ai-b', title: 'AI B & <safe>', excerpt: 'Summary & analysis' }),
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
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('last-modified'), 'Fri, 20 Mar 2026 12:00:00 GMT');
  assert.match(response.headers.get('etag') ?? '', /^"rss-[a-f0-9]{64}"$/);
  assert.equal(
    response.headers.get('link'),
    '<https://example.com/api/news/rss?locale=fr>; rel="self"; type="application/rss+xml"',
  );
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
  assert.match(body, /<title>AI B &amp; &lt;safe&gt;<\/title>/);
  assert.match(body, /<description>Summary &amp; analysis<\/description>/);
  assert.match(body, /<link>https:\/\/example.com\/fr\/news\/ai-b<\/link>/);
  assert.match(body, /<guid isPermaLink="true">https:\/\/example.com\/fr\/news\/ai-b<\/guid>/);
  assert.match(body, /<language>fr<\/language>/);
  assert.equal(body.includes('<enclosure '), false);
  assert.equal(body.includes('length="0"'), false);
  assert.match(body, /<media:content url="https:\/\/example.com\/api\/og\?title=AI\+B\+%26\+%3Csafe%3E&amp;desc=Summary\+%26\+analysis" medium="image" type="image\/png" \/>/);
});

test('supports localized AI News RSS .xml alias with self link', async () => {
  getPublishedRecapPostsPageImpl = async () => ({
    data: [makeNewsPost({ slug: 'alias-news' })],
    total: 1,
  });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadAliasGetHandler('news-rss-alias');
  const response = await GET(new Request('http://localhost/fr/news/rss.xml'), {
    params: Promise.resolve({ locale: 'fr' }),
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('link'),
    '<https://example.com/fr/news/rss.xml>; rel="self"; type="application/rss+xml"',
  );
  assert.match(body, /<atom:link href="https:\/\/example.com\/fr\/news\/rss.xml" rel="self" type="application\/rss\+xml" \/>/);
});

test('returns 304 for matching AI News RSS conditional request headers', async () => {
  getPublishedRecapPostsPageImpl = async () => ({
    data: [makeNewsPost({ published_at: '2026-03-20T12:00:00.000Z' })],
    total: 1,
  });
  getAppBaseUrlImpl = () => 'https://example.com';

  const GET = await loadGetHandler('news-rss-conditional');
  const first = await GET(new Request('http://localhost/api/news/rss?locale=en'));
  const etag = first.headers.get('etag');
  assert.ok(etag);

  const byEtag = await GET(new Request('http://localhost/api/news/rss?locale=en', {
    headers: { 'If-None-Match': etag },
  }));
  assert.equal(byEtag.status, 304);
  assert.equal(await byEtag.text(), '');

  const byDate = await GET(new Request('http://localhost/api/news/rss?locale=en', {
    headers: { 'If-Modified-Since': 'Fri, 20 Mar 2026 12:00:00 GMT' },
  }));
  assert.equal(byDate.status, 304);
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

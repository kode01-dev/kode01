import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type SourceRow = {
  id: string;
  name: string;
  url: string;
  feed_url: string | null;
  domain: string;
  priority: number;
  is_active: boolean;
  locale_hint: string;
  scrape_route: 'rss' | 'firecrawl';
  rss_allow_firecrawl_fallback: boolean;
  created_at?: string;
  updated_at?: string;
};

let insertedSources: Record<string, unknown>[] = [];
let updatedSources: Record<string, unknown>[] = [];
let existingSource: Pick<SourceRow, 'id' | 'feed_url' | 'scrape_route' | 'rss_allow_firecrawl_fallback'> | null = {
  id: 'src_1',
  feed_url: 'https://feeds.example.com/rss.xml',
  scrape_route: 'rss',
  rss_allow_firecrawl_fallback: true,
};

const validateServerFetchUrlImpl: (rawUrl: string) => Promise<URL> = async (rawUrl) => {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') throw new Error('blocked_url:invalid_protocol');
  if (parsed.username || parsed.password) throw new Error('blocked_url:contains_credentials');
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('10.')) {
    throw new Error('blocked_url:blocked_hostname');
  }
  return parsed;
};

mock.module('@/lib/security/server-url-safety', {
  namedExports: {
    validateServerFetchUrl: (rawUrl: string) => validateServerFetchUrlImpl(rawUrl),
  },
});

mock.module('@/lib/auth/roles', {
  namedExports: {
    isAdminRole: (role: string | null | undefined) => role === 'admin',
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/admin/weekly-ai-recap/sources',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    }),
    logAuditEvent: async () => undefined,
  },
});

function sourceFromPayload(payload: Record<string, unknown>): SourceRow {
  return {
    id: 'src_1',
    name: String(payload.name ?? 'Source'),
    url: String(payload.url ?? 'https://example.com/news'),
    feed_url: typeof payload.feed_url === 'string' ? payload.feed_url : null,
    domain: String(payload.domain ?? 'example.com'),
    priority: Number(payload.priority ?? 100),
    is_active: payload.is_active !== false,
    locale_hint: String(payload.locale_hint ?? 'both'),
    scrape_route: payload.scrape_route === 'firecrawl' ? 'firecrawl' : 'rss',
    rss_allow_firecrawl_fallback: payload.rss_allow_firecrawl_fallback === true,
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
  };
}

function makeSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin_user' } } }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: 'admin' }, error: null }),
            }),
          }),
        };
      }

      assert.equal(table, 'ai_recap_sources');
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              insertedSources.push(payload);
              return { data: sourceFromPayload(payload), error: null };
            },
          }),
        }),
        select: () => ({
          order: async () => ({ data: [], error: null }),
          eq: () => ({
            maybeSingle: async () => ({ data: existingSource, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              single: async () => {
                updatedSources.push(payload);
                return {
                  data: sourceFromPayload({
                    id: existingSource?.id ?? 'src_1',
                    name: 'Updated Source',
                    url: 'https://example.com/news',
                    domain: 'example.com',
                    priority: 100,
                    is_active: true,
                    locale_hint: 'both',
                    scrape_route: existingSource?.scrape_route ?? 'rss',
                    rss_allow_firecrawl_fallback: existingSource?.rss_allow_firecrawl_fallback ?? false,
                    ...payload,
                  }),
                  error: null,
                };
              },
            }),
          }),
        }),
      };
    },
  };
}

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => makeSupabaseClient(),
  },
});

async function loadHandlers(scenario: string) {
  const routeModule = await import(`../../src/app/api/admin/weekly-ai-recap/sources/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return {
    POST: routeModule.POST as (request: Request) => Promise<Response>,
    PATCH: routeModule.PATCH as (request: Request) => Promise<Response>,
  };
}

function jsonRequest(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/weekly-ai-recap/sources', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /api/admin/weekly-ai-recap/sources requires feed_url for RSS sources', async () => {
  insertedSources = [];
  const { POST } = await loadHandlers('post-missing-feed');

  const response = await POST(jsonRequest('POST', {
    name: 'RSS Source',
    url: 'https://example.com/news',
    scrape_route: 'rss',
  }));

  assert.equal(response.status, 400);
  assert.equal(insertedSources.length, 0);
});

test('POST /api/admin/weekly-ai-recap/sources normalizes valid HTTPS source and feed URLs', async () => {
  insertedSources = [];
  const { POST } = await loadHandlers('post-valid-rss');

  const response = await POST(jsonRequest('POST', {
    name: 'RSS Source',
    url: 'https://www.example.com/news',
    feed_url: 'https://feeds.example.com/rss.xml',
    scrape_route: 'rss',
    rss_allow_firecrawl_fallback: true,
  }));

  assert.equal(response.status, 200);
  assert.equal(insertedSources.length, 1);
  assert.equal(insertedSources[0].url, 'https://www.example.com/news');
  assert.equal(insertedSources[0].domain, 'example.com');
  assert.equal(insertedSources[0].feed_url, 'https://feeds.example.com/rss.xml');
  assert.equal(insertedSources[0].rss_allow_firecrawl_fallback, true);
});

test('POST /api/admin/weekly-ai-recap/sources rejects unsafe source and feed URLs', async () => {
  insertedSources = [];
  const { POST } = await loadHandlers('post-unsafe-urls');

  const nonHttpsFeed = await POST(jsonRequest('POST', {
    name: 'RSS Source',
    url: 'https://example.com/news',
    feed_url: 'http://feeds.example.com/rss.xml',
    scrape_route: 'rss',
  }));
  assert.equal(nonHttpsFeed.status, 400);
  assert.equal((await nonHttpsFeed.json()).error, 'Invalid feed_url');

  const credentialsUrl = await POST(jsonRequest('POST', {
    name: 'Bad Source',
    url: 'https://user:pass@example.com/news',
    scrape_route: 'firecrawl',
  }));
  assert.equal(credentialsUrl.status, 400);
  assert.equal((await credentialsUrl.json()).error, 'Invalid url');

  const localUrl = await POST(jsonRequest('POST', {
    name: 'Local Source',
    url: 'https://localhost/news',
    scrape_route: 'firecrawl',
  }));
  assert.equal(localUrl.status, 400);
  assert.equal((await localUrl.json()).error, 'Invalid url');
  assert.equal(insertedSources.length, 0);
});

test('PATCH /api/admin/weekly-ai-recap/sources validates feed_url and preserves fallback for valid RSS updates', async () => {
  updatedSources = [];
  existingSource = {
    id: 'src_1',
    feed_url: 'https://feeds.example.com/rss.xml',
    scrape_route: 'rss',
    rss_allow_firecrawl_fallback: true,
  };
  const { PATCH } = await loadHandlers('patch-valid-rss');

  const response = await PATCH(jsonRequest('PATCH', {
    id: 'src_1',
    name: 'Updated Source',
  }));

  assert.equal(response.status, 200);
  assert.equal(updatedSources.length, 1);
  assert.equal(updatedSources[0].feed_url, 'https://feeds.example.com/rss.xml');
  assert.equal(updatedSources[0].rss_allow_firecrawl_fallback, true);
});

test('PATCH /api/admin/weekly-ai-recap/sources rejects unsafe feed_url updates', async () => {
  updatedSources = [];
  existingSource = {
    id: 'src_1',
    feed_url: 'https://feeds.example.com/rss.xml',
    scrape_route: 'rss',
    rss_allow_firecrawl_fallback: true,
  };
  const { PATCH } = await loadHandlers('patch-unsafe-feed');

  const response = await PATCH(jsonRequest('PATCH', {
    id: 'src_1',
    feed_url: 'https://127.0.0.1/rss.xml',
  }));

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Invalid feed_url');
  assert.equal(updatedSources.length, 0);
});

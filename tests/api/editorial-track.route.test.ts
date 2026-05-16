import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type EditorialPostRow = {
  view_count: number | null;
  click_count: number | null;
};

const VALID_POST_ID = '11111111-1111-4111-8111-111111111111';

let createAdminClientImpl: () => {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: EditorialPostRow | null }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: null }>;
    };
  };
} = () => {
  throw new Error('createAdminClient mock not configured');
};

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/editorial/track/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST ?? routeModule.default?.POST ?? routeModule['module.exports']?.POST;
}

function makeTrackRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/editorial/track', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      postId: VALID_POST_ID,
      event: 'view',
    }),
  });
}

test('rate limiting uses trusted proxy IP and resists x-forwarded-for spoof rotation', async () => {
  const fromMock = mock.fn((table: string) => {
    assert.equal(table, 'editorial_posts');
    return {
      select: (columns: string) => {
        assert.equal(columns, 'view_count, click_count');
        return {
          eq: (column: string, value: string) => {
            assert.equal(column, 'id');
            assert.equal(value, VALID_POST_ID);
            return {
              maybeSingle: async () => ({
                data: { view_count: 10, click_count: 1 },
              }),
            };
          },
        };
      },
      update: (payload: Record<string, unknown>) => {
        assert.equal(typeof payload.last_viewed_at, 'string');
        assert.equal(payload.view_count, 11);
        return {
          eq: async (column: string, value: string) => {
            assert.equal(column, 'id');
            assert.equal(value, VALID_POST_ID);
            return { error: null };
          },
        };
      },
    };
  });
  const createAdminClientMock = mock.fn(() => ({ from: fromMock }));
  createAdminClientImpl = createAdminClientMock;

  const POST = await loadPostHandler('trusted-header');
  assert.equal(typeof POST, 'function');

  const firstResponse = await POST(
    makeTrackRequest({
      'x-vercel-forwarded-for': '198.51.100.77',
      'x-forwarded-for': '203.0.113.1',
    }),
  );
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), { success: true });

  const secondResponse = await POST(
    makeTrackRequest({
      'x-vercel-forwarded-for': '198.51.100.77',
      'x-forwarded-for': '203.0.113.2',
    }),
  );
  assert.equal(secondResponse.status, 200);
  assert.deepEqual(await secondResponse.json(), {
    success: true,
    skipped: 'rate_limited',
  });

  assert.equal(createAdminClientMock.mock.callCount(), 1);
});

test('production mode does not trust spoofable forwarded headers for rate keys', async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  env.NODE_ENV = 'production';

  try {
    const createAdminClientMock = mock.fn(() => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { view_count: 2, click_count: 0 },
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    }));
    createAdminClientImpl = createAdminClientMock;

    const POST = await loadPostHandler('production-spoofed-header');
    assert.equal(typeof POST, 'function');

    const firstResponse = await POST(
      makeTrackRequest({
        'x-forwarded-for': '203.0.113.10',
      }),
    );
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(await firstResponse.json(), { success: true });

    const secondResponse = await POST(
      makeTrackRequest({
        'x-forwarded-for': '203.0.113.11',
      }),
    );
    assert.equal(secondResponse.status, 200);
    assert.deepEqual(await secondResponse.json(), {
      success: true,
      skipped: 'rate_limited',
    });

    assert.equal(createAdminClientMock.mock.callCount(), 1);
  } finally {
    if (previousNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previousNodeEnv;
    }
  }
});

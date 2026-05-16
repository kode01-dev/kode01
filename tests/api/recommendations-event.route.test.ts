import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const validPayload = {
  eventType: 'product_view',
  sourceType: 'product',
  sourceSlug: 'sample-product',
};

function makeRequest(payload: unknown): Request {
  return new Request('http://localhost/api/recommendations/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

async function loadPostHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/recommendations/event/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.POST ?? routeModule.default?.POST ?? routeModule['module.exports']?.POST;
}

test('returns 500 when signed-in recommendation insert fails', async () => {
  const insertMock = mock.fn(async () => ({ error: { message: 'insert failed' } }));
  let requestedTable: string | undefined;
  const fromMock = mock.fn((table: string) => {
    requestedTable = table;
    return { insert: insertMock };
  });

  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: '11111111-1111-1111-1111-111111111111' } },
      }),
    },
    from: fromMock,
  });

  const consoleErrorMock = mock.method(console, 'error', () => {});
  const POST = await loadPostHandler('insert-error');
  assert.equal(typeof POST, 'function');

  const response = await POST(makeRequest(validPayload));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Failed to track recommendation event' });
  assert.equal(fromMock.mock.callCount(), 1);
  assert.equal(requestedTable, 'recommendation_events');
  assert.equal(insertMock.mock.callCount(), 1);
  assert.equal(consoleErrorMock.mock.callCount(), 1);
  consoleErrorMock.mock.restore();
});

test('returns 500 internal server error when Supabase client creation throws', async () => {
  createClientImpl = async () => {
    throw new Error('supabase unavailable');
  };

  const consoleErrorMock = mock.method(console, 'error', () => {});
  const POST = await loadPostHandler('client-error');
  assert.equal(typeof POST, 'function');

  const response = await POST(makeRequest(validPayload));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal Server Error' });
  assert.equal(consoleErrorMock.mock.callCount(), 1);
  consoleErrorMock.mock.restore();
});

test('returns 400 for invalid payload and skips Supabase call', async () => {
  const createClientMock = mock.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  }));

  createClientImpl = createClientMock;

  const POST = await loadPostHandler('invalid-payload');
  assert.equal(typeof POST, 'function');

  const response = await POST(makeRequest({ sourceType: 'product' }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid payload' });
  assert.equal(createClientMock.mock.callCount(), 0);
});

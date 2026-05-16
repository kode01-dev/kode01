import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getAdminSessionImpl: () => Promise<{ userId: string } | null> = async () => null;
let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

mock.module('@/app/api/admin/api-monitoring/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionImpl(),
    parseApiMonitorRange: () => ({
      range: '24h',
      fromDate: new Date('2026-03-01T00:00:00.000Z'),
    }),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/admin/api-monitoring/deliveries/id/retry',
      ipAddress: null,
      userAgent: null,
    }),
    logAuditEvent: async () => undefined,
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getServerEnv: () => ({
      NODE_ENV: 'development',
      CRON_SECRET: 'cron-secret',
    }),
    getAppBaseUrl: () => 'http://localhost',
  },
});

async function loadRetryRoute(scenario: string) {
  return import(
    `../../src/app/api/admin/api-monitoring/deliveries/[id]/retry/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
}

test('retry route returns 403 when admin session is missing', async () => {
  getAdminSessionImpl = async () => null;
  createAdminClientImpl = () => ({
    from: () => {
      throw new Error('createAdminClient should not be used when forbidden');
    },
  });

  const routeModule = await loadRetryRoute('retry-forbidden');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/api-monitoring/deliveries/id/retry', { method: 'POST' }),
    { params: Promise.resolve({ id: 'f08456ca-a988-4ebc-95c9-01194343fca0' }) },
  );

  assert.equal(response.status, 403);
});

test('retry route returns 400 for invalid delivery id', async () => {
  getAdminSessionImpl = async () => ({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  createAdminClientImpl = () => ({
    from: () => {
      throw new Error('createAdminClient should not be used for invalid params');
    },
  });

  const routeModule = await loadRetryRoute('retry-invalid-id');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/api-monitoring/deliveries/id/retry', { method: 'POST' }),
    { params: Promise.resolve({ id: 'not-a-uuid' }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid delivery id' });
});

test('retry route requeues delivery and triggers worker pass', async () => {
  getAdminSessionImpl = async () => ({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

  const originalDelivery = {
    id: 'f08456ca-a988-4ebc-95c9-01194343fca0',
    status: 'failed',
    next_attempt_at: '2026-03-12T10:00:00.000Z',
    attempt_count: 6,
    max_attempts: 6,
    updated_at: '2026-03-12T10:01:00.000Z',
  } as const;

  let updatedStatus: string | null = null;
  let updatedNextAttemptAt: string | null = null;

  createAdminClientImpl = () => ({
    from: (table: string) => {
      assert.equal(table, 'license_webhook_deliveries');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: originalDelivery, error: null }),
          }),
        }),
        update: (payload: { status: string; next_attempt_at: string }) => {
          updatedStatus = payload.status;
          updatedNextAttemptAt = payload.next_attempt_at;
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    ...originalDelivery,
                    status: payload.status,
                    next_attempt_at: payload.next_attempt_at,
                    updated_at: payload.next_attempt_at,
                  },
                  error: null,
                }),
              }),
            }),
          };
        },
      };
    },
  });

  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 200 }));
  const routeModule = await loadRetryRoute('retry-success');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/api-monitoring/deliveries/id/retry', { method: 'POST' }),
    { params: Promise.resolve({ id: originalDelivery.id }) },
  );
  fetchMock.mock.restore();

  assert.equal(response.status, 200);
  assert.equal(updatedStatus, 'retrying');
  assert.equal(typeof updatedNextAttemptAt, 'string');

  const body = await response.json();
  assert.equal(body.delivery.id, originalDelivery.id);
  assert.equal(body.delivery.status, 'retrying');
  assert.equal(body.worker.triggered, true);
  assert.equal(fetchMock.mock.callCount(), 1);
});

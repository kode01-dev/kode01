import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type CleanupResult = { error: { message: string } | null };

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};
let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};
let auditEvents: Array<Record<string, unknown>> = [];

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
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
      path: '/api/account/delete',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    }),
    logAuditEvent: async (event: Record<string, unknown>) => {
      auditEvents.push(event);
    },
  },
});

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/account/delete/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST as (request: Request) => Promise<Response>;
}

function makeRequest(payload: unknown): Request {
  return new Request('http://localhost/api/account/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function makeUserClient(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  };
}

function makeAdminClient(options: {
  cleanupErrors?: Record<string, string>;
  authDeleteError?: string | null;
  profileDeleteError?: string | null;
  operationCalls: Array<Record<string, unknown>>;
}) {
  const deleteUserMock = mock.fn(async () => ({
    error: options.authDeleteError ? { message: options.authDeleteError } : null,
  }));

  const resultFor = (table: string): CleanupResult => {
    if (table === 'profiles') {
      return { error: options.profileDeleteError ? { message: options.profileDeleteError } : null };
    }
    const message = options.cleanupErrors?.[table];
    return { error: message ? { message } : null };
  };

  return {
    auth: {
      admin: {
        deleteUser: deleteUserMock,
      },
    },
    deleteUserMock,
    from: (table: string) => ({
      delete: () => ({
        eq: async (column: string, value: string) => {
          options.operationCalls.push({ table, action: 'delete', column, value });
          return resultFor(table);
        },
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async (column: string, value: string) => {
          options.operationCalls.push({ table, action: 'update', payload, column, value });
          return resultFor(table);
        },
      }),
    }),
  };
}

test('POST /api/account/delete returns 401 when user is not authenticated', async () => {
  auditEvents = [];
  createClientImpl = async () => makeUserClient(null);

  const POST = await loadPostHandler('unauthorized');
  const response = await POST(makeRequest({ confirmEmail: 'buyer@example.com' }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  assert.deepEqual(auditEvents, []);
});

test('POST /api/account/delete rejects mismatched confirmation email', async () => {
  auditEvents = [];
  const createAdminClientMock = mock.fn(() => makeAdminClient({ operationCalls: [] }));
  createClientImpl = async () =>
    makeUserClient({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'owner@example.com',
    });
  createAdminClientImpl = createAdminClientMock;

  const POST = await loadPostHandler('email-mismatch');
  const response = await POST(makeRequest({ confirmEmail: 'other@example.com' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Email confirmation does not match' });
  assert.equal(createAdminClientMock.mock.callCount(), 0);
  assert.deepEqual(auditEvents, []);
});

test('POST /api/account/delete cleans account data, deletes auth user, and records audits', async () => {
  auditEvents = [];
  const operationCalls: Array<Record<string, unknown>> = [];
  const adminClient = makeAdminClient({ operationCalls });
  createClientImpl = async () =>
    makeUserClient({
      id: '22222222-2222-4222-8222-222222222222',
      email: 'owner@example.com',
    });
  createAdminClientImpl = () => adminClient;

  const POST = await loadPostHandler('success');
  const response = await POST(makeRequest({ confirmEmail: 'OWNER@example.com' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(adminClient.deleteUserMock.mock.callCount(), 1);
  assert.deepEqual(adminClient.deleteUserMock.mock.calls[0]?.arguments, [
    '22222222-2222-4222-8222-222222222222',
  ]);
  assert.deepEqual(
    operationCalls.map((call) => `${call.action}:${call.table}`),
    [
      'delete:recommendation_events',
      'update:cookie_consent_events',
      'update:marketing_campaign_events',
      'delete:notification_push_subscriptions',
      'delete:notifications',
      'delete:abandoned_cart_email_jobs',
      'delete:user_saved_items',
      'delete:product_reviews',
      'delete:carts',
      'delete:profiles',
    ],
  );
  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['account_deletion_requested', 'account_deleted'],
  );
});

test('POST /api/account/delete returns 500 and skips auth deletion when cleanup fails', async () => {
  auditEvents = [];
  const operationCalls: Array<Record<string, unknown>> = [];
  const adminClient = makeAdminClient({
    operationCalls,
    cleanupErrors: {
      notifications: 'delete failed',
    },
  });
  createClientImpl = async () =>
    makeUserClient({
      id: '33333333-3333-4333-8333-333333333333',
      email: 'owner@example.com',
    });
  createAdminClientImpl = () => adminClient;

  const consoleErrorMock = mock.method(console, 'error', () => {});
  const POST = await loadPostHandler('cleanup-failure');
  const response = await POST(makeRequest({ confirmEmail: 'owner@example.com' }));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Failed to clean up account data' });
  assert.equal(adminClient.deleteUserMock.mock.callCount(), 0);
  assert.equal(operationCalls.some((call) => call.table === 'profiles'), false);
  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['account_deletion_requested', 'account_deletion_cleanup_failed'],
  );
  assert.equal(consoleErrorMock.mock.callCount(), 1);
  consoleErrorMock.mock.restore();
});

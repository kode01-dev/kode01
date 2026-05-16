import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', {
  defaultExport: {},
});

type PurchaseRow = {
  id: string;
  buyer_id: string;
  product_id: string;
  status: string;
};

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

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
      path: '/api/order-incidents',
      ipAddress: null,
      userAgent: null,
    }),
    logAuditEvent: async () => undefined,
  },
});

async function loadRouteModule(scenario: string) {
  return import(`../../src/app/api/order-incidents/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('GET /api/order-incidents returns 401 when user is not authenticated', async () => {
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  });

  const routeModule = await loadRouteModule('get-unauthorized');
  const response = await routeModule.GET(new Request('http://localhost/api/order-incidents'));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('POST /api/order-incidents creates an incident for a valid purchase', async () => {
  const purchaseRow: PurchaseRow = {
    id: '11111111-1111-4111-8111-111111111111',
    buyer_id: '22222222-2222-4222-8222-222222222222',
    product_id: '33333333-3333-4333-8333-333333333333',
    status: 'completed',
  };

  const purchaseQuery = {
    select: () => purchaseQuery,
    eq: () => purchaseQuery,
    maybeSingle: async () => ({ data: purchaseRow, error: null }),
  };

  const existingIncidentQuery = {
    select: () => existingIncidentQuery,
    eq: () => existingIncidentQuery,
    in: () => existingIncidentQuery,
    order: () => existingIncidentQuery,
    limit: () => existingIncidentQuery,
    maybeSingle: async () => ({ data: null, error: null }),
  };

  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: '22222222-2222-4222-8222-222222222222',
          },
        },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === 'purchases') return purchaseQuery;
      if (table === 'purchase_incidents') return existingIncidentQuery;
      if (table === 'recommendation_events') return { insert: async () => ({ error: null }) };
      throw new Error(`Unexpected table ${table}`);
    },
  });

  const insertIncidentMock = mock.fn(async () => ({
    data: { id: '44444444-4444-4444-8444-444444444444' },
    error: null,
  }));
  const selectIncidentMock = mock.fn(() => ({ single: insertIncidentMock }));
  const incidentInsertQuery = {
    insert: () => ({ select: selectIncidentMock }),
  };

  const actionInsertMock = mock.fn(async () => ({ error: null }));
  const actionInsertQuery = {
    insert: actionInsertMock,
  };

  createAdminClientImpl = () => ({
    from: (table: string) => {
      if (table === 'purchase_incidents') return incidentInsertQuery;
      if (table === 'purchase_incident_actions') return actionInsertQuery;
      throw new Error(`Unexpected admin table ${table}`);
    },
  });

  const routeModule = await loadRouteModule('post-success');
  const response = await routeModule.POST(
    new Request('http://localhost/api/order-incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchaseId: purchaseRow.id,
        issueType: 'content_missing',
        locale: 'en',
      }),
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    incidentId: '44444444-4444-4444-8444-444444444444',
  });
  assert.equal(insertIncidentMock.mock.callCount(), 1);
  assert.equal(actionInsertMock.mock.callCount(), 1);
});

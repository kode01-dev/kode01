import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getAdminSessionImpl: () => Promise<{ userId: string } | null> = async () => null;
let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};
const sendOrderAccessNotificationMock = mock.fn(async () => undefined);
const sendOrderIncidentStatusNotificationMock = mock.fn(async () => undefined);

mock.module('@/app/api/admin/order-incidents/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionImpl(),
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
      path: '/api/admin/order-incidents',
      ipAddress: null,
      userAgent: null,
    }),
    logAuditEvent: async () => undefined,
  },
});

mock.module('@/features/order-incidents/server/notifications', {
  namedExports: {
    sendOrderAccessNotification: sendOrderAccessNotificationMock,
    sendOrderIncidentStatusNotification: sendOrderIncidentStatusNotificationMock,
  },
});

async function loadPatchRoute(scenario: string) {
  return import(`../../src/app/api/admin/order-incidents/[id]/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

async function loadActionsRoute(scenario: string) {
  return import(`../../src/app/api/admin/order-incidents/[id]/actions/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('PATCH /api/admin/order-incidents/[id] returns 400 when closing without decision', async () => {
  getAdminSessionImpl = async () => ({
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  createAdminClientImpl = () => ({
    from: () => {
      throw new Error('from should not be called for validation failure');
    },
  });

  const routeModule = await loadPatchRoute('patch-validation');
  const response = await routeModule.PATCH(
    new Request('http://localhost/api/admin/order-incidents/incident-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'resolved',
      }),
    }),
    { params: Promise.resolve({ id: 'incident-1' }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid payload' });
});

test('POST /api/admin/order-incidents/[id]/actions schedules resend email and notifies buyer', async () => {
  sendOrderAccessNotificationMock.mock.resetCalls();
  getAdminSessionImpl = async () => ({
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });

  const incidentQuery = {
    select: () => incidentQuery,
    eq: () => incidentQuery,
    maybeSingle: async () => ({
      data: {
        id: 'incident-1',
        purchase_id: 'purchase-1',
        buyer_id: 'buyer-1',
        product_id: 'product-1',
        products: { title: 'Product', slug: 'product-slug' },
      },
      error: null,
    }),
  };

  const scheduleSingle = mock.fn(async () => ({
    data: { id: 'scheduled-email-1' },
    error: null,
  }));
  const scheduleSelect = mock.fn(() => ({ single: scheduleSingle }));
  const scheduledEmailInsert = {
    insert: () => ({ select: scheduleSelect }),
  };

  const incidentActionsInsert = mock.fn(async () => ({ error: null }));
  const incidentActionsQuery = {
    insert: incidentActionsInsert,
  };

  createAdminClientImpl = () => ({
    from: (table: string) => {
      if (table === 'purchase_incidents') return incidentQuery;
      if (table === 'scheduled_emails') return scheduledEmailInsert;
      if (table === 'purchase_incident_actions') return incidentActionsQuery;
      throw new Error(`Unexpected table ${table}`);
    },
  });

  const routeModule = await loadActionsRoute('actions-resend');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/order-incidents/incident-1/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'resend_purchase_confirmation',
        locale: 'en',
      }),
    }),
    { params: Promise.resolve({ id: 'incident-1' }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    incidentId: 'incident-1',
    actionType: 'resend_purchase_confirmation',
    scheduledEmailId: 'scheduled-email-1',
  });
  assert.equal(scheduleSingle.mock.callCount(), 1);
  assert.equal(incidentActionsInsert.mock.callCount(), 1);
  assert.equal(sendOrderAccessNotificationMock.mock.callCount(), 1);
});

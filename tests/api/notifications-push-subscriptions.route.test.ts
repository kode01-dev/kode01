import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { z } from 'zod';

let currentUser: { id: string } | null = null;
let upsertInput: unknown = null;
let deactivateInput: unknown = null;

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: {
        getUser: async () => ({
          data: {
            user: currentUser,
          },
        }),
      },
    }),
  },
});

mock.module('@/features/notifications/server/push', {
  namedExports: {
    pushSubscriptionSchema: z.object({
      endpoint: z.string().trim().url(),
      expirationTime: z.number().nullable().optional(),
      keys: z.object({
        p256dh: z.string().trim().min(1),
        auth: z.string().trim().min(1),
      }),
      deviceLabel: z.string().trim().optional().nullable(),
    }),
    upsertPushSubscription: async (input: unknown) => {
      upsertInput = input;
      return { subscriptionId: 'subscription-id' };
    },
    deactivatePushSubscription: async (input: unknown) => {
      deactivateInput = input;
      return { success: true };
    },
  },
});

async function loadRoute(scenario: string) {
  return import(
    `../../src/app/api/notifications/push-subscriptions/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
}

function makeJsonRequest(method: string, payload: unknown) {
  return new Request('https://kode01.test/api/notifications/push-subscriptions', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'test-browser',
    },
    body: JSON.stringify(payload),
  });
}

test('POST /api/notifications/push-subscriptions requires auth', async () => {
  currentUser = null;
  const { POST } = await loadRoute('post-unauthorized');

  const response = await POST(makeJsonRequest('POST', {}));

  assert.equal(response.status, 401);
});

test('POST /api/notifications/push-subscriptions rejects invalid payloads', async () => {
  currentUser = { id: 'user-id' };
  const { POST } = await loadRoute('post-invalid');

  const response = await POST(makeJsonRequest('POST', { endpoint: 'not-a-url' }));

  assert.equal(response.status, 400);
});

test('POST /api/notifications/push-subscriptions saves authenticated subscription', async () => {
  currentUser = { id: 'user-id' };
  upsertInput = null;
  const { POST } = await loadRoute('post-success');

  const response = await POST(makeJsonRequest('POST', {
    endpoint: 'https://push.example.test/send/abc',
    keys: {
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { subscriptionId: 'subscription-id' });
  assert.deepEqual(upsertInput, {
    userId: 'user-id',
    subscription: {
      endpoint: 'https://push.example.test/send/abc',
      keys: {
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      },
    },
    userAgent: 'test-browser',
  });
});

test('DELETE /api/notifications/push-subscriptions deactivates authenticated endpoint', async () => {
  currentUser = { id: 'user-id' };
  deactivateInput = null;
  const { DELETE } = await loadRoute('delete-success');

  const response = await DELETE(makeJsonRequest('DELETE', {
    endpoint: 'https://push.example.test/send/abc',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(deactivateInput, {
    userId: 'user-id',
    endpoint: 'https://push.example.test/send/abc',
  });
});

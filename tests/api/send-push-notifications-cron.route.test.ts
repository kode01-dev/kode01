import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let authorized = false;
let sendCalled = false;

mock.module('@/lib/security/cron-auth', {
  namedExports: {
    isCronAuthorized: () => authorized,
  },
});

mock.module('@/features/notifications/server/push', {
  namedExports: {
    sendPendingPushNotifications: async () => {
      sendCalled = true;
      return {
        processed: 1,
        sent: 1,
        failed: 0,
        skipped: 0,
        disabledSubscriptions: 0,
      };
    },
  },
});

async function loadRoute(scenario: string) {
  return import(
    `../../src/app/api/cron/send-push-notifications/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
}

function makeRequest() {
  return new Request('https://kode01.test/api/cron/send-push-notifications', {
    method: 'POST',
  });
}

test('send-push-notifications cron rejects unauthorized requests', async () => {
  authorized = false;
  sendCalled = false;
  const { POST } = await loadRoute('unauthorized');

  const response = await POST(makeRequest());

  assert.equal(response.status, 401);
  assert.equal(sendCalled, false);
});

test('send-push-notifications cron runs when authorized', async () => {
  authorized = true;
  sendCalled = false;
  const { POST } = await loadRoute('authorized');

  const response = await POST(makeRequest());

  assert.equal(response.status, 200);
  assert.equal(sendCalled, true);
  assert.deepEqual(await response.json(), {
    processed: 1,
    sent: 1,
    failed: 0,
    skipped: 0,
    disabledSubscriptions: 0,
  });
});

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let prelaunchAccessState: { enabled: boolean; locked: boolean; unlocked: boolean } = {
  enabled: false,
  locked: false,
  unlocked: true,
};
let verifyPasswordImpl: (password: string) => Promise<boolean> = async (password: string) => {
  void password;
  return false;
};
let rateLimitResponse: Response | null = null;
const cookieSetCalls: Array<{
  name: string;
  value: string;
  options?: Record<string, unknown>;
}> = [];

mock.module('@/features/site-lockscreen/lib/lockscreen-server', {
  namedExports: {
    PRELAUNCH_AUTH_COOKIE_NAME: 'prelaunch_auth_unlocked',
    PRELAUNCH_AUTH_COOKIE_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
    getPrelaunchAuthAccessState: async () => prelaunchAccessState,
    verifyLockscreenPassword: async (password: string) => verifyPasswordImpl(password),
  },
});

mock.module('@/lib/security/rate-limit-route', {
  namedExports: {
    enforceRouteRateLimit: async () => rateLimitResponse,
  },
});

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      set: (name: string, value: string, options?: Record<string, unknown>) => {
        cookieSetCalls.push({ name, value, options });
      },
    }),
  },
});

async function loadHandlers(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/prelaunch/access/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return {
    GET: routeModule.GET ?? routeModule.default?.GET,
    POST: routeModule.POST ?? routeModule.default?.POST,
  };
}

function makePostRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/prelaunch/access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

test('GET /api/prelaunch/access returns current state', async () => {
  prelaunchAccessState = { enabled: true, locked: true, unlocked: false };
  const { GET } = await loadHandlers('prelaunch-get');
  const response = await GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    enabled: true,
    locked: true,
    unlocked: false,
  });
});

test('POST /api/prelaunch/access rejects invalid password', async () => {
  prelaunchAccessState = { enabled: true, locked: true, unlocked: false };
  verifyPasswordImpl = async () => false;
  rateLimitResponse = null;
  cookieSetCalls.length = 0;

  const { POST } = await loadHandlers('prelaunch-post-invalid');
  const response = await POST(makePostRequest({ password: 'wrong-password' }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Invalid password' });
  assert.equal(cookieSetCalls.length, 0);
});

test('POST /api/prelaunch/access sets unlock cookie on valid password', async () => {
  prelaunchAccessState = { enabled: true, locked: true, unlocked: false };
  verifyPasswordImpl = async (password: string) => password === 'launch-pass';
  rateLimitResponse = null;
  cookieSetCalls.length = 0;

  const { POST } = await loadHandlers('prelaunch-post-valid');
  const response = await POST(makePostRequest({ password: 'launch-pass' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(cookieSetCalls.length, 1);
  assert.equal(cookieSetCalls[0]?.name, 'prelaunch_auth_unlocked');
  assert.equal(cookieSetCalls[0]?.value, 'true');
});

test('POST /api/prelaunch/access returns rate-limit response when blocked', async () => {
  prelaunchAccessState = { enabled: true, locked: true, unlocked: false };
  verifyPasswordImpl = async () => true;
  rateLimitResponse = new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });
  cookieSetCalls.length = 0;

  const { POST } = await loadHandlers('prelaunch-post-rate-limit');
  const response = await POST(makePostRequest({ password: 'launch-pass' }));

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'Rate limit exceeded' });
  assert.equal(cookieSetCalls.length, 0);
  rateLimitResponse = null;
});

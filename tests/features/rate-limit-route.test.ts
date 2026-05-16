import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type CheckRateLimitInput = {
  action: string;
  key: string;
};

type CheckRateLimitResult = {
  action: string;
  key: string;
  allowed: boolean;
  limit: number;
  remaining: number;
  requestCount: number;
  resetAt: string;
  degraded: boolean;
};

const checkRateLimitCalls: CheckRateLimitInput[] = [];
let checkRateLimitImpl: (input: CheckRateLimitInput) => Promise<CheckRateLimitResult> = async (input) => ({
  action: input.action,
  key: input.key,
  allowed: true,
  limit: 3,
  remaining: 2,
  requestCount: 1,
  resetAt: '2099-01-01T00:00:00.000Z',
  degraded: false,
});

let ipWhitelisted = false;
const loggedSecurityEvents: unknown[] = [];

mock.module('@/lib/security/rate-limiter', {
  namedExports: {
    checkRateLimit: async (input: CheckRateLimitInput) => {
      checkRateLimitCalls.push(input);
      return checkRateLimitImpl(input);
    },
  },
});

mock.module('@/lib/security/whitelist', {
  namedExports: {
    isIpWhitelisted: () => ipWhitelisted,
  },
});

mock.module('@/lib/security/security-log', {
  namedExports: {
    logSecurityEvent: async (event: unknown) => {
      loggedSecurityEvents.push(event);
    },
  },
});

function makeRequest(ip = '198.51.100.10'): Request {
  return new Request('http://localhost/api/test', {
    headers: {
      'x-vercel-forwarded-for': ip,
      'user-agent': 'test-agent',
    },
  });
}

function resetState() {
  checkRateLimitCalls.length = 0;
  loggedSecurityEvents.length = 0;
  ipWhitelisted = false;
}

async function loadModule(scenario: string) {
  return import(`../../src/lib/security/rate-limit-route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('enforceRouteRateLimit blocks immediately when the IP-only key is limited', async () => {
  resetState();
  checkRateLimitImpl = async (input) => ({
    action: input.action,
    key: input.key,
    allowed: false,
    limit: 3,
    remaining: 0,
    requestCount: 3,
    resetAt: '2099-01-01T00:00:00.000Z',
    degraded: false,
  });

  const { enforceRouteRateLimit } = await loadModule('ip-limited');
  const response = await enforceRouteRateLimit({
    request: makeRequest(),
    action: 'SIGNUP',
    extraKeyPart: 'user@example.com',
  });

  assert.equal(response?.status, 429);
  assert.equal(checkRateLimitCalls.length, 1);
  assert.equal(checkRateLimitCalls[0]?.key, 'rate-limit:signup:198.51.100.10');
  assert.equal(loggedSecurityEvents.length, 1);
});

test('enforceRouteRateLimit applies the contextual key after passing the IP-only key', async () => {
  resetState();
  let invocation = 0;
  checkRateLimitImpl = async (input) => {
    invocation += 1;
    return {
      action: input.action,
      key: input.key,
      allowed: invocation === 1,
      limit: 3,
      remaining: invocation === 1 ? 2 : 0,
      requestCount: invocation === 1 ? 1 : 3,
      resetAt: '2099-01-01T00:00:00.000Z',
      degraded: false,
    };
  };

  const { enforceRouteRateLimit } = await loadModule('context-limited');
  const response = await enforceRouteRateLimit({
    request: makeRequest(),
    action: 'SIGNUP',
    extraKeyPart: 'User@Example.com',
  });

  assert.equal(response?.status, 429);
  assert.equal(checkRateLimitCalls.length, 2);
  assert.equal(checkRateLimitCalls[0]?.key, 'rate-limit:signup:198.51.100.10');
  assert.equal(checkRateLimitCalls[1]?.key, 'rate-limit:signup:198.51.100.10:user@example.com');
  assert.equal(loggedSecurityEvents.length, 1);
});

test('enforceRouteRateLimit skips checks for whitelisted IPs', async () => {
  resetState();
  ipWhitelisted = true;
  checkRateLimitImpl = async () => {
    throw new Error('checkRateLimit should not be called for whitelisted IPs');
  };

  const { enforceRouteRateLimit } = await loadModule('whitelisted');
  const response = await enforceRouteRateLimit({
    request: makeRequest(),
    action: 'SIGNUP',
    extraKeyPart: 'user@example.com',
  });

  assert.equal(response, null);
  assert.equal(checkRateLimitCalls.length, 0);
});

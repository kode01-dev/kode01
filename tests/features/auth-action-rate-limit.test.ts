import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, mock, test } from 'node:test';

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

type AuthUser = {
  id: string;
  email?: string;
} | null;

const checkRateLimitCalls: CheckRateLimitInput[] = [];
const signInCalls: unknown[] = [];
const signUpCalls: unknown[] = [];
const updateUserCalls: unknown[] = [];

let currentHeaders = new Headers({ 'user-agent': 'test-agent' });
let currentUser: AuthUser = null;
let checkRateLimitImpl: (input: CheckRateLimitInput) => Promise<CheckRateLimitResult> = async (input) => ({
  action: input.action,
  key: input.key,
  allowed: true,
  limit: 5,
  remaining: 4,
  requestCount: 1,
  resetAt: '2099-01-01T00:00:00.000Z',
  degraded: false,
});

mock.module('server-only', {
  defaultExport: {},
});

mock.module('next/headers', {
  namedExports: {
    headers: async () => currentHeaders,
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromHeaders: () => ({
      path: '/auth',
      ipAddress: null,
      userAgent: 'test-agent',
    }),
    logAuditEvent: async () => {},
  },
});

mock.module('@/features/site-lockscreen/lib/lockscreen-server', {
  namedExports: {
    getPrelaunchAuthAccessState: async () => ({
      enabled: false,
      locked: false,
      unlocked: true,
    }),
  },
});

mock.module('@/lib/security/rate-limiter', {
  namedExports: {
    checkRateLimit: async (input: CheckRateLimitInput) => {
      checkRateLimitCalls.push(input);
      return checkRateLimitImpl(input);
    },
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: {
        signInWithPassword: async (payload: unknown) => {
          signInCalls.push(payload);
          return { data: null, error: { message: 'invalid login credentials' } };
        },
        signUp: async (payload: unknown) => {
          signUpCalls.push(payload);
          return { data: null, error: { message: 'signup disabled' } };
        },
        getUser: async () => ({ data: { user: currentUser } }),
        getSession: async () => ({ data: { session: null } }),
        updateUser: async (payload: unknown) => {
          updateUserCalls.push(payload);
          return { data: null, error: null };
        },
      },
    }),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
              range: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        insert: async () => ({ error: null }),
        delete: () => ({
          in: async () => ({ error: null }),
        }),
      }),
    }),
  },
});

mock.module('@/lib/auth/admin-role', {
  namedExports: {
    getUserRoleWithAdminFallback: async () => ({
      resolved: false,
      role: null,
    }),
  },
});

mock.module('@/lib/auth/mfa', {
  namedExports: {
    hasVerifiedMfaMethod: () => false,
    isAal2: () => false,
  },
});

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function allowedResult(input: CheckRateLimitInput, requestCount = 1): CheckRateLimitResult {
  return {
    action: input.action,
    key: input.key,
    allowed: true,
    limit: 5,
    remaining: Math.max(0, 5 - requestCount),
    requestCount,
    resetAt: '2099-01-01T00:00:00.000Z',
    degraded: false,
  };
}

function blockedResult(input: CheckRateLimitInput, requestCount = 5): CheckRateLimitResult {
  return {
    ...allowedResult(input, requestCount),
    allowed: false,
    remaining: 0,
  };
}

async function loadAuthActions(scenario: string) {
  return import(`../../src/features/auth/actions/auth-actions.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

beforeEach(() => {
  checkRateLimitCalls.length = 0;
  signInCalls.length = 0;
  signUpCalls.length = 0;
  updateUserCalls.length = 0;
  currentHeaders = new Headers({ 'user-agent': 'test-agent' });
  currentUser = null;
  checkRateLimitImpl = async (input) => allowedResult(input);
});

test('loginAction isolates no-IP rate limits by normalized hashed email', async () => {
  const { loginAction } = await loadAuthActions('login-email-isolation');

  await loginAction({ email: 'first@example.com', password: 'Valid123!' });
  await loginAction({ email: 'second@example.com', password: 'Valid123!' });

  assert.equal(checkRateLimitCalls.length, 2);
  assert.equal(checkRateLimitCalls[0]?.key, `rate-limit:login:email:${hashIdentifier('first@example.com')}`);
  assert.equal(checkRateLimitCalls[1]?.key, `rate-limit:login:email:${hashIdentifier('second@example.com')}`);
  assert.notEqual(checkRateLimitCalls[0]?.key, checkRateLimitCalls[1]?.key);
  assert.equal(checkRateLimitCalls.some((call) => call.key.includes('unknown')), false);
});

test('loginAction blocks repeated attempts against the same normalized email bucket', async () => {
  const countsByKey = new Map<string, number>();
  checkRateLimitImpl = async (input) => {
    const nextCount = (countsByKey.get(input.key) ?? 0) + 1;
    countsByKey.set(input.key, nextCount);
    return nextCount <= 5 ? allowedResult(input, nextCount) : blockedResult(input, nextCount);
  };

  const { loginAction } = await loadAuthActions('login-email-limited');
  let latestResult: Awaited<ReturnType<typeof loginAction>> | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    latestResult = await loginAction({ email: 'User@Example.com', password: 'Valid123!' });
  }

  assert.deepEqual(latestResult, { error: 'RATE_LIMITED' });
  assert.equal(checkRateLimitCalls.length, 6);
  assert.equal(new Set(checkRateLimitCalls.map((call) => call.key)).size, 1);
  assert.equal(checkRateLimitCalls[0]?.key, `rate-limit:login:email:${hashIdentifier('user@example.com')}`);
  assert.equal(signInCalls.length, 5);
});

test('updatePasswordAction uses the authenticated user id instead of an unknown IP bucket', async () => {
  currentUser = { id: 'user-123', email: 'user@example.com' };
  checkRateLimitImpl = async (input) => blockedResult(input, 3);

  const { updatePasswordAction } = await loadAuthActions('password-change-user-key');
  const result = await updatePasswordAction({
    password: 'Valid123!',
    confirmPassword: 'Valid123!',
  });

  assert.deepEqual(result, { error: 'RATE_LIMITED' });
  assert.equal(checkRateLimitCalls.length, 1);
  assert.equal(checkRateLimitCalls[0]?.key, 'rate-limit:password_change:user:user-123');
  assert.equal(checkRateLimitCalls[0]?.key.includes('unknown'), false);
  assert.equal(updateUserCalls.length, 0);
});

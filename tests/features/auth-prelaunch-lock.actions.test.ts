import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let prelaunchAccessState: { enabled: boolean; locked: boolean; unlocked: boolean } = {
  enabled: false,
  locked: false,
  unlocked: true,
};
let createClientCallCount = 0;

mock.module('next/headers', {
  namedExports: {
    headers: async () => ({
      get: (_name: string) => {
        void _name;
        return null;
      },
    }),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromHeaders: () => ({
      path: '/auth',
      ipAddress: null,
      userAgent: null,
    }),
    logAuditEvent: async () => {},
  },
});

mock.module('@/features/site-lockscreen/lib/lockscreen-server', {
  namedExports: {
    getPrelaunchAuthAccessState: async () => prelaunchAccessState,
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => 'http://localhost:3000',
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => {
      createClientCallCount += 1;
      return {
        auth: {
          signInWithPassword: async () => ({
            data: null,
            error: { message: 'invalid login credentials' },
          }),
          signUp: async () => ({
            data: null,
            error: { message: 'signup disabled' },
          }),
          getUser: async () => ({ data: { user: null } }),
          getSession: async () => ({ data: { session: null } }),
        },
      };
    },
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

async function loadAuthActions(scenario: string) {
  return import(`../../src/features/auth/actions/auth-actions.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('loginAction returns AUTH_PRELAUNCH_LOCKED when auth gate is enabled and locked', async () => {
  prelaunchAccessState = { enabled: true, locked: true, unlocked: false };
  createClientCallCount = 0;
  const authActions = await loadAuthActions('login-locked');

  const result = await authActions.loginAction({
    email: 'user@example.com',
    password: 'Valid123!',
  });

  assert.deepEqual(result, { error: 'AUTH_PRELAUNCH_LOCKED' });
  assert.equal(createClientCallCount, 0);
});

test('signupAction returns AUTH_PRELAUNCH_LOCKED when auth gate is enabled and locked', async () => {
  prelaunchAccessState = { enabled: true, locked: true, unlocked: false };
  createClientCallCount = 0;
  const authActions = await loadAuthActions('signup-locked');

  const result = await authActions.signupAction({
    email: 'new-user@example.com',
    password: 'Valid123!',
    displayName: 'New User',
    dateOfBirth: '1990-01-01',
    acceptLegal: true,
  });

  assert.deepEqual(result, { error: 'AUTH_PRELAUNCH_LOCKED' });
  assert.equal(createClientCallCount, 0);
});

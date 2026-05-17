import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import bcrypt from 'bcryptjs';

type RateLimitInput = {
  action: string;
  key: string;
};

type AuditEvent = {
  eventType: string;
  metadata?: Record<string, unknown>;
};

type PasswordHistoryRow = {
  id: string;
  password_hash: string;
};

type PasswordHistoryIdRow = {
  id: string;
};

const rateLimitCalls: RateLimitInput[] = [];
const resetPasswordCalls: Array<{ email: string; options: { redirectTo?: string } }> = [];
const updateUserCalls: Array<{ password?: string }> = [];
const insertedPasswordHistory: Array<{ user_id: string; password_hash: string }> = [];
const auditEvents: AuditEvent[] = [];
const trimRangeCalls: Array<{ from: number; to: number }> = [];
const deletedPasswordHistoryIdBatches: string[][] = [];

let rateLimitAllowed = true;
let resetPasswordError: { message: string } | null = null;
let currentUser: { id: string; email?: string } | null = { id: 'user-1', email: 'User@Example.com' };
let passwordHistoryRows: PasswordHistoryRow[] = [];
let trimStalePasswordHistoryRows: PasswordHistoryIdRow[] = [];

mock.module('next/headers', {
  namedExports: {
    headers: async () => ({
      get: (name: string) => {
        const normalized = name.toLowerCase();
        if (normalized === 'user-agent') return 'Mozilla/5.0';
        if (normalized === 'x-forwarded-for') return '198.51.100.77';
        return null;
      },
    }),
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => 'https://kode01.test',
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromHeaders: () => ({
      path: '/auth/password-reset',
      ipAddress: '198.51.100.77',
      userAgent: 'Mozilla/5.0',
    }),
    logAuditEvent: async (event: AuditEvent) => {
      auditEvents.push(event);
    },
  },
});

mock.module('@/lib/security/rate-limiter', {
  namedExports: {
    checkRateLimit: async (input: RateLimitInput) => {
      rateLimitCalls.push(input);
      return {
        action: input.action,
        key: input.key,
        allowed: rateLimitAllowed,
        limit: 3,
        remaining: rateLimitAllowed ? 2 : 0,
        requestCount: rateLimitAllowed ? 1 : 3,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
        degraded: false,
      };
    },
  },
});

mock.module('@/features/site-lockscreen/lib/lockscreen-server', {
  namedExports: {
    getPrelaunchAuthAccessState: async () => ({ enabled: false, locked: false, unlocked: true }),
  },
});

mock.module('@/lib/auth/admin-role', {
  namedExports: {
    getUserRoleWithAdminFallback: async () => ({ resolved: false, role: null }),
  },
});

mock.module('@/lib/auth/mfa', {
  namedExports: {
    hasVerifiedMfaMethod: () => false,
    isAal2: () => false,
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: {
        resetPasswordForEmail: async (email: string, options: { redirectTo?: string }) => {
          resetPasswordCalls.push({ email, options });
          return { data: {}, error: resetPasswordError };
        },
        getUser: async () => ({ data: { user: currentUser } }),
        updateUser: async (attributes: { password?: string }) => {
          updateUserCalls.push(attributes);
          return { data: { user: currentUser }, error: null };
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
              limit: async () => ({ data: passwordHistoryRows, error: null }),
              range: async (from: number, to: number) => {
                trimRangeCalls.push({ from, to });
                return { data: trimStalePasswordHistoryRows.slice(0, to - from + 1), error: null };
              },
            }),
          }),
        }),
        insert: async (row: { user_id: string; password_hash: string }) => {
          insertedPasswordHistory.push(row);
          return { error: null };
        },
        delete: () => ({
          in: async (_column: string, ids: string[]) => {
            deletedPasswordHistoryIdBatches.push(ids);
            return { error: null };
          },
        }),
      }),
    }),
  },
});

async function loadAuthActions(scenario: string) {
  return import(`../../src/features/auth/actions/auth-actions.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

function resetState() {
  rateLimitCalls.length = 0;
  resetPasswordCalls.length = 0;
  updateUserCalls.length = 0;
  insertedPasswordHistory.length = 0;
  auditEvents.length = 0;
  trimRangeCalls.length = 0;
  deletedPasswordHistoryIdBatches.length = 0;
  rateLimitAllowed = true;
  resetPasswordError = null;
  currentUser = { id: 'user-1', email: 'User@Example.com' };
  passwordHistoryRows = [];
  trimStalePasswordHistoryRows = [];
}

test('requestPasswordResetAction sends a neutral reset email response with a localized recovery redirect', async () => {
  resetState();
  const { requestPasswordResetAction } = await loadAuthActions('request-success');

  const result = await requestPasswordResetAction({
    email: 'USER@Example.com',
    locale: 'fr',
  });

  assert.deepEqual(result, { success: true });
  assert.equal(resetPasswordCalls.length, 1);
  assert.equal(resetPasswordCalls[0]?.email, 'user@example.com');
  assert.equal(
    resetPasswordCalls[0]?.options.redirectTo,
    'https://kode01.test/fr/auth/confirm?next=%2Ffr%2Fauth%2Freset-password',
  );
  assert.equal(rateLimitCalls.length, 1);
  assert.equal(rateLimitCalls[0]?.action, 'PASSWORD_RESET');
  assert.match(rateLimitCalls[0]?.key ?? '', /^rate-limit:password_reset:email:[a-f0-9]{64}:ip:198\.51\.100\.77$/);
  assert.doesNotMatch(rateLimitCalls[0]?.key ?? '', /user@example\.com/);
  assert.equal(auditEvents.at(-1)?.eventType, 'auth.password_reset.requested');
});

test('requestPasswordResetAction keeps the same neutral response when Supabase rejects the email send', async () => {
  resetState();
  resetPasswordError = { message: 'Email address not authorized' };
  const { requestPasswordResetAction } = await loadAuthActions('request-provider-error');

  const result = await requestPasswordResetAction({
    email: 'missing@example.com',
    locale: 'en',
  });

  assert.deepEqual(result, { success: true });
  assert.equal(auditEvents.at(-1)?.eventType, 'auth.password_reset.request.failed');
});

test('requestPasswordResetAction rate limits before calling Supabase', async () => {
  resetState();
  rateLimitAllowed = false;
  const { requestPasswordResetAction } = await loadAuthActions('request-rate-limited');

  const result = await requestPasswordResetAction({
    email: 'user@example.com',
    locale: 'en',
  });

  assert.deepEqual(result, { error: 'RATE_LIMITED' });
  assert.equal(resetPasswordCalls.length, 0);
  assert.equal(auditEvents.at(-1)?.eventType, 'auth.password_reset.request.rate_limited');
});

test('completePasswordResetAction rejects weak or mismatched passwords before updating Supabase', async () => {
  resetState();
  const { completePasswordResetAction } = await loadAuthActions('complete-invalid');

  const weak = await completePasswordResetAction({
    password: 'weak',
    confirmPassword: 'weak',
  });
  const mismatch = await completePasswordResetAction({
    password: 'Valid123!',
    confirmPassword: 'Valid123?',
  });

  assert.match(weak.error, /Password must be at least 8 characters/);
  assert.match(mismatch.error, /Passwords do not match/);
  assert.equal(updateUserCalls.length, 0);
});

test('completePasswordResetAction rejects recently reused passwords', async () => {
  resetState();
  passwordHistoryRows = [
    {
      id: 'history-1',
      password_hash: await bcrypt.hash('Valid123!', 12),
    },
  ];
  const { completePasswordResetAction } = await loadAuthActions('complete-reused');

  const result = await completePasswordResetAction({
    password: 'Valid123!',
    confirmPassword: 'Valid123!',
  });

  assert.match(result.error, /last 5 passwords/);
  assert.equal(updateUserCalls.length, 0);
  assert.equal(auditEvents.at(-1)?.eventType, 'auth.password.history.rejected');
});

test('completePasswordResetAction trims stale password history with one read and chunked deletes', async () => {
  resetState();
  trimStalePasswordHistoryRows = Array.from({ length: 450 }, (_, index) => ({
    id: `stale-history-${index}`,
  }));
  const { completePasswordResetAction } = await loadAuthActions('complete-trims-history');

  const result = await completePasswordResetAction({
    password: 'Valid123!',
    confirmPassword: 'Valid123!',
  });

  assert.deepEqual(result, { success: true });
  assert.equal(updateUserCalls.length, 1);
  assert.equal(insertedPasswordHistory.length, 1);
  assert.deepEqual(trimRangeCalls, [{ from: 5, to: 4004 }]);
  assert.deepEqual(deletedPasswordHistoryIdBatches.map((ids) => ids.length), [200, 200, 50]);

  const deletedIds = deletedPasswordHistoryIdBatches.flat();
  assert.equal(deletedIds.length, 450);
  assert.equal(new Set(deletedIds).size, 450);
  assert.equal(deletedIds[0], 'stale-history-0');
  assert.equal(deletedIds.at(-1), 'stale-history-449');
});

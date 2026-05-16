import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchAuthUsersById, type AdminUsersAuthClient, type AuthUserLike } from '@/app/api/admin/users/auth-hydration';

function createMockAdminClient(args: {
  authUsers: AuthUserLike[];
  listUsersShouldFail?: boolean;
}) {
  let listUsersCalls = 0;
  let getUserByIdCalls = 0;

  const admin: AdminUsersAuthClient = {
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          listUsersCalls += 1;
          if (args.listUsersShouldFail) {
            return {
              data: { users: [] },
              error: { message: 'list users failed' },
            };
          }

          const start = (page - 1) * perPage;
          const end = start + perPage;
          return {
            data: { users: args.authUsers.slice(start, end) },
            error: null,
          };
        },
        getUserById: async (uid) => {
          getUserByIdCalls += 1;
          const user = args.authUsers.find((candidate) => candidate.id === uid) ?? null;
          return { data: { user } };
        },
      },
    },
  };

  return {
    admin,
    getMetrics() {
      return { listUsersCalls, getUserByIdCalls };
    },
  };
}

test('fetchAuthUsersById uses paginated listUsers and avoids per-user fetches', async () => {
  const authUsers = Array.from({ length: 120 }, (_, index) => ({
    id: `user-${index}`,
    email: `user-${index}@example.com`,
    banned_until: null,
    last_sign_in_at: null,
  }));

  const { admin, getMetrics } = createMockAdminClient({ authUsers });
  const profileIds = authUsers.map((user) => user.id);
  const authUsersById = await fetchAuthUsersById({
    admin,
    profileIds,
    listUsersPageSize: 50,
  });

  assert.equal(authUsersById.size, 120);
  assert.equal(authUsersById.get('user-10')?.email, 'user-10@example.com');
  const metrics = getMetrics();
  assert.equal(metrics.listUsersCalls, 3);
  assert.equal(metrics.getUserByIdCalls, 0);
});

test('fetchAuthUsersById falls back to per-user strategy when listUsers fails', async () => {
  const authUsers = Array.from({ length: 40 }, (_, index) => ({
    id: `user-${index}`,
    email: `user-${index}@example.com`,
    banned_until: null,
    last_sign_in_at: null,
  }));

  const { admin, getMetrics } = createMockAdminClient({
    authUsers,
    listUsersShouldFail: true,
  });

  const profileIds = authUsers.map((user) => user.id);
  const authUsersById = await fetchAuthUsersById({
    admin,
    profileIds,
    getUserByIdBatchSize: 10,
  });

  assert.equal(authUsersById.size, 40);
  assert.equal(authUsersById.get('user-25')?.email, 'user-25@example.com');
  const metrics = getMetrics();
  assert.equal(metrics.listUsersCalls, 1);
  assert.equal(metrics.getUserByIdCalls, 40);
});

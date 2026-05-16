import { performance } from 'node:perf_hooks';
import { fetchAuthUsersById, type AdminUsersAuthClient, type AuthUserLike } from '../../src/app/api/admin/users/auth-hydration';

const PROFILE_COUNT = 1000;
const AUTH_FETCH_BATCH_SIZE = 25;
const LIST_USERS_PAGE_SIZE = 500;
const NETWORK_DELAY_MS = 4;
const ITERATIONS = 10;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function createFixture() {
  const profileIds = Array.from({ length: PROFILE_COUNT }, (_, index) => `user-${index}`);
  const authUsers: AuthUserLike[] = profileIds.map((id) => ({
    id,
    email: `${id}@example.com`,
    banned_until: null,
    last_sign_in_at: null,
  }));

  return { profileIds, authUsers };
}

function createMockAdminClient(authUsers: AuthUserLike[]) {
  let getUserByIdCalls = 0;
  let listUsersCalls = 0;

  const admin: AdminUsersAuthClient = {
    auth: {
      admin: {
        getUserById: async (uid: string) => {
          getUserByIdCalls += 1;
          await delay(NETWORK_DELAY_MS);
          return { data: { user: authUsers.find((user) => user.id === uid) ?? null } };
        },
        listUsers: async ({ page, perPage }) => {
          listUsersCalls += 1;
          await delay(NETWORK_DELAY_MS);
          const start = (page - 1) * perPage;
          const end = start + perPage;

          return {
            data: { users: authUsers.slice(start, end) },
            error: null,
          };
        },
      },
    },
  };

  return {
    admin,
    metrics() {
      return { getUserByIdCalls, listUsersCalls };
    },
  };
}

async function hydrateWithLegacyPerUserFetch(args: {
  admin: AdminUsersAuthClient;
  profileIds: string[];
}) {
  for (let index = 0; index < args.profileIds.length; index += AUTH_FETCH_BATCH_SIZE) {
    const chunkIds = args.profileIds.slice(index, index + AUTH_FETCH_BATCH_SIZE);
    await Promise.all(chunkIds.map((profileId) => args.admin.auth.admin.getUserById(profileId)));
  }
}

async function runCase(args: {
  name: string;
  execute: (admin: AdminUsersAuthClient, profileIds: string[]) => Promise<void>;
}) {
  const { profileIds, authUsers } = createFixture();
  const durationsMs: number[] = [];
  let finalMetrics: { getUserByIdCalls: number; listUsersCalls: number } | null = null;

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const { admin, metrics } = createMockAdminClient(authUsers);
    const startedAt = performance.now();
    await args.execute(admin, profileIds);
    durationsMs.push(performance.now() - startedAt);
    finalMetrics = metrics();
  }

  const averageMs = durationsMs.reduce((total, value) => total + value, 0) / durationsMs.length;
  return {
    name: args.name,
    avgMs: Number(averageMs.toFixed(2)),
    minMs: Number(Math.min(...durationsMs).toFixed(2)),
    maxMs: Number(Math.max(...durationsMs).toFixed(2)),
    getUserByIdCalls: finalMetrics?.getUserByIdCalls ?? 0,
    listUsersCalls: finalMetrics?.listUsersCalls ?? 0,
  };
}

async function main() {
  const baseline = await runCase({
    name: 'baseline_n_plus_1_getUserById',
    execute: async (admin, profileIds) => {
      await hydrateWithLegacyPerUserFetch({ admin, profileIds });
    },
  });

  const optimized = await runCase({
    name: 'optimized_listUsers_join',
    execute: async (admin, profileIds) => {
      await fetchAuthUsersById({
        admin,
        profileIds,
        listUsersPageSize: LIST_USERS_PAGE_SIZE,
        getUserByIdBatchSize: AUTH_FETCH_BATCH_SIZE,
      });
    },
  });

  const improvementMs = baseline.avgMs - optimized.avgMs;
  const improvementPct = (improvementMs / baseline.avgMs) * 100;

  console.log(JSON.stringify(baseline));
  console.log(JSON.stringify(optimized));
  console.log(
    JSON.stringify({
      name: 'delta',
      improvementMs: Number(improvementMs.toFixed(2)),
      improvementPct: Number(improvementPct.toFixed(2)),
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let getAdminSessionImpl: () => Promise<{ userId: string; admin: { from: (table: string) => unknown } } | null> = async () => null;
const revalidateEditorialContentMock = mock.fn(() => undefined);

mock.module('@/app/api/admin/editorial/_lib', {
  namedExports: {
    getEditorialAdminSessionOrNull: async () => getAdminSessionImpl(),
  },
});

mock.module('@/lib/cache/revalidate', {
  namedExports: {
    revalidateEditorialContent: () => revalidateEditorialContentMock(),
  },
});

mock.module('@/features/editorial/server/sponsored-schedule', {
  namedExports: {
    computeNextSponsoredPublishAt: () => '2026-03-20T13:00:00.000Z',
  },
});

async function loadApproveRoute(scenario: string) {
  return import(`../../src/app/api/admin/editorial/sponsored/[translationGroupId]/approve/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

async function loadRejectRoute(scenario: string) {
  return import(`../../src/app/api/admin/editorial/sponsored/[translationGroupId]/reject/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('POST /api/admin/editorial/sponsored/[translationGroupId]/approve returns 403 without admin session', async () => {
  getAdminSessionImpl = async () => null;
  const routeModule = await loadApproveRoute('approve-forbidden');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/editorial/sponsored/group-1/approve', { method: 'POST' }),
    { params: Promise.resolve({ translationGroupId: 'group-1' }) },
  );

  assert.equal(response.status, 403);
});

test('POST /api/admin/editorial/sponsored/[translationGroupId]/approve publishes sponsored group at next scheduled slot', async () => {
  revalidateEditorialContentMock.mock.resetCalls();
  const updatePayload: {
    status?: string;
    sponsorship_status?: string;
    published_at?: string;
  } = {};

  getAdminSessionImpl = async () => ({
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    admin: {
      from: (table: string) => {
        assert.equal(table, 'editorial_posts');
        return {
          select: () => ({
            eq: async () => ({
              data: [
                { id: '1', status: 'draft', sponsorship_status: 'pending_review', is_sponsored: true },
                { id: '2', status: 'draft', sponsorship_status: 'pending_review', is_sponsored: true },
              ],
              error: null,
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            Object.assign(updatePayload, payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      },
    },
  });

  const routeModule = await loadApproveRoute('approve-success');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/editorial/sponsored/group-1/approve', { method: 'POST' }),
    { params: Promise.resolve({ translationGroupId: 'group-1' }) },
  );

  assert.equal(response.status, 200);
  assert.equal(updatePayload.status, 'published');
  assert.equal(updatePayload.sponsorship_status, 'approved');
  assert.equal(updatePayload.published_at, '2026-03-20T13:00:00.000Z');
  assert.equal(revalidateEditorialContentMock.mock.callCount(), 1);
});

test('POST /api/admin/editorial/sponsored/[translationGroupId]/reject validates reason payload', async () => {
  getAdminSessionImpl = async () => ({
    userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    admin: {
      from: () => ({
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    },
  });

  const routeModule = await loadRejectRoute('reject-invalid');
  const response = await routeModule.POST(
    new Request('http://localhost/api/admin/editorial/sponsored/group-1/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '' }),
    }),
    { params: Promise.resolve({ translationGroupId: 'group-1' }) },
  );

  assert.equal(response.status, 400);
});

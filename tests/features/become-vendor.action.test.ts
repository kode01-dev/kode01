import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type UserLike = { id: string } | null;

type ProfileLike = {
  role: string;
} | null;

let currentUser: UserLike = null;
let currentProfile: ProfileLike = null;
let adminUpdatePayload: Record<string, unknown> | null = null;

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
      path: '/buyer/become-vendor',
      ipAddress: null,
      userAgent: null,
    }),
    logAuditEvent: async () => {},
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: currentUser } }),
      },
      from: (table: string) => {
        if (table === 'restricted_shop_names') {
          return {
            select: async () => ({ data: [], error: null }),
          };
        }
        if (table !== 'profiles') throw new Error(`Unexpected table ${table}`);
        const query = {
          select: () => query,
          eq: () => query,
          single: async () => ({ data: currentProfile, error: null }),
        };
        return query;
      },
    }),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => ({
      from: (table: string) => {
        if (table !== 'profiles') throw new Error(`Unexpected table ${table}`);
        return {
          update: (payload: Record<string, unknown>) => {
            adminUpdatePayload = payload;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    }),
  },
});

async function loadModule(scenario: string) {
  return import(`../../src/features/dashboard/actions/vendor-actions.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('becomeVendor validates missing country', async () => {
  const vendorActions = await loadModule('validation-missing-country');
  const result = await vendorActions.becomeVendor({ shopName: 'My Shop' } as never);

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'validation');
  }
});

test('becomeVendor rejects unsupported country', async () => {
  const vendorActions = await loadModule('country-unsupported');
  const result = await vendorActions.becomeVendor({ shopName: 'My Shop', country: 'ZZ' });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'country_unsupported');
  }
});

test('becomeVendor updates role, shop name and country on success', async () => {
  currentUser = { id: '33333333-3333-4333-8333-333333333333' };
  currentProfile = { role: 'buyer' };
  adminUpdatePayload = null;

  const vendorActions = await loadModule('become-vendor-success');
  const result = await vendorActions.becomeVendor({ shopName: 'My Shop', country: 'CA' });

  assert.equal(result.success, true);
  assert.deepEqual(adminUpdatePayload, {
    role: 'seller',
    shop_name: 'My Shop',
    country: 'CA',
  });
});

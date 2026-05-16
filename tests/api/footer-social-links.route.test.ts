import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type AssuranceData = {
  currentLevel: string | null;
  currentAuthenticationMethods: unknown;
} | null;

const state: {
  userId: string | null;
  role: string | null;
  accessToken: string | null;
  assurance: AssuranceData;
  assuranceError: { message: string } | null;
  updatedLinks: unknown;
} = {
  userId: null,
  role: null,
  accessToken: null,
  assurance: null,
  assuranceError: null,
  updatedLinks: null,
};

mock.module('@/features/footer-social-links/api', {
  namedExports: {
    getEnabledSocialLinks: async () => [],
    updateSocialLinks: async (links: unknown) => {
      state.updatedLinks = links;
    },
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => ({
      auth: {
        getUser: async () => ({
          data: {
            user: state.userId ? { id: state.userId } : null,
          },
        }),
        getSession: async () => ({
          data: {
            session: state.accessToken ? { access_token: state.accessToken } : null,
          },
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: state.assurance,
            error: state.assuranceError,
          }),
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.role ? { role: state.role } : null,
            }),
          }),
        }),
      }),
    }),
  },
});

async function loadPatchHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/footer-social-links/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.PATCH ?? routeModule.default?.PATCH;
}

const validPatchPayload = {
  links: [
    {
      platform: 'x',
      label_en: 'X',
      label_fr: 'X',
      url: 'https://x.com/kode01',
      icon: 'x',
      order_index: 0,
      is_enabled: true,
    },
  ],
};

test('footer social links PATCH requires MFA for admin sessions', async () => {
  state.userId = 'admin-user-id';
  state.role = 'admin';
  state.accessToken = 'access-token';
  state.assurance = {
    currentLevel: 'aal1',
    currentAuthenticationMethods: [{ method: 'password' }],
  };
  state.assuranceError = null;
  state.updatedLinks = null;

  const PATCH = await loadPatchHandler('mfa-required');
  const response = await PATCH(
    new Request('https://example.com/api/footer-social-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPatchPayload),
    }),
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, 'MFA_REQUIRED');
  assert.equal(state.updatedLinks, null);
});

test('footer social links PATCH succeeds for MFA-verified admin sessions', async () => {
  state.userId = 'admin-user-id';
  state.role = 'admin';
  state.accessToken = 'access-token';
  state.assurance = {
    currentLevel: 'aal2',
    currentAuthenticationMethods: [{ method: 'password' }, { method: 'totp' }],
  };
  state.assuranceError = null;
  state.updatedLinks = null;

  const PATCH = await loadPatchHandler('mfa-verified');
  const response = await PATCH(
    new Request('https://example.com/api/footer-social-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPatchPayload),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(state.updatedLinks, validPatchPayload.links);
});

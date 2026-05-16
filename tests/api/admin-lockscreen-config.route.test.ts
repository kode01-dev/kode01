import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type MockSession = {
  userId: string;
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
};

let getAdminSessionOrNullImpl: () => Promise<MockSession | null> = async () => null;
let selectedColumnsValue = '';

mock.module('@/app/api/admin/controllers/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionOrNullImpl(),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/admin/lockscreen/config/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET ?? routeModule.default?.GET;
}

test('admin lockscreen config does not select or return password hash', async () => {
  selectedColumnsValue = '';
  getAdminSessionOrNullImpl = async () => ({
    userId: 'admin-user-id',
    supabase: {
      from: (table: string) => {
        assert.equal(table, 'site_lockscreen_config');
        return {
          select: (columns: string) => {
            selectedColumnsValue = columns;
            return {
              single: async () => ({
                data: {
                  id: 'cfg-1',
                  is_enabled: true,
                  auth_gate_enabled: true,
                  title_en: 'Protected',
                  title_fr: 'Protege',
                  message_en: 'Message',
                  message_fr: 'Message',
                  newsletter_enabled: false,
                  newsletter_title_en: 'N',
                  newsletter_title_fr: 'N',
                  newsletter_cta_en: 'Join',
                  newsletter_cta_fr: 'Join',
                  created_at: '2026-01-01T00:00:00.000Z',
                  updated_at: '2026-01-01T00:00:00.000Z',
                  updated_by: null,
                },
                error: null,
              }),
            };
          },
        };
      },
    },
  });

  const GET = await loadGetHandler('admin-lockscreen-config');
  const response = await GET();

  assert.equal(response.status, 200);
  assert.equal(selectedColumnsValue.includes('password_hash'), false);
  assert.equal(selectedColumnsValue.includes('auth_gate_enabled'), true);
  const body = await response.json();
  assert.equal('password_hash' in body.config, false);
  assert.equal(body.config.id, 'cfg-1');
  assert.equal(body.config.auth_gate_enabled, true);
});

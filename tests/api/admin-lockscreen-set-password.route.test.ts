import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type Session = {
  userId: string;
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (value: number) => {
            maybeSingle: () => Promise<{ data: { id: string } | null }>;
          };
        };
      };
      update: (payload: { password_hash: string; updated_by: string }) => {
        eq: (
          column: string,
          id: string
        ) => Promise<{ error: { message: string; details?: string } | null }>;
      };
    };
  };
};

let getAdminSessionOrNullImpl: () => Promise<Session | null> = async () => null;
let hashPasswordImpl = async (password: string) => `hashed:${password}`;
let revalidateTagCalls = 0;
let capturedUpdatePayload: { password_hash: string; updated_by: string } | null =
  null;
let capturedConsoleErrorArgs: unknown[][] = [];

mock.module('@/app/api/admin/controllers/_lib', {
  namedExports: {
    getAdminSessionOrNull: async () => getAdminSessionOrNullImpl(),
  },
});

mock.module('@/features/site-lockscreen/lib/lockscreen-server', {
  namedExports: {
    hashPassword: async (password: string) => hashPasswordImpl(password),
  },
});

mock.module('next/cache', {
  namedExports: {
    revalidateTag: () => {
      revalidateTagCalls += 1;
    },
  },
});

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/admin/lockscreen/set-password/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST ?? routeModule.default?.POST;
}

test('set-password route does not log raw DB error objects on update failure', async () => {
  revalidateTagCalls = 0;
  capturedUpdatePayload = null;
  capturedConsoleErrorArgs = [];

  const secret = 'super-secret-password';

  getAdminSessionOrNullImpl = async () => ({
    userId: 'admin-user',
    supabase: {
      from: (table: string) => {
        assert.equal(table, 'site_lockscreen_config');
        return {
          select: (columns: string) => {
            assert.equal(columns, 'id');
            return {
              order: (column: string, options: { ascending: boolean }) => {
                assert.equal(column, 'updated_at');
                assert.equal(options.ascending, false);
                return {
                  limit: (value: number) => {
                    assert.equal(value, 1);
                    return {
                      maybeSingle: async () => ({ data: { id: 'cfg-1' } }),
                    };
                  },
                };
              },
            };
          },
          update: (payload: { password_hash: string; updated_by: string }) => {
            capturedUpdatePayload = payload;
            return {
              eq: async (column: string, id: string) => {
                assert.equal(column, 'id');
                assert.equal(id, 'cfg-1');
                return {
                  error: {
                    message: `db failed while handling ${secret}`,
                    details: secret,
                  },
                };
              },
            };
          },
        };
      },
    },
  });

  hashPasswordImpl = async () => 'hashed-password';

  const consoleErrorMock = mock.method(console, 'error', (...args: unknown[]) => {
    capturedConsoleErrorArgs.push(args);
  });

  try {
    const POST = await loadPostHandler('lockscreen-set-password-error-log-redaction');
    const request = new Request('http://localhost/api/admin/lockscreen/set-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: secret }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: 'Failed to update password' });
    assert.deepEqual(capturedUpdatePayload, {
      password_hash: 'hashed-password',
      updated_by: 'admin-user',
    });
    assert.equal(revalidateTagCalls, 0);
    assert.equal(capturedConsoleErrorArgs.length, 1);
    assert.deepEqual(capturedConsoleErrorArgs[0], [
      'Error updating lockscreen password',
    ]);
    assert.equal(JSON.stringify(capturedConsoleErrorArgs).includes(secret), false);
  } finally {
    consoleErrorMock.mock.restore();
  }
});

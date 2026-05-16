import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const leakedToken =
  'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.s3cr3t-signature-value';

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};

const auditEvents: Array<Record<string, unknown>> = [];
const capturedConsoleErrorArgs: unknown[][] = [];
const originalZipchatPrivateKey = process.env.ZIPCHAT_JWT_PRIVATE_KEY;

test.beforeEach(() => {
  process.env.ZIPCHAT_JWT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----';
});

test.after(() => {
  if (originalZipchatPrivateKey === undefined) {
    delete process.env.ZIPCHAT_JWT_PRIVATE_KEY;
  } else {
    process.env.ZIPCHAT_JWT_PRIVATE_KEY = originalZipchatPrivateKey;
  }
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/zipchat/identify',
      ipAddress: '127.0.0.1',
      userAgent: 'unit-test',
    }),
    logAuditEvent: async (input: Record<string, unknown>) => {
      auditEvents.push(input);
    },
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/zipchat/identify/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET ?? routeModule.default?.GET;
}

test('disables zipchat identify without touching Supabase when private key is not configured', async () => {
  delete process.env.ZIPCHAT_JWT_PRIVATE_KEY;
  createClientImpl = async () => {
    throw new Error('Supabase should not be initialized when Zipchat is disabled');
  };

  const GET = await loadGetHandler('zipchat-identify-disabled');
  const response = await GET(new Request('http://localhost/api/zipchat/identify'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { token: null, disabled: true });
});

test('sanitizes token-like values in zipchat identify error logging', async () => {
  auditEvents.length = 0;
  capturedConsoleErrorArgs.length = 0;

  createClientImpl = async () => {
    throw new Error(`zipchat identify failed while processing token=${leakedToken}`);
  };

  const consoleErrorMock = mock.method(console, 'error', (...args: unknown[]) => {
    capturedConsoleErrorArgs.push(args);
  });

  try {
    const GET = await loadGetHandler('zipchat-identify-redaction');
    const response = await GET(new Request('http://localhost/api/zipchat/identify'));
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.deepEqual(body, { error: 'Internal Server Error' });

    assert.equal(capturedConsoleErrorArgs.length, 1);
    const [, loggedError] = capturedConsoleErrorArgs[0];
    const serializedConsoleError = JSON.stringify(loggedError);
    assert.equal(serializedConsoleError.includes(leakedToken), false);
    assert.equal(serializedConsoleError.includes('[REDACTED'), true);

    assert.equal(auditEvents.length, 1);
    const metadata = (auditEvents[0].metadata ?? {}) as Record<string, unknown>;
    const serializedAuditMetadata = JSON.stringify(metadata);
    assert.equal(serializedAuditMetadata.includes(leakedToken), false);
    assert.equal(serializedAuditMetadata.includes('[REDACTED'), true);
    assert.equal(typeof metadata.error_message, 'string');
    assert.equal(typeof metadata.error_stack, 'string');
  } finally {
    consoleErrorMock.mock.restore();
  }
});

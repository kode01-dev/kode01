import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const consentId = '11111111-1111-4111-8111-111111111111';

type ConsentInsertRow = {
  anonymous_consent_id?: string | null;
  event_type?: string;
  accepted_categories?: string[];
  rejected_categories?: string[];
  source?: string;
  locale?: string | null;
};

let cookieValues = new Map<string, string>();
let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};
let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      get: (name: string) => {
        const value = cookieValues.get(name);
        return value ? { name, value } : undefined;
      },
    }),
  },
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

function makeRequest(payload: unknown): Request {
  return new Request('http://localhost/api/cookies/consent-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function createAdminMock() {
  const insertMock = mock.fn(async (row: ConsentInsertRow) => {
    void row;
    return { error: null };
  });
  const query = {
    order: mock.fn(() => query),
    limit: mock.fn(() => query),
    eq: mock.fn(async () => ({ data: [], error: null })),
  };
  const table = {
    select: mock.fn(() => query),
    insert: insertMock,
  };
  const fromMock = mock.fn(() => table);

  return { fromMock, insertMock };
}

async function loadPostHandler(scenario: string) {
  const routeModule = await import(`../../src/app/api/cookies/consent-event/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
  return routeModule.POST ?? routeModule.default?.POST ?? routeModule['module.exports']?.POST;
}

test('consent-event logs normalized consent choices', async () => {
  cookieValues = new Map([['kode01_consent_id', consentId]]);
  const adminMock = createAdminMock();

  createClientImpl = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });
  createAdminClientImpl = () => ({ from: adminMock.fromMock });

  const POST = await loadPostHandler('logs-normalized-choices');
  const response = await POST(makeRequest({
    eventType: 'consent_first_choice',
    acceptedCategories: ['marketing', 'analytics', 'necessary'],
    rejectedCategories: [],
    source: 'banner',
    consentVersion: '2026-05-17-zipchat-native-bubble-v1',
    locale: 'en',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, deduplicated: false });
  assert.equal(adminMock.fromMock.mock.callCount(), 2);
  assert.equal(adminMock.insertMock.mock.callCount(), 1);

  const inserted = adminMock.insertMock.mock.calls[0].arguments[0];
  assert.equal(inserted.anonymous_consent_id, consentId);
  assert.equal(inserted.event_type, 'consent_first_choice');
  assert.deepEqual(inserted.accepted_categories, ['analytics', 'marketing', 'necessary']);
  assert.deepEqual(inserted.rejected_categories, []);
  assert.equal(inserted.source, 'banner');
  assert.equal(inserted.locale, 'en');

  assert.match(response.headers.get('set-cookie') ?? '', /kode01_consent_id=11111111-1111-4111-8111-111111111111/);
});

test('consent-event withdrawal clears anonymous recommendation cookies', async () => {
  cookieValues = new Map([['kode01_consent_id', consentId]]);
  const adminMock = createAdminMock();

  createClientImpl = async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  });
  createAdminClientImpl = () => ({ from: adminMock.fromMock });

  const POST = await loadPostHandler('withdrawal-clears-reco-cookies');
  const response = await POST(makeRequest({
    eventType: 'consent_withdrawn',
    acceptedCategories: ['necessary'],
    rejectedCategories: ['analytics', 'marketing'],
    source: 'preferences',
    consentVersion: '2026-05-17-zipchat-native-bubble-v1',
    locale: 'fr',
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, deduplicated: false });
  assert.equal(adminMock.insertMock.mock.callCount(), 1);

  const inserted = adminMock.insertMock.mock.calls[0].arguments[0];
  assert.equal(inserted.event_type, 'consent_withdrawn');
  assert.deepEqual(inserted.accepted_categories, ['necessary']);
  assert.deepEqual(inserted.rejected_categories, ['analytics', 'marketing']);
  assert.equal(inserted.source, 'preferences');
  assert.equal(inserted.locale, 'fr');

  const setCookie = response.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /kode01_reco_profile=;/);
  assert.match(setCookie, /thiki_reco_profile=;/);
  assert.match(setCookie, /Max-Age=0/);
});

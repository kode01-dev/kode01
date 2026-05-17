import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  buildGoogleConsentModeState,
  cleanupOptionalBrowserStorage,
  COOKIE_CONSENT_VERSION,
  extractAcceptedCategoriesFromCcCookie,
  syncGoogleConsentModeFromCategories,
} from '../../src/features/cookies/lib/consent';

function readProjectFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

function installBrowserMocks(cookieValue: string) {
  const cookieWrites: string[] = [];
  const storage = new Map<string, string>([
    ['view-tracked:sample:2026-05-17', '1'],
    ['reco-view-tracked:product:sample:2026-05-17', '1'],
    ['kode01-marketing-store', '{"dismissed":true}'],
  ]);
  const windowMock = {
    dataLayer: [] as unknown[],
    location: {
      hostname: 'www.kode01.com',
      href: 'https://www.kode01.com/en/market',
    },
    localStorage: {
      get length() {
        return storage.size;
      },
      key(index: number) {
        return Array.from(storage.keys())[index] ?? null;
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    },
  };
  const documentMock = {
    get cookie() {
      return cookieValue;
    },
    set cookie(value: string) {
      cookieWrites.push(value);
    },
    referrer: 'https://www.google.com/',
    title: 'KODE01 test page',
  };

  Object.defineProperty(globalThis, 'window', {
    value: windowMock,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: documentMock,
    configurable: true,
  });

  return { cookieWrites, storage, windowMock };
}

function uninstallBrowserMocks() {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
}

test('maps site cookie categories to Google Consent Mode v2 state', () => {
  assert.deepEqual(buildGoogleConsentModeState(['necessary']), {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    security_storage: 'granted',
  });

  assert.deepEqual(buildGoogleConsentModeState(['necessary', 'analytics', 'marketing']), {
    analytics_storage: 'granted',
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    security_storage: 'granted',
  });
});

test('parses both current and legacy vanilla-cookieconsent category shapes', () => {
  const categoriesShape = encodeURIComponent(JSON.stringify({
    categories: {
      necessary: true,
      analytics: true,
      marketing: false,
    },
  }));
  const acceptedCategoriesShape = encodeURIComponent(JSON.stringify({
    acceptedCategories: ['necessary', 'marketing'],
  }));

  assert.deepEqual(extractAcceptedCategoriesFromCcCookie(categoriesShape), ['necessary', 'analytics']);
  assert.deepEqual(extractAcceptedCategoriesFromCcCookie(acceptedCategoriesShape), ['necessary', 'marketing']);
});

test('withdrawal sync denies Google consent and clears optional browser storage', () => {
  const previousMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST12345';

  const { cookieWrites, storage, windowMock } = installBrowserMocks(
    '_ga=1; _ga_TEST=2; _gid=3; _gat=4; _gcl_au=5; session=kept',
  );

  try {
    cleanupOptionalBrowserStorage(['necessary']);

    const consentCommand = Array.from(windowMock.dataLayer[0] as ArrayLike<unknown>);
    assert.deepEqual(consentCommand, [
      'consent',
      'update',
      {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        security_storage: 'granted',
      },
    ]);
    assert.equal((windowMock as Record<string, unknown>)['ga-disable-G-TEST12345'], true);
    assert.equal(storage.has('view-tracked:sample:2026-05-17'), false);
    assert.equal(storage.has('reco-view-tracked:product:sample:2026-05-17'), false);
    assert.equal(storage.has('kode01-marketing-store'), false);
    assert.equal(cookieWrites.some((value) => value.startsWith('_ga=')), true);
    assert.equal(cookieWrites.some((value) => value.startsWith('_ga_TEST=')), true);
    assert.equal(cookieWrites.some((value) => value.startsWith('_gid=')), true);
    assert.equal(cookieWrites.some((value) => value.startsWith('_gat=')), true);
    assert.equal(cookieWrites.some((value) => value.startsWith('_gcl_au=')), true);
    assert.equal(cookieWrites.some((value) => value.startsWith('session=')), false);
  } finally {
    if (previousMeasurementId === undefined) {
      delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    } else {
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = previousMeasurementId;
    }
    uninstallBrowserMocks();
  }
});

test('analytics implementation uses strict consent, env config, and manual pageviews', () => {
  const googleAnalytics = readProjectFile('src/features/cookies/GoogleAnalytics.tsx');
  const instrumentationClient = readProjectFile('src/instrumentation-client.ts');
  const envExample = readProjectFile('.env.example');

  assert.match(envExample, /NEXT_PUBLIC_GA_MEASUREMENT_ID=G-W23SGGLGD3/);
  assert.doesNotMatch(googleAnalytics, /const GA_MEASUREMENT_ID = 'G-/);
  assert.match(googleAnalytics, /getGoogleAnalyticsMeasurementId/);
  assert.match(googleAnalytics, /send_page_view:\s*false/);
  assert.match(googleAnalytics, /'event', 'page_view'/);
  assert.match(instrumentationClient, /bootstrapGoogleConsentMode\(\)/);
  assert.match(instrumentationClient, /window\.gtag\('consent', 'default', DEFAULT_GOOGLE_CONSENT_STATE\)/);
  assert.match(instrumentationClient, /analytics_storage:\s*'denied'/);
  assert.match(instrumentationClient, /ad_user_data:\s*'denied'/);
  assert.match(COOKIE_CONSENT_VERSION, /zipchat-native-bubble-v1/);
});

test('grant sync updates Google consent without clearing Google cookies', () => {
  const previousMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TEST12345';

  const { cookieWrites, windowMock } = installBrowserMocks('_ga=1; _gcl_au=2');

  try {
    syncGoogleConsentModeFromCategories(['necessary', 'analytics', 'marketing']);

    const consentCommand = Array.from(windowMock.dataLayer[0] as ArrayLike<unknown>);
    assert.deepEqual(consentCommand[2], {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      security_storage: 'granted',
    });
    assert.equal((windowMock as Record<string, unknown>)['ga-disable-G-TEST12345'], false);
    assert.deepEqual(cookieWrites, []);
  } finally {
    if (previousMeasurementId === undefined) {
      delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    } else {
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = previousMeasurementId;
    }
    uninstallBrowserMocks();
  }
});

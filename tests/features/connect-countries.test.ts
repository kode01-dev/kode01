import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getConnectCountryLabel,
  isAllowedConnectCountryCode,
  normalizeConnectCountryCode,
  parseAllowedConnectCountryCode,
} from '@/lib/stripe/connect-countries';

test('normalizeConnectCountryCode uppercases valid ISO-2 codes', () => {
  assert.equal(normalizeConnectCountryCode('ca'), 'CA');
  assert.equal(normalizeConnectCountryCode(' Us '), 'US');
});

test('normalizeConnectCountryCode rejects invalid values', () => {
  assert.equal(normalizeConnectCountryCode(''), null);
  assert.equal(normalizeConnectCountryCode('USA'), null);
  assert.equal(normalizeConnectCountryCode('1A'), null);
});

test('parseAllowedConnectCountryCode enforces allowlist', () => {
  assert.equal(parseAllowedConnectCountryCode('CA'), 'CA');
  assert.equal(parseAllowedConnectCountryCode('FR'), 'FR');
  assert.equal(parseAllowedConnectCountryCode('ZZ'), null);
  assert.equal(isAllowedConnectCountryCode('GB'), true);
  assert.equal(isAllowedConnectCountryCode('ZZ'), false);
});

test('getConnectCountryLabel returns friendly label', () => {
  assert.equal(getConnectCountryLabel('CA'), 'Canada');
  assert.equal(getConnectCountryLabel('ZZ'), 'ZZ');
});

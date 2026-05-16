import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const proxyPath = resolve('src/proxy.ts');

test('proxy enforces MFA only for admin paths at launch', () => {
  const source = readFileSync(proxyPath, 'utf8');

  assert.match(source, /function isAdminMfaProtectedApiRoute/);
  assert.match(source, /const shouldEnforceAdminMfa/);
  assert.match(source, /Admin MFA verification is required for this endpoint/);

  assert.doesNotMatch(source, /isVendorMfaProtectedApiRoute/);
  assert.doesNotMatch(source, /isVendorMfaProtectedPageRoute/);
  assert.doesNotMatch(source, /shouldEnforceVendorMfa/);
  assert.doesNotMatch(source, /security\.vendor_mfa_blocked/);
  assert.doesNotMatch(source, /Seller MFA verification is required/);
});

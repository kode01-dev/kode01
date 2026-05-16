import assert from 'node:assert/strict';
import test from 'node:test';
import { CSRF_EXEMPT_API_PATHS, isCsrfExemptApiPath } from '@/lib/security/csrf-exemptions';

test('csrf exemptions are exact-path allowlist entries', () => {
  assert.equal(isCsrfExemptApiPath('/api/webhooks/stripe'), true);
  assert.equal(isCsrfExemptApiPath('/api/webhooks/stripe-connect-thin'), true);
  assert.equal(isCsrfExemptApiPath('/api/cron/weekly-ai-recap'), true);
});

test('csrf exemptions do not apply to sibling or newly-added prefixed routes', () => {
  assert.equal(isCsrfExemptApiPath('/api/webhooks/user-feedback'), false);
  assert.equal(isCsrfExemptApiPath('/api/cron/new-maintenance-task'), false);
  assert.equal(isCsrfExemptApiPath('/api/webhooks'), false);
  assert.equal(isCsrfExemptApiPath('/api/cron'), false);
});

test('csrf exemption path normalization only trims trailing slash', () => {
  assert.equal(isCsrfExemptApiPath('/api/cron/weekly-ai-recap/'), true);
  assert.equal(isCsrfExemptApiPath('api/cron/weekly-ai-recap'), true);
});

test('csrf exemption list has unique entries', () => {
  const unique = new Set(CSRF_EXEMPT_API_PATHS);
  assert.equal(unique.size, CSRF_EXEMPT_API_PATHS.length);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  'supabase/migrations/20260812000000_harden_profiles_admin_role_changes.sql',
);

test('profile hardening migration blocks untrusted admin role escalation', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /DROP POLICY IF EXISTS "Users can insert own profile"/);
  assert.match(sql, /DROP POLICY IF EXISTS "Users can update own profile"/);
  assert.match(sql, /CREATE POLICY "Users can insert own profile"/);
  assert.match(sql, /role = 'buyer'/);
  assert.match(sql, /stripe_account_id IS NULL/);
  assert.match(sql, /stripe_customer_id IS NULL/);
  assert.match(sql, /is_verified IS FALSE/);
  assert.match(sql, /CREATE POLICY "Users can update own profile"/);
  assert.match(sql, /profile_sensitive_fields_unchanged/);
  assert.match(sql, /existing\.role IS NOT DISTINCT FROM p_role/);
  assert.match(sql, /existing\.stripe_customer_id IS NOT DISTINCT FROM p_stripe_customer_id/);
});

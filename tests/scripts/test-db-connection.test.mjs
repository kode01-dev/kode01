import test from 'node:test';
import assert from 'node:assert/strict';

import { getSafeConnectionTargetLabel } from '../../scripts/test-db-connection.mjs';

test('getSafeConnectionTargetLabel never returns connection metadata', () => {
  const dangerousSamples = [
    'postgresql://user:password@db.example.com:5432/postgres',
    'postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
    '',
    undefined,
  ];

  for (const sample of dangerousSamples) {
    assert.equal(getSafeConnectionTargetLabel(sample), '[redacted]');
  }
});

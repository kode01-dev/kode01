import assert from 'node:assert/strict';
import test from 'node:test';
import { maskEmailAddress } from '@/lib/security/email-mask';

test('maskEmailAddress masks local part and preserves domain', () => {
  assert.equal(maskEmailAddress('simbo@gmail.com'), 'sim***@gmail.com');
  assert.equal(maskEmailAddress('ab@example.org'), 'ab***@example.org');
  assert.equal(maskEmailAddress('ALEXANDER@Example.com'), 'ale***@example.com');
});

test('maskEmailAddress returns null for empty or invalid values', () => {
  assert.equal(maskEmailAddress(null), null);
  assert.equal(maskEmailAddress(undefined), null);
  assert.equal(maskEmailAddress(''), null);
  assert.equal(maskEmailAddress('not-an-email'), null);
  assert.equal(maskEmailAddress('missing-domain@'), null);
});

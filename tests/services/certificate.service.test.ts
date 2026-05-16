import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateAccessCode } from '@/services/certificate.service';

const ACCESS_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

test('generateAccessCode returns an 8-char value using allowed characters', () => {
  const accessCode = generateAccessCode();
  assert.equal(accessCode.length, 8);
  assert.match(accessCode, ACCESS_CODE_PATTERN);
});

test('generateAccessCode maps secure random bytes to deterministic allowed chars', () => {
  const accessCode = generateAccessCode({
    getRandomValues: (array: Uint8Array) => {
      array.set([0, 1, 2, 3, 4, 5, 6, 7]);
      return array;
    },
  });

  assert.equal(accessCode, 'ABCDEFGH');
});

test('generateAccessCode produces non-repeating random values across calls', () => {
  const generated = new Set<string>();
  for (let i = 0; i < 32; i++) {
    generated.add(generateAccessCode());
  }

  assert.ok(generated.size > 1);
});

test('generateAccessCode throws when secure randomness is unavailable', () => {
  assert.throws(
    () => generateAccessCode({}),
    /Secure random number generator is unavailable\./,
  );
});

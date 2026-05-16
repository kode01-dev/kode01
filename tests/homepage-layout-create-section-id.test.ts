import assert from 'node:assert/strict';
import test from 'node:test';
import { createSectionId } from '@/features/homepage-layout/utils/create-section-id';

test('uses crypto.randomUUID when available', () => {
  const id = createSectionId('top_deals', {
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
  });

  assert.equal(id, 'top_deals-11111111-1111-4111-8111-111111111111');
});

test('uses crypto.getRandomValues fallback with RFC4122 v4 bits', () => {
  const id = createSectionId('news_latest', {
    getRandomValues: (array: Uint8Array) => {
      array.fill(0);
      return array;
    },
  });

  assert.equal(id, 'news_latest-00000000-0000-4000-8000-000000000000');
});

test('throws when secure randomness is unavailable', () => {
  assert.throws(() => createSectionId('hero', {}), /Secure random number generator is unavailable\./);
});

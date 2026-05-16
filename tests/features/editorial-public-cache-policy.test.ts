import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  shouldRevalidateOnEditorialCreate,
  shouldRevalidateOnEditorialDelete,
  shouldRevalidateOnEditorialUpdate,
} from '@/features/editorial/server/public-cache-policy';

test('editorial create policy revalidates only for published status', () => {
  assert.equal(shouldRevalidateOnEditorialCreate('published'), true);
  assert.equal(shouldRevalidateOnEditorialCreate('draft'), false);
});

test('editorial update policy revalidates when previous or next status is published', () => {
  assert.equal(shouldRevalidateOnEditorialUpdate('draft', 'draft'), false);
  assert.equal(shouldRevalidateOnEditorialUpdate('draft', 'published'), true);
  assert.equal(shouldRevalidateOnEditorialUpdate('published', 'draft'), true);
  assert.equal(shouldRevalidateOnEditorialUpdate('published', 'published'), true);
});

test('editorial delete policy revalidates only for published records', () => {
  assert.equal(shouldRevalidateOnEditorialDelete('published'), true);
  assert.equal(shouldRevalidateOnEditorialDelete('draft'), false);
});


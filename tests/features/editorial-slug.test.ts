import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidEditorialSlug, normalizeSlug, slugifyTitle } from '@/features/editorial/lib/slug';

test('slugifyTitle converts mixed text into lowercase kebab-case', () => {
  const slug = slugifyTitle('  Café Crème & AI 2026!!  ');
  assert.equal(slug, 'cafe-creme-ai-2026');
});

test('normalizeSlug trims and lowercases user-provided slug', () => {
  const slug = normalizeSlug('  My   Great   SLUG ');
  assert.equal(slug, 'my-great-slug');
});

test('isValidEditorialSlug validates expected URL-safe slugs', () => {
  assert.equal(isValidEditorialSlug('hello-world-2026'), true);
  assert.equal(isValidEditorialSlug('HelloWorld'), false);
  assert.equal(isValidEditorialSlug('double--dash'), false);
  assert.equal(isValidEditorialSlug('bad_slug'), false);
});

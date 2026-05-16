import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEndpointToPathname } from '../../scripts/perf/check-perf-gate.mjs';

test('normalizeEndpointToPathname strips querystrings from relative endpoints', () => {
  assert.equal(
    normalizeEndpointToPathname('/api/market/list?locale=en&limit=24'),
    '/api/market/list',
  );
});

test('normalizeEndpointToPathname strips querystrings from absolute endpoints', () => {
  assert.equal(
    normalizeEndpointToPathname('https://example.com/api/news/list?locale=en&limit=24'),
    '/api/news/list',
  );
});

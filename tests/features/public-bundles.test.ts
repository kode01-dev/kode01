import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupBundleItemProductIds } from '../../src/features/bundles/server/public-bundles';

test('bundle item links are indexed once while preserving product order', () => {
  const grouped = groupBundleItemProductIds([
    { bundle_id: 'bundle-a', product_id: 'product-1' },
    { bundle_id: 'bundle-b', product_id: 'product-3' },
    { bundle_id: 'bundle-a', product_id: 'product-2' },
  ]);

  assert.deepEqual(grouped.get('bundle-a'), ['product-1', 'product-2']);
  assert.deepEqual(grouped.get('bundle-b'), ['product-3']);
  assert.equal(grouped.has('bundle-c'), false);
});

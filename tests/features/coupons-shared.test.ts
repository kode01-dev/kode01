import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeCouponDiscountAmount,
  normalizeCouponCode,
} from '@/lib/coupons/shared';

test('normalizeCouponCode trims, uppercases, and removes internal whitespace', () => {
  assert.equal(normalizeCouponCode('  spring sale  '), 'SPRINGSALE');
  assert.equal(normalizeCouponCode('\tnew\n customer '), 'NEWCUSTOMER');
});

test('computeCouponDiscountAmount rounds percentage discounts to currency precision', () => {
  assert.equal(
    computeCouponDiscountAmount({
      type: 'percentage',
      value: 12.5,
      orderAmount: 98.76,
    }),
    12.35,
  );
});

test('computeCouponDiscountAmount caps percentage and fixed discounts at the order total', () => {
  assert.equal(
    computeCouponDiscountAmount({
      type: 'percentage',
      value: 150,
      orderAmount: 40,
    }),
    40,
  );

  assert.equal(
    computeCouponDiscountAmount({
      type: 'fixed',
      value: 75,
      orderAmount: 40,
    }),
    40,
  );
});

test('computeCouponDiscountAmount returns zero for empty or negative order totals', () => {
  assert.equal(
    computeCouponDiscountAmount({
      type: 'percentage',
      value: 20,
      orderAmount: 0,
    }),
    0,
  );

  assert.equal(
    computeCouponDiscountAmount({
      type: 'fixed',
      value: 20,
      orderAmount: -10,
    }),
    0,
  );
});

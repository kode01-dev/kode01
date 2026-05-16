export type CouponType = 'percentage' | 'fixed';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function sanitizeCouponProductIds(input: string[] | null | undefined): string[] | null {
  if (!input || input.length === 0) return null;
  const unique = Array.from(
    new Set(
      input
        .map((item) => item.trim())
        .filter((item) => UUID_REGEX.test(item)),
    ),
  );
  return unique.length > 0 ? unique : null;
}

export function parseCouponProductIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => UUID_REGEX.test(item));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : null;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeCouponDiscountAmount(params: {
  type: CouponType;
  value: number;
  orderAmount: number;
}): number {
  const orderAmount = Math.max(params.orderAmount, 0);
  if (orderAmount === 0) return 0;

  if (params.type === 'percentage') {
    return roundCurrency(Math.min(orderAmount, (orderAmount * params.value) / 100));
  }

  return roundCurrency(Math.min(orderAmount, params.value));
}

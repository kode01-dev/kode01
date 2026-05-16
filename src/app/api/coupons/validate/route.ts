import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  computeCouponDiscountAmount,
  normalizeCouponCode,
  parseCouponProductIds,
  roundCurrency,
  type CouponType,
} from '@/lib/coupons/shared';

const validateCouponSchema = z.object({
  code: z.string().trim().min(3).max(64),
  productId: z.string().uuid(),
  orderAmount: z.coerce.number().positive().optional(),
});

type CouponRow = {
  id: string;
  code: string;
  vendor_id: string | null;
  type: CouponType;
  value: number | string;
  min_order_amount: number | string | null;
  max_uses: number | null;
  current_uses: number;
  valid_from: string | null;
  valid_until: string | null;
  product_ids: unknown;
  stripe_promotion_code_id: string | null;
  is_active: boolean;
};

type ProductRow = {
  id: string;
  seller_id: string;
  price: number;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function invalidCoupon(message: string, code: string) {
  return NextResponse.json(
    {
      valid: false,
      error: message,
      code,
    },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = validateCouponSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const { code, productId, orderAmount } = parsed.data;
    const normalizedCode = normalizeCouponCode(code);
    const now = new Date();

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, seller_id, price')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const db = supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: unknown) => {
            maybeSingle: () => Promise<{ data: CouponRow | null; error: { message: string } | null }>;
          };
        };
      };
    };

    const { data: coupon, error: couponError } = await db
      .from('coupons')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (couponError) {
      return NextResponse.json({ error: couponError.message }, { status: 500 });
    }

    if (!coupon) {
      return invalidCoupon('Coupon not found.', 'not_found');
    }

    if (!coupon.is_active) {
      return invalidCoupon('Coupon is inactive.', 'inactive');
    }

    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return invalidCoupon('Coupon is not active yet.', 'not_started');
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return invalidCoupon('Coupon has expired.', 'expired');
    }

    if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) {
      return invalidCoupon('Coupon usage limit reached.', 'max_uses_reached');
    }

    if (coupon.vendor_id && coupon.vendor_id !== (product as ProductRow).seller_id) {
      return invalidCoupon('Coupon is not valid for this vendor.', 'vendor_mismatch');
    }

    const eligibleProductIds = parseCouponProductIds(coupon.product_ids);
    if (eligibleProductIds && !eligibleProductIds.includes(productId)) {
      return invalidCoupon('Coupon is not valid for this product.', 'product_not_eligible');
    }

    const minOrderAmount = toNumber(coupon.min_order_amount);
    const amountBase = roundCurrency(orderAmount ?? Number((product as ProductRow).price));
    if (minOrderAmount != null && amountBase < minOrderAmount) {
      return invalidCoupon('Order amount is below the coupon minimum.', 'below_minimum');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRedemption, error: redemptionError } = await (supabase as any)
      .from('coupon_redemptions')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (redemptionError) {
      return NextResponse.json({ error: redemptionError.message }, { status: 500 });
    }

    if (existingRedemption) {
      return invalidCoupon('You have already used this coupon.', 'already_used');
    }

    if (!coupon.stripe_promotion_code_id) {
      return invalidCoupon('Coupon is not configured for checkout yet.', 'stripe_not_configured');
    }

    const value = toNumber(coupon.value) ?? 0;
    const discountAmount = computeCouponDiscountAmount({
      type: coupon.type,
      value,
      orderAmount: amountBase,
    });
    const finalAmount = roundCurrency(Math.max(0, amountBase - discountAmount));

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value,
        minOrderAmount,
        discountAmount,
        finalAmount,
      },
    });
  } catch (error) {
    console.error('POST /api/coupons/validate error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

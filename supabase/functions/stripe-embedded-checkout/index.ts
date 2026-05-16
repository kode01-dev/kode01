import { getEdgeEnv } from '../_shared/env.ts';
import { badRequest, internalServerError, isInternalAuthorized, json, methodNotAllowed, unauthorized } from '../_shared/http.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';

const PLATFORM_COMMISSION_RATE = 0.15;
const PLATFORM_FIXED_FEE_CENTS = 0;

const schema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
  finalPrice: z.number().positive().optional(),
  affiliateCode: z.string().min(1).max(128).optional(),
  couponCode: z.string().min(3).max(64).optional(),
});

type CouponValidationResult =
  | {
    ok: true;
    couponId: string;
    couponCode: string;
    stripePromotionCodeId: string;
    discountAmount: number;
  }
  | {
    ok: false;
    error: string;
  };

type CheckoutCouponRow = {
  id: string;
  code: string;
  vendor_id: string | null;
  type: 'percentage' | 'fixed';
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

function parseCouponProductIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter((item) => UUID_REGEX.test(item));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resolveProductCheckoutPrice(params: {
  productPrice: number | string | null | undefined;
  minPrice: number | string | null | undefined;
  isPwyw: boolean | null | undefined;
  finalPrice: number | undefined;
}): { ok: true; price: number } | { ok: false; error: string } {
  const basePrice = toNumber(params.productPrice);
  if (basePrice == null || basePrice <= 0) {
    return { ok: false, error: 'Product price is not available' };
  }

  const serverPrice = roundCurrency(basePrice);
  const requestedPrice = params.finalPrice == null ? null : roundCurrency(params.finalPrice);

  if (!params.isPwyw) {
    if (requestedPrice != null && Math.abs(requestedPrice - serverPrice) > 0.009) {
      return { ok: false, error: 'Invalid price for fixed-price product' };
    }
    return { ok: true, price: serverPrice };
  }

  const minPrice = Math.max(0, toNumber(params.minPrice) ?? 0);
  const price = requestedPrice ?? serverPrice;
  if (price < minPrice) {
    return { ok: false, error: `Price must be at least $${minPrice.toFixed(2)}` };
  }

  return { ok: true, price };
}

function computeDiscountAmount(type: 'percentage' | 'fixed', value: number, orderAmount: number): number {
  if (orderAmount <= 0) return 0;
  if (type === 'percentage') {
    return roundCurrency(Math.min(orderAmount, (orderAmount * value) / 100));
  }
  return roundCurrency(Math.min(orderAmount, value));
}

async function validateCouponForCheckout(params: {
  couponCode: string;
  userId: string;
  productId: string;
  sellerId: string;
  orderAmount: number;
}): Promise<CouponValidationResult> {
  const now = new Date();
  const normalizedCode = normalizeCouponCode(params.couponCode);

  const { data: coupon, error: couponError } = await supabaseAdmin
    .from('coupons')
    .select('id, code, vendor_id, type, value, min_order_amount, max_uses, current_uses, valid_from, valid_until, product_ids, stripe_promotion_code_id, is_active')
    .eq('code', normalizedCode)
    .maybeSingle();

  if (couponError) {
    console.error('Failed to load coupon for checkout:', couponError);
    return { ok: false, error: 'Failed to validate coupon' };
  }

  if (!coupon) return { ok: false, error: 'Coupon not found' };

  const couponRow = coupon as CheckoutCouponRow;
  if (!couponRow.is_active) return { ok: false, error: 'Coupon is inactive' };
  if (couponRow.valid_from && new Date(couponRow.valid_from) > now) return { ok: false, error: 'Coupon is not active yet' };
  if (couponRow.valid_until && new Date(couponRow.valid_until) < now) return { ok: false, error: 'Coupon has expired' };
  if (couponRow.max_uses != null && couponRow.current_uses >= couponRow.max_uses) {
    return { ok: false, error: 'Coupon usage limit reached' };
  }
  if (couponRow.vendor_id && couponRow.vendor_id !== params.sellerId) {
    return { ok: false, error: 'Coupon is not valid for this vendor' };
  }

  const eligibleProductIds = parseCouponProductIds(couponRow.product_ids);
  if (eligibleProductIds && !eligibleProductIds.includes(params.productId)) {
    return { ok: false, error: 'Coupon is not valid for this product' };
  }

  const minOrderAmount = toNumber(couponRow.min_order_amount);
  if (minOrderAmount != null && params.orderAmount < minOrderAmount) {
    return { ok: false, error: 'Order amount is below the coupon minimum' };
  }

  const { data: redemption, error: redemptionError } = await supabaseAdmin
    .from('coupon_redemptions')
    .select('id')
    .eq('coupon_id', couponRow.id)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (redemptionError) {
    console.error('Failed to load coupon redemption usage:', redemptionError);
    return { ok: false, error: 'Failed to validate coupon usage' };
  }
  if (redemption) return { ok: false, error: 'Coupon already used' };

  if (!couponRow.stripe_promotion_code_id) {
    return { ok: false, error: 'Coupon is not configured for checkout' };
  }

  const value = toNumber(couponRow.value) ?? 0;
  const discountAmount = computeDiscountAmount(couponRow.type, value, params.orderAmount);
  return {
    ok: true,
    couponId: couponRow.id,
    couponCode: couponRow.code,
    stripePromotionCodeId: couponRow.stripe_promotion_code_id,
    discountAmount,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!isInternalAuthorized(req)) return unauthorized();

  const payload = await req.json().catch(() => null);
  const parsed = parseWithSchema(schema, payload);
  if (!parsed.success) return badRequest('Invalid request payload');

  const { userId, productId, finalPrice, affiliateCode, couponCode } = parsed.data;
  const stripe = getStripe();
  const env = getEdgeEnv();

  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, seller_id, slug, title, description, price, min_price, is_pwyw, cover_image_url, status, profiles!products_seller_id_fkey(role, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled)')
      .eq('id', productId)
      .eq('status', 'published')
      .single();

    if (productError || !product) return badRequest('Product not found');

    const seller = product.profiles as {
      role: string;
      stripe_account_id: string | null;
      stripe_charges_enabled: boolean;
      stripe_payouts_enabled: boolean;
    } | null;
    const canSell = seller?.role === 'seller'
      && Boolean(seller.stripe_account_id)
      && seller.stripe_charges_enabled === true
      && seller.stripe_payouts_enabled === true;
    if (!canSell || !seller?.stripe_account_id) {
      return badRequest('Seller Stripe onboarding is incomplete');
    }

    const resolvedPrice = resolveProductCheckoutPrice({
      productPrice: product.price,
      minPrice: product.min_price,
      isPwyw: product.is_pwyw,
      finalPrice,
    });
    if (!resolvedPrice.ok) return badRequest(resolvedPrice.error);
    const priceToUse = resolvedPrice.price;

    const productPriceCents = Math.round(priceToUse * 100);
    let couponDiscountCents = 0;
    let appliedCoupon: {
      couponId: string;
      couponCode: string;
      stripePromotionCodeId: string;
    } | null = null;

    if (couponCode) {
      const validation = await validateCouponForCheckout({
        couponCode,
        userId,
        productId,
        sellerId: product.seller_id as string,
        orderAmount: priceToUse,
      });

      if (!validation.ok) {
        return badRequest(validation.error);
      }

      couponDiscountCents = Math.round(validation.discountAmount * 100);
      appliedCoupon = {
        couponId: validation.couponId,
        couponCode: validation.couponCode,
        stripePromotionCodeId: validation.stripePromotionCodeId,
      };
    }

    const discountedPriceCents = Math.max(0, productPriceCents - couponDiscountCents);
    const applicationFeeCents = Math.round(
      discountedPriceCents * PLATFORM_COMMISSION_RATE + PLATFORM_FIXED_FEE_CENTS,
    );

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      adaptive_pricing: {
        enabled: true,
      },
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: product.title,
              description: product.description?.substring(0, 255) || 'Digital File',
              images: product.cover_image_url ? [product.cover_image_url] : [],
            },
            unit_amount: productPriceCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      return_url: `${env.appBaseUrl}/en/products/${product.slug ?? product.id}?session_id={CHECKOUT_SESSION_ID}`,
      ...(appliedCoupon
        ? {
          discounts: [
            {
              promotion_code: appliedCoupon.stripePromotionCodeId,
            },
          ],
        }
        : {}),
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: {
          destination: seller.stripe_account_id,
        },
      },
      metadata: {
        buyerId: userId,
        productId: product.id,
        ...(affiliateCode ? { affiliateCode } : {}),
        ...(appliedCoupon
          ? {
            couponId: appliedCoupon.couponId,
            couponCode: appliedCoupon.couponCode,
          }
          : {}),
      },
    });

    return json({ clientSecret: session.client_secret });
  } catch (error) {
    console.error('stripe-embedded-checkout error:', error);
    return internalServerError();
  }
});

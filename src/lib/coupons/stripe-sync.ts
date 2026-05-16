import { stripe } from '@/lib/stripe/server';
import type { CouponType } from '@/lib/coupons/shared';

type CreateStripeCouponParams = {
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  validUntil: string | null;
  isActive: boolean;
};

export async function createStripeCouponAndPromotionCode(params: CreateStripeCouponParams): Promise<{
  stripeCouponId: string;
  stripePromotionCodeId: string;
}> {
  const redeemBy = params.validUntil
    ? Math.floor(new Date(params.validUntil).getTime() / 1000)
    : undefined;

  const coupon = await stripe.coupons.create({
    duration: 'once',
    max_redemptions: params.maxUses ?? undefined,
    redeem_by: Number.isFinite(redeemBy ?? Number.NaN) ? redeemBy : undefined,
    ...(params.type === 'percentage'
      ? { percent_off: params.value }
      : {
        amount_off: Math.max(1, Math.round(params.value * 100)),
        currency: 'cad',
      }),
  });

  const promotionCode = await stripe.promotionCodes.create({
    promotion: {
      type: 'coupon',
      coupon: coupon.id,
    },
    code: params.code,
    active: params.isActive,
  });

  return {
    stripeCouponId: coupon.id,
    stripePromotionCodeId: promotionCode.id,
  };
}

export async function setStripePromotionCodeActive(
  stripePromotionCodeId: string,
  isActive: boolean,
): Promise<void> {
  await stripe.promotionCodes.update(stripePromotionCodeId, { active: isActive });
}

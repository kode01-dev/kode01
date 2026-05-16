import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSellerSessionOrError } from '@/app/api/vendor/bundles/_lib';
import {
  computeCouponDiscountAmount,
  normalizeCouponCode,
  parseCouponProductIds,
  roundCurrency,
  sanitizeCouponProductIds,
  type CouponType,
} from '@/lib/coupons/shared';
import {
  createStripeCouponAndPromotionCode,
  setStripePromotionCodeActive,
} from '@/lib/coupons/stripe-sync';

const paramsSchema = z.object({
  couponId: z.string().uuid(),
});

const updateCouponSchema = z.object({
  code: z.string().trim().min(3).max(64).optional(),
  type: z.enum(['percentage', 'fixed']).optional(),
  value: z.coerce.number().positive().optional(),
  minOrderAmount: z.coerce.number().min(0).optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  productIds: z.array(z.string().uuid()).max(200).optional().nullable(),
  isActive: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.type === 'percentage' && typeof value.value === 'number' && value.value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Percentage coupons cannot exceed 100%.',
      path: ['value'],
    });
  }

  if (value.validFrom && value.validUntil) {
    const from = new Date(value.validFrom);
    const until = new Date(value.validUntil);
    if (Number.isFinite(from.getTime()) && Number.isFinite(until.getTime()) && until < from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validUntil must be greater than validFrom.',
        path: ['validUntil'],
      });
    }
  }
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
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

function mapCoupon(row: CouponRow) {
  const value = toNumber(row.value) ?? 0;
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value,
    minOrderAmount: toNumber(row.min_order_amount),
    maxUses: row.max_uses,
    currentUses: row.current_uses,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    productIds: parseCouponProductIds(row.product_ids),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stripeConfigured: Boolean(row.stripe_coupon_id && row.stripe_promotion_code_id),
    preview: {
      discountOn100: computeCouponDiscountAmount({ type: row.type, value, orderAmount: 100 }),
      netOn100: roundCurrency(100 - computeCouponDiscountAmount({ type: row.type, value, orderAmount: 100 })),
    },
  };
}

async function ensureOwnedProducts(params: {
  supabase: unknown;
  sellerId: string;
  productIds: string[] | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!params.productIds || params.productIds.length === 0) return { ok: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = params.supabase as any;
  const { data, error } = await db
    .from('products')
    .select('id')
    .eq('seller_id', params.sellerId)
    .in('id', params.productIds);

  if (error) return { ok: false, error: error.message };
  if ((data ?? []).length !== params.productIds.length) {
    return { ok: false, error: 'One or more selected products do not belong to this vendor.' };
  }
  return { ok: true };
}

async function loadOwnCoupon(supabase: unknown, sellerId: string, couponId: string): Promise<CouponRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from('coupons')
    .select('*')
    .eq('id', couponId)
    .eq('vendor_id', sellerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as CouponRow | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ couponId: string }> },
) {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;

    const resolvedParams = paramsSchema.safeParse(await params);
    if (!resolvedParams.success) {
      return NextResponse.json({ error: 'Invalid coupon id.' }, { status: 400 });
    }

    const existing = await loadOwnCoupon(session.supabase, session.userId, resolvedParams.data.couponId);
    if (!existing) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = updateCouponSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid payload',
        details: parsed.error.issues.map((issue) => issue.message),
      }, { status: 400 });
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    const nextCode = parsed.data.code ? normalizeCouponCode(parsed.data.code) : existing.code;
    const nextType = parsed.data.type ?? existing.type;
    const nextValue = parsed.data.value ?? (toNumber(existing.value) ?? 0);
    const nextMaxUses = Object.prototype.hasOwnProperty.call(parsed.data, 'maxUses')
      ? parsed.data.maxUses ?? null
      : existing.max_uses;
    const nextValidUntil = Object.prototype.hasOwnProperty.call(parsed.data, 'validUntil')
      ? parsed.data.validUntil ?? null
      : existing.valid_until;
    const nextIsActive = Object.prototype.hasOwnProperty.call(parsed.data, 'isActive')
      ? Boolean(parsed.data.isActive)
      : existing.is_active;
    const nextProductIds = Object.prototype.hasOwnProperty.call(parsed.data, 'productIds')
      ? sanitizeCouponProductIds(parsed.data.productIds)
      : parseCouponProductIds(existing.product_ids);

    if (nextType === 'percentage' && nextValue > 100) {
      return NextResponse.json({ error: 'Percentage coupons cannot exceed 100%.' }, { status: 400 });
    }

    const ownProductsCheck = await ensureOwnedProducts({
      supabase: session.supabase,
      sellerId: session.userId,
      productIds: nextProductIds,
    });
    if (!ownProductsCheck.ok) {
      return NextResponse.json({ error: ownProductsCheck.error }, { status: 400 });
    }

    const needsStripeRecreate = (
      nextCode !== existing.code
      || nextType !== existing.type
      || nextValue !== (toNumber(existing.value) ?? 0)
      || nextMaxUses !== existing.max_uses
      || nextValidUntil !== existing.valid_until
      || !existing.stripe_coupon_id
      || !existing.stripe_promotion_code_id
    );

    let stripeCouponId = existing.stripe_coupon_id;
    let stripePromotionCodeId = existing.stripe_promotion_code_id;

    if (needsStripeRecreate) {
      const created = await createStripeCouponAndPromotionCode({
        code: nextCode,
        type: nextType,
        value: nextValue,
        maxUses: nextMaxUses ?? null,
        validUntil: nextValidUntil ?? null,
        isActive: nextIsActive,
      });

      stripeCouponId = created.stripeCouponId;
      stripePromotionCodeId = created.stripePromotionCodeId;

      if (existing.stripe_promotion_code_id) {
        try {
          await setStripePromotionCodeActive(existing.stripe_promotion_code_id, false);
        } catch (archiveError) {
          console.error('Failed to archive old Stripe promotion code:', archiveError);
        }
      }
    } else if (existing.stripe_promotion_code_id && nextIsActive !== existing.is_active) {
      await setStripePromotionCodeActive(existing.stripe_promotion_code_id, nextIsActive);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = session.supabase as any;
    const { data, error } = await db
      .from('coupons')
      .update({
        code: nextCode,
        type: nextType,
        value: nextValue,
        min_order_amount: Object.prototype.hasOwnProperty.call(parsed.data, 'minOrderAmount')
          ? parsed.data.minOrderAmount ?? null
          : existing.min_order_amount,
        max_uses: nextMaxUses,
        valid_from: Object.prototype.hasOwnProperty.call(parsed.data, 'validFrom')
          ? parsed.data.validFrom ?? null
          : existing.valid_from,
        valid_until: nextValidUntil,
        product_ids: nextProductIds,
        is_active: nextIsActive,
        stripe_coupon_id: stripeCouponId,
        stripe_promotion_code_id: stripePromotionCodeId,
      })
      .eq('id', existing.id)
      .eq('vendor_id', session.userId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Coupon code already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: mapCoupon(data) });
  } catch (error) {
    console.error('PATCH /api/vendor/coupons/[couponId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ couponId: string }> },
) {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;

    const resolvedParams = paramsSchema.safeParse(await params);
    if (!resolvedParams.success) {
      return NextResponse.json({ error: 'Invalid coupon id.' }, { status: 400 });
    }

    const existing = await loadOwnCoupon(session.supabase, session.userId, resolvedParams.data.couponId);
    if (!existing) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    if (existing.stripe_promotion_code_id) {
      try {
        await setStripePromotionCodeActive(existing.stripe_promotion_code_id, false);
      } catch (stripeError) {
        console.error('Failed to deactivate Stripe promotion code:', stripeError);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = session.supabase as any;
    const { error } = await db
      .from('coupons')
      .update({ is_active: false })
      .eq('id', existing.id)
      .eq('vendor_id', session.userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { id: existing.id, isActive: false } });
  } catch (error) {
    console.error('DELETE /api/vendor/coupons/[couponId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

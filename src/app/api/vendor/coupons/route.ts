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
import { createStripeCouponAndPromotionCode } from '@/lib/coupons/stripe-sync';

const couponTypeSchema = z.enum(['percentage', 'fixed']);

const createCouponSchema = z.object({
  code: z.string().trim().min(3).max(64),
  type: couponTypeSchema,
  value: z.coerce.number().positive(),
  minOrderAmount: z.coerce.number().min(0).optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  productIds: z.array(z.string().uuid()).max(200).optional().nullable(),
  isActive: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  if (value.type === 'percentage' && value.value > 100) {
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

type ProductChoiceRow = {
  id: string;
  title: string;
  price: number | string;
  status: string;
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
  const minOrderAmount = toNumber(row.min_order_amount);
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value,
    minOrderAmount,
    maxUses: row.max_uses,
    currentUses: row.current_uses,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    productIds: parseCouponProductIds(row.product_ids),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stripeConfigured: Boolean(row.stripe_coupon_id && row.stripe_promotion_code_id),
    // Server-computed preview used by vendor UI helper text
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

  const db = params.supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => {
          in: (column: string, values: unknown[]) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data, error } = await db
    .from('products')
    .select('id')
    .eq('seller_id', params.sellerId)
    .in('id', params.productIds);

  if (error) {
    return { ok: false, error: error.message };
  }

  if ((data ?? []).length !== params.productIds.length) {
    return { ok: false, error: 'One or more selected products do not belong to this vendor.' };
  }

  return { ok: true };
}

export async function GET() {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;

    const { supabase, userId } = session;
    const db = supabase as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: unknown) => {
            order: (column: string, options: { ascending: boolean }) => Promise<{ data: CouponRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };

    const [couponsResponse, productsResponse] = await Promise.all([
      db
        .from('coupons')
        .select('*')
        .eq('vendor_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('id, title, price, status')
        .eq('seller_id', userId)
        .eq('is_bundle', false)
        .order('created_at', { ascending: false }),
    ]);

    if (couponsResponse.error) {
      return NextResponse.json({ error: couponsResponse.error.message }, { status: 500 });
    }

    if (productsResponse.error) {
      return NextResponse.json({ error: productsResponse.error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        coupons: (couponsResponse.data ?? []).map(mapCoupon),
        products: ((productsResponse.data ?? []) as ProductChoiceRow[]).map((row) => ({
          id: row.id,
          title: row.title,
          price: toNumber(row.price) ?? 0,
          status: row.status,
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/vendor/coupons error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;

    const payload = await request.json().catch(() => null);
    const parsed = createCouponSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const db = session.supabase as unknown as {
      from: (table: string) => {
        insert: (payload: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{ data: CouponRow | null; error: { code?: string; message: string } | null }>;
          };
        };
      };
    };

    const normalizedCode = normalizeCouponCode(parsed.data.code);
    const productIds = sanitizeCouponProductIds(parsed.data.productIds);
    const ownProductsCheck = await ensureOwnedProducts({
      supabase: session.supabase,
      sellerId: session.userId,
      productIds,
    });

    if (!ownProductsCheck.ok) {
      return NextResponse.json({ error: ownProductsCheck.error }, { status: 400 });
    }

    let stripeIds: { stripeCouponId: string; stripePromotionCodeId: string };
    try {
      stripeIds = await createStripeCouponAndPromotionCode({
        code: normalizedCode,
        type: parsed.data.type,
        value: parsed.data.value,
        maxUses: parsed.data.maxUses ?? null,
        validUntil: parsed.data.validUntil ?? null,
        isActive: parsed.data.isActive ?? true,
      });
    } catch (stripeError) {
      console.error('Failed to create Stripe coupon/promotion code:', stripeError);
      return NextResponse.json(
        { error: 'Failed to sync coupon with Stripe.' },
        { status: 502 },
      );
    }

    const { data, error } = await db
      .from('coupons')
      .insert({
        code: normalizedCode,
        vendor_id: session.userId,
        type: parsed.data.type,
        value: parsed.data.value,
        min_order_amount: parsed.data.minOrderAmount ?? null,
        max_uses: parsed.data.maxUses ?? null,
        current_uses: 0,
        valid_from: parsed.data.validFrom ?? null,
        valid_until: parsed.data.validUntil ?? null,
        product_ids: productIds,
        stripe_coupon_id: stripeIds.stripeCouponId,
        stripe_promotion_code_id: stripeIds.stripePromotionCodeId,
        is_active: parsed.data.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Coupon code already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Failed to create coupon.' }, { status: 500 });
    }

    return NextResponse.json({ data: mapCoupon(data) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/vendor/coupons error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

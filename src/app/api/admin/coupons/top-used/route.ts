import { NextResponse } from 'next/server';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { createAdminClient } from '@/lib/supabase/admin';

type CouponRow = {
  id: string;
  code: string;
  vendor_id: string | null;
  type: 'percentage' | 'fixed';
  value: number | string;
  current_uses: number;
  max_uses: number | null;
  is_active: boolean;
  created_at: string;
};

type RedemptionRow = {
  coupon_id: string;
  amount_saved: number | string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  shop_name: string | null;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function GET(request: Request) {
  const adminSession = await getAdminSessionOrNull(request, 'admin.coupons');
  if (!adminSession) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    const { data: coupons, error: couponsError } = await admin
      .from('coupons')
      .select('id, code, vendor_id, type, value, current_uses, max_uses, is_active, created_at')
      .order('current_uses', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (couponsError) {
      return NextResponse.json({ error: couponsError.message }, { status: 500 });
    }

    const couponRows = (coupons ?? []) as CouponRow[];
    const couponIds = couponRows.map((coupon) => coupon.id);
    const vendorIds = Array.from(
      new Set(
        couponRows
          .map((coupon) => coupon.vendor_id)
          .filter((vendorId): vendorId is string => Boolean(vendorId)),
      ),
    );

    const [redemptionsResponse, vendorsResponse] = await Promise.all([
      couponIds.length === 0
        ? Promise.resolve({ data: [] as RedemptionRow[], error: null })
        : admin
          .from('coupon_redemptions')
          .select('coupon_id, amount_saved')
          .in('coupon_id', couponIds),
      vendorIds.length === 0
        ? Promise.resolve({ data: [] as ProfileRow[], error: null })
        : admin
          .from('profiles')
          .select('id, display_name, shop_name')
          .in('id', vendorIds),
    ]);

    if (redemptionsResponse.error) {
      return NextResponse.json({ error: redemptionsResponse.error.message }, { status: 500 });
    }

    if (vendorsResponse.error) {
      return NextResponse.json({ error: vendorsResponse.error.message }, { status: 500 });
    }

    const amountSavedByCoupon = new Map<string, number>();
    for (const row of (redemptionsResponse.data ?? []) as RedemptionRow[]) {
      amountSavedByCoupon.set(
        row.coupon_id,
        (amountSavedByCoupon.get(row.coupon_id) ?? 0) + toNumber(row.amount_saved),
      );
    }

    const vendorNameById = new Map<string, string>();
    for (const profile of (vendorsResponse.data ?? []) as ProfileRow[]) {
      vendorNameById.set(
        profile.id,
        profile.shop_name || profile.display_name || profile.id,
      );
    }

    const rows = couponRows.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      vendorId: coupon.vendor_id,
      vendorName: coupon.vendor_id ? (vendorNameById.get(coupon.vendor_id) ?? coupon.vendor_id) : 'Platform-wide',
      type: coupon.type,
      value: toNumber(coupon.value),
      currentUses: coupon.current_uses,
      maxUses: coupon.max_uses,
      isActive: coupon.is_active,
      createdAt: coupon.created_at,
      amountSaved: Number((amountSavedByCoupon.get(coupon.id) ?? 0).toFixed(2)),
    }));

    return NextResponse.json({
      data: {
        generatedAt: new Date().toISOString(),
        totals: {
          coupons: rows.length,
          redemptions: rows.reduce((sum, row) => sum + row.currentUses, 0),
          amountSaved: Number(rows.reduce((sum, row) => sum + row.amountSaved, 0).toFixed(2)),
        },
        rows,
      },
    });
  } catch (error) {
    console.error('GET /api/admin/coupons/top-used error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

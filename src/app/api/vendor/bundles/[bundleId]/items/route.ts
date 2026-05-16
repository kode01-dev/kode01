import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { revalidateMarketContent } from '@/lib/cache/revalidate';
import { getSellerSessionOrError } from '@/app/api/vendor/bundles/_lib';

const paramsSchema = z.object({
  bundleId: z.string().uuid(),
});

const updateItemsSchema = z.object({
  productIds: z.array(z.string().uuid()).max(200),
}).strict();

type BundleStatusRow = {
  id: string;
  status: string;
};

type ProductChoiceRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number | string | null;
  cover_image_url: string | null;
};

type BundleItemRow = {
  product_id: string;
};

function toNumber(value: number | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function getOwnBundleOrNull(
  supabase: SupabaseClient,
  userId: string,
  bundleId: string,
): Promise<BundleStatusRow | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, status')
    .eq('id', bundleId)
    .eq('seller_id', userId)
    .eq('is_bundle', true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as BundleStatusRow | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;
    const resolvedParams = paramsSchema.safeParse(await params);
    if (!resolvedParams.success) {
      return NextResponse.json({ error: 'Invalid bundle id' }, { status: 400 });
    }

    const bundle = await getOwnBundleOrNull(session.supabase, session.userId, resolvedParams.data.bundleId);
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });

    const [{ data: selectedRows, error: selectedError }, { data: availableRows, error: availableError }] = await Promise.all([
      session.supabase
        .from('product_bundle_items')
        .select('product_id')
        .eq('bundle_id', bundle.id),
      session.supabase
        .from('products')
        .select('id, title, slug, status, price, cover_image_url')
        .eq('seller_id', session.userId)
        .eq('is_bundle', false)
        .order('created_at', { ascending: false }),
    ]);

    if (selectedError) return NextResponse.json({ error: selectedError.message }, { status: 500 });
    if (availableError) return NextResponse.json({ error: availableError.message }, { status: 500 });

    const selectedProductIds = ((selectedRows ?? []) as BundleItemRow[]).map((row) => row.product_id);
    const availableProducts = ((availableRows ?? []) as ProductChoiceRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      price: toNumber(row.price),
      coverImageUrl: row.cover_image_url,
    }));

    return NextResponse.json({
      data: {
        bundleId: bundle.id,
        selectedProductIds,
        availableProducts,
      },
    });
  } catch (error) {
    console.error('GET /api/vendor/bundles/[bundleId]/items error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;
    const resolvedParams = paramsSchema.safeParse(await params);
    if (!resolvedParams.success) {
      return NextResponse.json({ error: 'Invalid bundle id' }, { status: 400 });
    }

    const bundle = await getOwnBundleOrNull(session.supabase, session.userId, resolvedParams.data.bundleId);
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });

    const payload = await request.json().catch(() => null);
    const parsed = updateItemsSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid payload',
        details: parsed.error.issues.map((issue) => issue.message),
      }, { status: 400 });
    }

    const uniqueProductIds = Array.from(new Set(parsed.data.productIds));
    if (bundle.status === 'published' && uniqueProductIds.length === 0) {
      return NextResponse.json({
        error: 'Published bundle must keep at least one item',
      }, { status: 400 });
    }

    if (uniqueProductIds.length > 0) {
      const { data: ownedProducts, error: ownedProductsError } = await session.supabase
        .from('products')
        .select('id')
        .eq('seller_id', session.userId)
        .eq('is_bundle', false)
        .in('id', uniqueProductIds);

      if (ownedProductsError) {
        return NextResponse.json({ error: ownedProductsError.message }, { status: 500 });
      }

      if ((ownedProducts ?? []).length !== uniqueProductIds.length) {
        return NextResponse.json({
          error: 'All included items must be non-bundle products owned by the same seller',
        }, { status: 400 });
      }
    }

    const { error: deleteError } = await session.supabase
      .from('product_bundle_items')
      .delete()
      .eq('bundle_id', bundle.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (uniqueProductIds.length > 0) {
      const insertPayload = uniqueProductIds.map((productId) => ({
        bundle_id: bundle.id,
        product_id: productId,
      }));
      const { error: insertError } = await session.supabase
        .from('product_bundle_items')
        .insert(insertPayload);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    revalidateMarketContent();
    return NextResponse.json({
      data: {
        bundleId: bundle.id,
        productIds: uniqueProductIds,
        itemsCount: uniqueProductIds.length,
      },
    });
  } catch (error) {
    console.error('PUT /api/vendor/bundles/[bundleId]/items error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

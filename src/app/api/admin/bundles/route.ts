import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { revalidateMarketContent } from '@/lib/cache/revalidate';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const updateBundleSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(180).optional(),
  slug: z.string().trim().min(2).max(180).regex(slugRegex, 'slug must be kebab-case').optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  price: z.coerce.number().min(0).max(1000000).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).strict();

type BundleRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number | string | null;
  status: string;
  seller_id: string;
  created_at: string;
  updated_at: string;
  profiles:
    | { display_name: string | null; shop_name: string | null }
    | Array<{ display_name: string | null; shop_name: string | null }>
    | null;
};

type BundleItemRow = {
  bundle_id: string;
};

function toNumber(value: number | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('products')
      .select(`
        id,
        title,
        slug,
        description,
        price,
        status,
        seller_id,
        created_at,
        updated_at,
        profiles!seller_id (
          display_name,
          shop_name
        )
      `)
      .eq('is_bundle', true)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as BundleRow[];
    const bundleIds = rows.map((row) => row.id);

    let countMap = new Map<string, number>();
    if (bundleIds.length > 0) {
      const { data: countRows, error: countError } = await admin
        .from('product_bundle_items')
        .select('bundle_id')
        .in('bundle_id', bundleIds);
      if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

      countMap = ((countRows ?? []) as BundleItemRow[]).reduce((map, row) => {
        map.set(row.bundle_id, (map.get(row.bundle_id) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }

    return NextResponse.json({
      data: rows.map((row) => {
        const seller = Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles;
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          description: row.description,
          price: toNumber(row.price),
          status: row.status,
          sellerId: row.seller_id,
          sellerName: seller?.shop_name || seller?.display_name || 'Unknown seller',
          itemsCount: countMap.get(row.id) ?? 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    });
  } catch (error) {
    console.error('GET /api/admin/bundles error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const payload = await request.json().catch(() => null);
    const parsed = updateBundleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid payload',
        details: parsed.error.issues.map((issue) => issue.message),
      }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (typeof parsed.data.title === 'string') updatePayload.title = parsed.data.title;
    if (typeof parsed.data.slug === 'string') updatePayload.slug = parsed.data.slug;
    if (Object.prototype.hasOwnProperty.call(parsed.data, 'description')) {
      updatePayload.description = parsed.data.description?.trim() || null;
    }
    if (typeof parsed.data.price === 'number') updatePayload.price = parsed.data.price;
    if (typeof parsed.data.status === 'string') updatePayload.status = parsed.data.status;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('products')
      .update(updatePayload)
      .eq('id', parsed.data.id)
      .eq('is_bundle', true)
      .select('id')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bundle slug already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });

    revalidateMarketContent();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/admin/bundles error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

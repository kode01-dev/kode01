import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateMarketContent } from '@/lib/cache/revalidate';
import { getSellerSessionOrError } from '@/app/api/vendor/bundles/_lib';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createBundleSchema = z.object({
  title: z.string().trim().min(2).max(180),
  slug: z.string().trim().min(2).max(180).regex(slugRegex, 'slug must be kebab-case'),
  description: z.string().trim().max(10000).optional().nullable(),
  price: z.coerce.number().min(0).max(1000000),
  coverImageUrl: z.string().trim().url().max(2000).optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
}).strict();

type BundleRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number | string | null;
  status: string;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
};

type BundleItemCountRow = {
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

export async function GET() {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;

    const { supabase, userId } = session;
    const { data, error } = await supabase
      .from('products')
      .select('id, title, slug, description, price, status, cover_image_url, created_at, updated_at')
      .eq('seller_id', userId)
      .eq('is_bundle', true)
      .order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as BundleRow[];
    const bundleIds = rows.map((row) => row.id);

    let counts = new Map<string, number>();
    if (bundleIds.length > 0) {
      const { data: countRows, error: countError } = await supabase
        .from('product_bundle_items')
        .select('bundle_id')
        .in('bundle_id', bundleIds);
      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }
      counts = ((countRows ?? []) as BundleItemCountRow[]).reduce((map, row) => {
        map.set(row.bundle_id, (map.get(row.bundle_id) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }

    return NextResponse.json({
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        price: toNumber(row.price),
        status: row.status,
        coverImageUrl: row.cover_image_url,
        itemsCount: counts.get(row.id) ?? 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('GET /api/vendor/bundles error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSellerSessionOrError();
    if ('errorResponse' in session) return session.errorResponse;

    const payload = await request.json().catch(() => null);
    const parsed = createBundleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid payload',
        details: parsed.error.issues.map((issue) => issue.message),
      }, { status: 400 });
    }

    if (parsed.data.status === 'published') {
      return NextResponse.json({
        error: 'Bundle must be created as draft before publishing.',
      }, { status: 400 });
    }

    const { supabase, userId } = session;
    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: userId,
        title: parsed.data.title,
        slug: parsed.data.slug,
        description: parsed.data.description?.trim() || null,
        price: parsed.data.price,
        cover_image_url: parsed.data.coverImageUrl?.trim() || null,
        status: parsed.data.status,
        is_bundle: true,
      })
      .select('id, title, slug, description, price, status, cover_image_url, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bundle slug already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateMarketContent();
    const row = data as BundleRow;
    return NextResponse.json({
      data: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        price: toNumber(row.price),
        status: row.status,
        coverImageUrl: row.cover_image_url,
        itemsCount: 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/vendor/bundles error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

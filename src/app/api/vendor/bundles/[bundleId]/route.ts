import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { revalidateMarketContent } from '@/lib/cache/revalidate';
import { getSellerSessionOrError } from '@/app/api/vendor/bundles/_lib';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const paramsSchema = z.object({
  bundleId: z.string().uuid(),
});

const updateBundleSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  slug: z.string().trim().min(2).max(180).regex(slugRegex, 'slug must be kebab-case').optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  price: z.coerce.number().min(0).max(1000000).optional(),
  coverImageUrl: z.string().trim().url().max(2000).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
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
) {
  const { data, error } = await supabase
    .from('products')
    .select('id, title, slug, description, price, status, cover_image_url, created_at, updated_at')
    .eq('id', bundleId)
    .eq('seller_id', userId)
    .eq('is_bundle', true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as BundleRow | null;
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

    const { count } = await session.supabase
      .from('product_bundle_items')
      .select('*', { count: 'exact', head: true })
      .eq('bundle_id', bundle.id);

    return NextResponse.json({
      data: {
        id: bundle.id,
        title: bundle.title,
        slug: bundle.slug,
        description: bundle.description,
        price: toNumber(bundle.price),
        status: bundle.status,
        coverImageUrl: bundle.cover_image_url,
        itemsCount: count ?? 0,
        createdAt: bundle.created_at,
        updatedAt: bundle.updated_at,
      },
    });
  } catch (error) {
    console.error('GET /api/vendor/bundles/[bundleId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
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

    const existing = await getOwnBundleOrNull(session.supabase, session.userId, resolvedParams.data.bundleId);
    if (!existing) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });

    const payload = await request.json().catch(() => null);
    const parsed = updateBundleSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid payload',
        details: parsed.error.issues.map((issue) => issue.message),
      }, { status: 400 });
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    if (parsed.data.status === 'published') {
      const { count, error: countError } = await session.supabase
        .from('product_bundle_items')
        .select('*', { count: 'exact', head: true })
        .eq('bundle_id', existing.id);
      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }
      if ((count ?? 0) < 1) {
        return NextResponse.json({ error: 'Bundle must contain at least one item before publishing' }, { status: 400 });
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (typeof parsed.data.title === 'string') updatePayload.title = parsed.data.title;
    if (typeof parsed.data.slug === 'string') updatePayload.slug = parsed.data.slug;
    if (Object.prototype.hasOwnProperty.call(parsed.data, 'description')) {
      updatePayload.description = parsed.data.description?.trim() || null;
    }
    if (typeof parsed.data.price === 'number') updatePayload.price = parsed.data.price;
    if (Object.prototype.hasOwnProperty.call(parsed.data, 'coverImageUrl')) {
      updatePayload.cover_image_url = parsed.data.coverImageUrl?.trim() || null;
    }
    if (typeof parsed.data.status === 'string') updatePayload.status = parsed.data.status;

    const { data, error } = await session.supabase
      .from('products')
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('seller_id', session.userId)
      .eq('is_bundle', true)
      .select('id, title, slug, description, price, status, cover_image_url, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bundle slug already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count } = await session.supabase
      .from('product_bundle_items')
      .select('*', { count: 'exact', head: true })
      .eq('bundle_id', existing.id);

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
        itemsCount: count ?? 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('PATCH /api/vendor/bundles/[bundleId] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

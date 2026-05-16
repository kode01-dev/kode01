import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidateMarketContent } from '@/lib/cache/revalidate';

const subcategorySelect = 'id, category_id, slug, name_en, name_fr, description_en, description_fr, display_order, is_active, created_at, updated_at';
const subcategorySlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createSubcategorySchema = z.object({
  category_id: z.string().uuid(),
  slug: z.string().trim().min(1).max(120).regex(subcategorySlugRegex, 'slug must be kebab-case'),
  name_en: z.string().trim().min(1).max(160),
  name_fr: z.string().trim().min(1).max(160),
  description_en: z.string().trim().max(500).optional().nullable(),
  description_fr: z.string().trim().max(500).optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
}).strict();

const updateSubcategorySchema = z.object({
  id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  name_en: z.string().trim().min(1).max(160).optional(),
  name_fr: z.string().trim().min(1).max(160).optional(),
  description_en: z.string().trim().max(500).optional().nullable(),
  description_fr: z.string().trim().max(500).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
}).strict();

type SubcategoryRow = {
  id: string;
  category_id: string;
  slug: string;
  name_en: string;
  name_fr: string;
  description_en: string | null;
  description_fr: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProductSubcategoryCountRow = {
  subcategory_id: string | null;
};

type ApiSubcategoryRow = SubcategoryRow & {
  published_products_count: number;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function buildSubcategoryCounts(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from('products')
    .select('subcategory_id')
    .eq('status', 'published')
    .not('subcategory_id', 'is', null);

  if (error) throw error;

  const counts = new Map<string, number>();
  ((data ?? []) as ProductSubcategoryCountRow[]).forEach((row) => {
    if (!row.subcategory_id) return;
    counts.set(row.subcategory_id, (counts.get(row.subcategory_id) ?? 0) + 1);
  });
  return counts;
}

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const [{ data: subcategories, error: subcategoriesError }, counts] = await Promise.all([
      admin
        .from('product_subcategories')
        .select(subcategorySelect)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true }),
      buildSubcategoryCounts(admin),
    ]);

    if (subcategoriesError) {
      return NextResponse.json({ error: subcategoriesError.message }, { status: 500 });
    }

    const payload = ((subcategories ?? []) as SubcategoryRow[]).map((row) => ({
      ...row,
      published_products_count: counts.get(row.id) ?? 0,
    })) as ApiSubcategoryRow[];

    return NextResponse.json({ data: payload });
  } catch (error) {
    console.error('GET /api/admin/market-subcategories error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = createSubcategorySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('product_subcategories')
      .insert({
        category_id: parsed.data.category_id,
        slug: parsed.data.slug,
        name_en: parsed.data.name_en,
        name_fr: parsed.data.name_fr,
        description_en: normalizeOptionalText(parsed.data.description_en),
        description_fr: normalizeOptionalText(parsed.data.description_fr),
        display_order: parsed.data.display_order,
        is_active: parsed.data.is_active,
      })
      .select(subcategorySelect)
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Subcategory slug already exists' }, { status: 409 });
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Unknown category_id' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidateMarketContent();
    return NextResponse.json({
      data: {
        ...(data as SubcategoryRow),
        published_products_count: 0,
      } satisfies ApiSubcategoryRow,
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/market-subcategories error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminSession = await getAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    if ('slug' in payload) {
      return NextResponse.json({ error: 'Slug cannot be modified once created' }, { status: 400 });
    }

    const parsed = updateSubcategorySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (typeof parsed.data.category_id === 'string') updateData.category_id = parsed.data.category_id;
    if (typeof parsed.data.name_en === 'string') updateData.name_en = parsed.data.name_en;
    if (typeof parsed.data.name_fr === 'string') updateData.name_fr = parsed.data.name_fr;
    if (Object.prototype.hasOwnProperty.call(parsed.data, 'description_en')) {
      updateData.description_en = normalizeOptionalText(parsed.data.description_en);
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, 'description_fr')) {
      updateData.description_fr = normalizeOptionalText(parsed.data.description_fr);
    }
    if (typeof parsed.data.display_order === 'number') updateData.display_order = parsed.data.display_order;
    if (typeof parsed.data.is_active === 'boolean') updateData.is_active = parsed.data.is_active;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('product_subcategories')
      .update(updateData)
      .eq('id', parsed.data.id)
      .select(subcategorySelect)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Subcategory slug already exists' }, { status: 409 });
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Unknown category_id' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 });
    }

    const counts = await buildSubcategoryCounts(admin);

    revalidateMarketContent();
    return NextResponse.json({
      data: {
        ...(data as SubcategoryRow),
        published_products_count: counts.get((data as SubcategoryRow).id) ?? 0,
      } satisfies ApiSubcategoryRow,
    });
  } catch (error) {
    console.error('PATCH /api/admin/market-subcategories error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

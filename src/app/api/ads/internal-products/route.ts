import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 6;

function getLimit(raw: string | null): number {
  const parsed = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function truncate(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function parseNumeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(req.url);
    const limit = getLimit(url.searchParams.get('limit'));

    const { data, error } = await supabase
      .from('products')
      .select(
        'id, slug, title, description, price, is_pwyw, min_price, cover_image_url, download_count, created_at, seller:profiles!products_seller_id_fkey(display_name)',
      )
      .eq('status', 'published')
      .or('price.gt.0,and(is_pwyw.eq.true,min_price.gt.0)')
      .order('download_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Internal ads products query failed:', error);
      return NextResponse.json({ error: 'Failed to fetch internal ads products' }, { status: 500 });
    }

    const rows = (data ?? []).map((row) => {
      const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: truncate(row.description, 120),
        coverImageUrl: row.cover_image_url,
        sellerName: seller?.display_name ?? 'Creator',
        price: row.is_pwyw && parseNumeric(row.min_price) > 0
          ? parseNumeric(row.min_price)
          : parseNumeric(row.price),
      };
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('Internal ads route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

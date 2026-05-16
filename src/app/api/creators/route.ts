import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicServerClient } from '@/lib/supabase/server-public';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800',
};

type CreatorProfileRow = {
  id: string;
  display_name: string | null;
  shop_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  slug: string | null;
};

type ProductSellerRow = {
  seller_id: string | null;
};

const PRODUCTS_PAGE_SIZE = 1000;

function createCreatorsReadClient() {
  try {
    return createAdminClient();
  } catch {
    return createPublicServerClient();
  }
}

async function getPublishedProductCountsBySeller(
  supabase: ReturnType<typeof createCreatorsReadClient>,
  sellerIds: string[],
) {
  const countsBySeller = new Map<string, number>();
  if (sellerIds.length === 0) {
    return countsBySeller;
  }

  let from = 0;

  while (true) {
    const to = from + PRODUCTS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('products')
      .select('seller_id')
      .eq('status', 'published')
      .in('seller_id', sellerIds)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as ProductSellerRow[];
    for (const row of pageRows) {
      if (!row?.seller_id) continue;
      countsBySeller.set(row.seller_id, (countsBySeller.get(row.seller_id) ?? 0) + 1);
    }

    if (pageRows.length < PRODUCTS_PAGE_SIZE) {
      break;
    }

    from += PRODUCTS_PAGE_SIZE;
  }

  return countsBySeller;
}

export async function GET() {
  try {
    const supabase = createCreatorsReadClient();
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, shop_name, avatar_url, is_verified, slug')
      .eq('role', 'seller')
      .order('created_at', { ascending: false });

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
    }

    const rows = (profiles ?? []) as CreatorProfileRow[];
    const sellerIds = rows.map((profile) => profile.id);
    const productCountsBySeller = await getPublishedProductCountsBySeller(supabase, sellerIds);
    const creatorsWithCounts = rows.map((profile) => ({
      id: profile.id,
      display_name: profile.display_name,
      shop_name: profile.shop_name,
      avatar_url: profile.avatar_url,
      is_verified: Boolean(profile.is_verified),
      slug: profile.slug,
      productsCount: productCountsBySeller.get(profile.id) ?? 0,
    }));

    const activeCreators = creatorsWithCounts.filter((creator) => creator.productsCount > 0);

    return NextResponse.json(
      {
        items: activeCreators,
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('Creators GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}

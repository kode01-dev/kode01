import 'server-only';

import { z } from 'zod';

import { createAdminClient } from '@/lib/supabase/admin';
import { createPublicServerClient } from '@/lib/supabase/server-public';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const profileSchema = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  display_name: z.string().nullable(),
  shop_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  is_verified: z.boolean().nullable(),
  created_at: z.string(),
  business_description: z.string().nullable(),
});

const productSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  price: z.union([z.number(), z.string(), z.null()]),
  cover_image_url: z.string().nullable(),
  is_pwyw: z.boolean().nullable(),
  min_price: z.union([z.number(), z.string(), z.null()]),
});

const reviewStatSchema = z.object({
  average_rating: z.union([z.number(), z.string(), z.null()]),
  reviews_count: z.number().nullable(),
});

type ShopProfile = {
  id: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  description: string | null;
};

type ShopProduct = z.infer<typeof productSchema>;

type ShopStats = {
  productsCount: number;
  totalSales: number;
  averageRating: number | null;
  totalReviews: number;
};

export type ShopData = {
  profile: ShopProfile;
  products: ShopProduct[];
  stats: ShopStats;
};

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function getShopData(vendorSlugOrId: string): Promise<ShopData | null> {
  const supabase = createPublicServerClient();
  const profileSelect =
    'id, slug, display_name, shop_name, avatar_url, is_verified, created_at, role, business_description';

  let rawProfile: unknown = null;
  const { data: bySlug } = await supabase
    .from('profiles')
    .select(profileSelect)
    .eq('slug', vendorSlugOrId)
    .eq('role', 'seller')
    .single();

  if (bySlug) {
    rawProfile = bySlug;
  } else if (UUID_RE.test(vendorSlugOrId)) {
    const { data: byId } = await supabase
      .from('profiles')
      .select(profileSelect)
      .eq('id', vendorSlugOrId)
      .eq('role', 'seller')
      .single();
    rawProfile = byId;
  }

  const parsedProfile = profileSchema.safeParse(rawProfile);
  if (!parsedProfile.success) return null;
  const profile = parsedProfile.data;

  const { data: productsData } = await supabase
    .from('products')
    .select('id, slug, title, price, cover_image_url, is_pwyw, min_price')
    .eq('seller_id', profile.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  const parsedProducts = z.array(productSchema).safeParse(productsData);
  const products = parsedProducts.success ? parsedProducts.data : [];
  const productIds = products.map((product) => product.id);

  let totalReviews = 0;
  let weightedRatingSum = 0;

  if (productIds.length > 0) {
    const { data: reviewStatsData } = await supabase
      .from('product_review_stats')
      .select('average_rating, reviews_count')
      .in('product_id', productIds);

    const parsedReviewStats = z.array(reviewStatSchema).safeParse(reviewStatsData);
    const reviewStats = parsedReviewStats.success ? parsedReviewStats.data : [];

    for (const stat of reviewStats) {
      const count = typeof stat.reviews_count === 'number' ? stat.reviews_count : 0;
      const avg = toFiniteNumber(stat.average_rating);
      if (count > 0 && Number.isFinite(avg)) {
        totalReviews += count;
        weightedRatingSum += avg * count;
      }
    }
  }

  let totalSales = 0;
  if (productIds.length > 0) {
    const adminSupabase = createAdminClient();
    const { count } = await adminSupabase
      .from('purchases')
      .select('*', { count: 'exact', head: true })
      .in('product_id', productIds)
      .eq('status', 'completed');
    totalSales = count ?? 0;
  }

  const averageRating =
    totalReviews > 0 ? Math.round((weightedRatingSum / totalReviews) * 10) / 10 : null;

  return {
    profile: {
      id: profile.id,
      slug: profile.slug,
      displayName: profile.shop_name || profile.display_name || 'Creator',
      avatarUrl: profile.avatar_url,
      isVerified: profile.is_verified ?? false,
      createdAt: profile.created_at,
      description: profile.business_description ?? null,
    },
    products,
    stats: {
      productsCount: products.length,
      totalSales,
      averageRating,
      totalReviews,
    },
  };
}

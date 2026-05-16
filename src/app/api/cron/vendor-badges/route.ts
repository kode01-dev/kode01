import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  logCronFailed,
  logCronSucceeded,
  logCronUnauthorized,
  startCronRun,
  withCronHeaders,
} from '@/lib/cron/run-log';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { computeEarnedBadges, diffBadges, type VendorBadgeStats } from '@/features/vendor-badges/badge-rules';
import { isVendorBadgeType, type VendorBadgeType } from '@/features/vendor-badges/types';
import { mapWithConcurrency } from '@/lib/async/map-with-concurrency';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type SellerRow = { id: string; is_verified: boolean | null };
type ProductRow = { id: string; seller_id: string };
type PurchaseRow = { product_id: string | null };
type FollowRow = { creator_id: string };
type ReviewStatRow = {
  product_id: string;
  average_rating: number | string | null;
  reviews_count: number | null;
};
type BadgeRow = { vendor_id: string; badge_type: string };

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function fetchAllSellers(admin: SupabaseAdmin): Promise<SellerRow[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, is_verified')
    .eq('role', 'seller');
  if (error) throw error;
  return (data ?? []) as SellerRow[];
}

async function fetchProductsBySeller(
  admin: SupabaseAdmin,
  sellerIds: string[],
): Promise<Map<string, string>> {
  // Maps product_id -> seller_id
  const productToSeller = new Map<string, string>();
  if (sellerIds.length === 0) return productToSeller;

  const { data, error } = await admin
    .from('products')
    .select('id, seller_id')
    .in('seller_id', sellerIds);
  if (error) throw error;

  for (const row of (data ?? []) as ProductRow[]) {
    productToSeller.set(row.id, row.seller_id);
  }
  return productToSeller;
}

async function fetchSalesBySeller(
  admin: SupabaseAdmin,
  productToSeller: Map<string, string>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (productToSeller.size === 0) return counts;

  const productIds = Array.from(productToSeller.keys());
  // Chunk to avoid oversized IN clauses for large marketplaces.
  const CHUNK = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += CHUNK) {
    chunks.push(productIds.slice(i, i + CHUNK));
  }

  // ⚡ Bolt Optimization: Parallelize chunked database lookups using mapWithConcurrency to prevent sequential latency bottlenecks while capping concurrency.
  const chunkResults = await mapWithConcurrency(chunks, 5, async (chunk) => {
    return admin
      .from('purchases')
      .select('product_id')
      .in('product_id', chunk)
      .eq('status', 'completed');
  });

  for (const { data, error } of chunkResults) {
    if (error) throw error;
    for (const row of (data ?? []) as PurchaseRow[]) {
      if (!row.product_id) continue;
      const sellerId = productToSeller.get(row.product_id);
      if (!sellerId) continue;
      counts.set(sellerId, (counts.get(sellerId) ?? 0) + 1);
    }
  }
  return counts;
}

async function fetchFollowersBySeller(
  admin: SupabaseAdmin,
  sellerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (sellerIds.length === 0) return counts;

  const { data, error } = await admin
    .from('creator_follows')
    .select('creator_id')
    .in('creator_id', sellerIds);
  if (error) throw error;
  for (const row of (data ?? []) as FollowRow[]) {
    counts.set(row.creator_id, (counts.get(row.creator_id) ?? 0) + 1);
  }
  return counts;
}

async function fetchReviewStatsBySeller(
  admin: SupabaseAdmin,
  productToSeller: Map<string, string>,
): Promise<Map<string, { weighted: number; total: number }>> {
  const stats = new Map<string, { weighted: number; total: number }>();
  if (productToSeller.size === 0) return stats;

  const productIds = Array.from(productToSeller.keys());
  const CHUNK = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += CHUNK) {
    chunks.push(productIds.slice(i, i + CHUNK));
  }

  // ⚡ Bolt Optimization: Parallelize chunked database lookups using mapWithConcurrency.
  const chunkResults = await mapWithConcurrency(chunks, 5, async (chunk) => {
    return admin
      .from('product_review_stats')
      .select('product_id, average_rating, reviews_count')
      .in('product_id', chunk);
  });

  for (const { data, error } of chunkResults) {
    if (error) throw error;
    for (const row of (data ?? []) as ReviewStatRow[]) {
      const sellerId = productToSeller.get(row.product_id);
      if (!sellerId) continue;
      const count = typeof row.reviews_count === 'number' ? row.reviews_count : 0;
      const avg = toNumber(row.average_rating);
      if (count <= 0) continue;
      const existing = stats.get(sellerId) ?? { weighted: 0, total: 0 };
      existing.weighted += avg * count;
      existing.total += count;
      stats.set(sellerId, existing);
    }
  }
  return stats;
}

async function fetchExistingBadges(
  admin: SupabaseAdmin,
): Promise<Map<string, Set<VendorBadgeType>>> {
  const map = new Map<string, Set<VendorBadgeType>>();
  const { data, error } = await (
    admin.from('vendor_badges' as never) as unknown as {
      select: (cols: string) => Promise<{ data: BadgeRow[] | null; error: unknown }>;
    }
  ).select('vendor_id, badge_type');
  if (error) throw error;
  for (const row of (data ?? []) as BadgeRow[]) {
    if (!isVendorBadgeType(row.badge_type)) continue;
    const set = map.get(row.vendor_id) ?? new Set<VendorBadgeType>();
    set.add(row.badge_type);
    map.set(row.vendor_id, set);
  }
  return map;
}

async function insertBadges(
  admin: SupabaseAdmin,
  rows: Array<{ vendor_id: string; badge_type: VendorBadgeType }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await (
    admin.from('vendor_badges' as never) as unknown as {
      insert: (rows: unknown) => Promise<{ error: unknown }>;
    }
  ).insert(rows);
  if (error) throw error;
}

async function removeBadges(
  admin: SupabaseAdmin,
  vendorId: string,
  types: VendorBadgeType[],
): Promise<void> {
  if (types.length === 0) return;
  const { error } = await (
    admin.from('vendor_badges' as never) as unknown as {
      delete: () => {
        eq: (col: string, value: string) => {
          in: (col: string, values: string[]) => Promise<{ error: unknown }>;
        };
      };
    }
  )
    .delete()
    .eq('vendor_id', vendorId)
    .in('badge_type', types);
  if (error) throw error;
}

async function runVendorBadgesCron(req: Request) {
  const run = startCronRun(req, 'vendor-badges');
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      return withCronHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        run,
      );
    }

    const admin = createAdminClient();

    const sellers = await fetchAllSellers(admin);
    const sellerIds = sellers.map((s) => s.id);

    const productToSeller = await fetchProductsBySeller(admin, sellerIds);
    const [salesMap, followerMap, reviewMap, existingByVendor] = await Promise.all([
      fetchSalesBySeller(admin, productToSeller),
      fetchFollowersBySeller(admin, sellerIds),
      fetchReviewStatsBySeller(admin, productToSeller),
      fetchExistingBadges(admin),
    ]);

    const toInsert: Array<{ vendor_id: string; badge_type: VendorBadgeType }> = [];
    const removals: Array<{ vendor_id: string; types: VendorBadgeType[] }> = [];
    let vendorsProcessed = 0;

    for (const seller of sellers) {
      vendorsProcessed += 1;

      const reviewAgg = reviewMap.get(seller.id);
      const totalReviews = reviewAgg?.total ?? 0;
      const averageRating =
        reviewAgg && reviewAgg.total > 0
          ? Math.round((reviewAgg.weighted / reviewAgg.total) * 10) / 10
          : null;

      const stats: VendorBadgeStats = {
        totalSales: salesMap.get(seller.id) ?? 0,
        followerCount: followerMap.get(seller.id) ?? 0,
        averageRating,
        totalReviews,
        isVerified: Boolean(seller.is_verified),
        avgResponseMinutes: null,
      };

      const earned = computeEarnedBadges(stats);
      const existing = existingByVendor.get(seller.id) ?? new Set<VendorBadgeType>();
      const { toAdd, toRemove } = diffBadges(earned, existing);

      for (const type of toAdd) {
        toInsert.push({ vendor_id: seller.id, badge_type: type });
      }
      if (toRemove.length > 0) {
        removals.push({ vendor_id: seller.id, types: toRemove });
      }
    }

    // Batch insert in chunks
    const INSERT_CHUNK = 500;
    const insertChunks = [];
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      insertChunks.push(toInsert.slice(i, i + INSERT_CHUNK));
    }

    // ⚡ Bolt Optimization: Parallelize independent database batch inserts and removals using mapWithConcurrency
    await mapWithConcurrency(insertChunks, 5, async (chunk) => {
      await insertBadges(admin, chunk);
    });

    await mapWithConcurrency(removals, 5, async (removal) => {
      await removeBadges(admin, removal.vendor_id, removal.types);
    });

    const badgesAwarded = toInsert.length;
    const badgesRevoked = removals.reduce((sum, r) => sum + r.types.length, 0);

    logCronSucceeded(run, { vendorsProcessed, badgesAwarded, badgesRevoked });
    return withCronHeaders(
      NextResponse.json({
        success: true,
        vendorsProcessed,
        badgesAwarded,
        badgesRevoked,
      }),
      run,
    );
  } catch (error) {
    logCronFailed(run, error);
    return withCronHeaders(
      NextResponse.json({ error: 'Internal Server Error' }, { status: 500 }),
      run,
    );
  }
}

export async function GET(req: Request) {
  return runVendorBadgesCron(req);
}

export async function POST(req: Request) {
  return runVendorBadgesCron(req);
}

import type { createClient } from '@/lib/supabase/server';
import type { ReviewHubEntry, ReviewHubPurchaseStatus, ReviewHubReview } from '../types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PurchaseProductRow = {
  id: string;
  slug: string | null;
  title: string | null;
  status: string | null;
};

type PurchaseRow = {
  id: string;
  status: string | null;
  created_at: string;
  products: PurchaseProductRow | PurchaseProductRow[] | null;
};

type ReviewRow = {
  id: string;
  product_id: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizePurchaseStatus(value: string | null | undefined): ReviewHubPurchaseStatus {
  return value === 'refunded' ? 'refunded' : 'completed';
}

export async function loadReviewHubData(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<ReviewHubEntry[]> {
  const { data: purchasesRaw, error: purchasesError } = await supabase
    .from('purchases')
    .select(`
      id,
      status,
      created_at,
      products (
        id,
        slug,
        title,
        status
      )
    `)
    .eq('buyer_id', userId)
    .in('status', ['completed', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (purchasesError) {
    throw purchasesError;
  }

  const entriesByProduct = new Map<string, Omit<ReviewHubEntry, 'review'>>();
  for (const rawRow of (purchasesRaw ?? []) as PurchaseRow[]) {
    const product = firstOrNull(rawRow.products);
    if (!product?.id || product.status !== 'published') {
      continue;
    }
    if (entriesByProduct.has(product.id)) {
      continue;
    }

    entriesByProduct.set(product.id, {
      purchaseId: rawRow.id,
      purchaseStatus: normalizePurchaseStatus(rawRow.status),
      purchasedAt: rawRow.created_at,
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title?.trim() || 'Untitled Product',
    });
  }

  const productIds = Array.from(entriesByProduct.keys());
  if (productIds.length === 0) {
    return [];
  }

  const { data: reviewsRaw, error: reviewsError } = await supabase
    .from('product_reviews')
    .select('id, product_id, rating, comment, created_at, updated_at')
    .eq('buyer_id', userId)
    .in('product_id', productIds);

  if (reviewsError) {
    throw reviewsError;
  }

  const reviewsByProductId = new Map<string, ReviewHubReview>();
  for (const rawRow of (reviewsRaw ?? []) as ReviewRow[]) {
    reviewsByProductId.set(rawRow.product_id, {
      id: rawRow.id,
      rating: rawRow.rating,
      comment: rawRow.comment,
      createdAt: rawRow.created_at,
      updatedAt: rawRow.updated_at,
    });
  }

  return Array.from(entriesByProduct.values()).map((entry) => ({
    ...entry,
    review: reviewsByProductId.get(entry.productId) ?? null,
  }));
}


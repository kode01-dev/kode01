import { z } from 'zod';

export const OPEN_CART_STATUSES = ['active', 'checkout_in_progress', 'abandoned_notified'] as const;
export type OpenCartStatus = (typeof OPEN_CART_STATUSES)[number];

export type OpenCartRow = {
  id: string;
  user_id: string;
  status: OpenCartStatus;
  created_at: string;
  updated_at: string;
};

export type CartItemResponse = {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  price: number;
  coverImageUrl: string | null;
  addedAt: string | null;
  sellerId: string | null;
};

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  priceSnapshot: z.number().positive().optional(),
});

export const checkoutSchema = z.object({
  locale: z.enum(['en', 'fr']).optional(),
});

export type CartCheckoutPriceInput = {
  productPrice: unknown;
  variantPriceOverride: unknown;
  isPwyw: boolean;
  minPrice: unknown;
  priceSnapshot: unknown;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function resolveAuthoritativeCartCheckoutPrice(input: CartCheckoutPriceInput): number | null {
  const basePrice = toNumber(input.variantPriceOverride ?? input.productPrice);
  if (!input.isPwyw) {
    return roundAmount(basePrice);
  }

  const requestedPrice = roundAmount(toNumber(input.priceSnapshot));
  const minPrice = Math.max(toNumber(input.minPrice), basePrice);
  if (requestedPrice < minPrice) {
    return null;
  }

  return requestedPrice;
}

function normalizeStatus(value: unknown): OpenCartStatus {
  if (value === 'checkout_in_progress' || value === 'abandoned_notified') {
    return value;
  }
  return 'active';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOpenCart(db: any, userId: string): Promise<OpenCartRow | null> {
  const { data, error } = await db
    .from('carts')
    .select('id, user_id, status, created_at, updated_at')
    .eq('user_id', userId)
    .in('status', OPEN_CART_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    id: data.id,
    user_id: data.user_id,
    status: normalizeStatus(data.status),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureActiveCart(db: any, userId: string): Promise<OpenCartRow> {
  const existing = await getOpenCart(db, userId);

  if (!existing) {
    const { data, error } = await db
      .from('carts')
      .insert({
        user_id: userId,
        status: 'active',
      })
      .select('id, user_id, status, created_at, updated_at')
      .single();

    if (!error && data) {
      return {
        id: data.id,
        user_id: data.user_id,
        status: 'active',
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }

    // Another concurrent request may have created the open cart first.
    const isUniqueViolation = error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate key');
    if (isUniqueViolation) {
      const racedCart = await getOpenCart(db, userId);
      if (racedCart) return racedCart;
    }

    throw new Error(error?.message ?? 'Unable to create cart');
  }

  if (existing.status === 'active') {
    return existing;
  }

  if (existing.status === 'checkout_in_progress') {
    throw new Error('Cart checkout is already in progress');
  }

  const { data, error } = await db
    .from('carts')
    .update({ status: 'active' })
    .eq('id', existing.id)
    .eq('user_id', userId)
    .select('id, user_id, status, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to reactivate cart');
  }

  return {
    id: data.id,
    user_id: data.user_id,
    status: 'active',
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateCartStatus(db: any, cartId: string, status: OpenCartStatus): Promise<void> {
  const { error } = await db.from('carts').update({ status }).eq('id', cartId);
  if (error) throw new Error(error.message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCartItems(db: any, cartId: string): Promise<CartItemResponse[]> {
  const { data, error } = await db
    .from('cart_items')
    .select(`
      id,
      product_id,
      variant_id,
      price_snapshot,
      added_at,
      products!inner (
        id,
        title,
        cover_image_url,
        seller_id
      )
    `)
    .eq('cart_id', cartId)
    .order('added_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    product_id: string;
    variant_id: string | null;
    price_snapshot: number | string;
    added_at: string | null;
    products:
      | {
          id: string;
          title: string | null;
          cover_image_url: string | null;
          seller_id: string | null;
        }
      | Array<{
          id: string;
          title: string | null;
          cover_image_url: string | null;
          seller_id: string | null;
        }>
      | null;
  }>;

  return rows.map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    return {
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id ?? null,
      title: product?.title ?? 'Untitled product',
      price: toNumber(row.price_snapshot),
      coverImageUrl: product?.cover_image_url ?? null,
      addedAt: row.added_at,
      sellerId: product?.seller_id ?? null,
    };
  });
}

export function resolveCheckoutLocale(value: unknown): 'en' | 'fr' {
  return value === 'fr' ? 'fr' : 'en';
}

export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  addCartItemSchema,
  ensureActiveCart,
  fetchCartItems,
  getOpenCart,
  roundAmount,
  updateCartStatus,
} from './_lib';

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const cart = await getOpenCart(db, user.id);
    if (!cart) {
      return NextResponse.json({
        cart: null,
        items: [],
      });
    }

    const items = await fetchCartItems(db, cart.id);
    return NextResponse.json({
      cart: {
        id: cart.id,
        status: cart.status,
        createdAt: cart.created_at,
        updatedAt: cart.updated_at,
      },
      items,
    });
  } catch (error) {
    console.error('Cart GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const parsed = addCartItemSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { productId, variantId, priceSnapshot } = parsed.data;

    const { data: product, error: productError } = await db
      .from('products')
      .select('id, title, price, min_price, is_pwyw, status')
      .eq('id', productId)
      .eq('status', 'published')
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    let resolvedPrice = toNumber(product.price);

    if (variantId) {
      const { data: variant, error: variantError } = await db
        .from('product_variants')
        .select('id, product_id, price_override')
        .eq('id', variantId)
        .eq('product_id', productId)
        .single();

      if (variantError || !variant) {
        return NextResponse.json({ error: 'Variant not found for this product' }, { status: 400 });
      }

      if (variant.price_override !== null && variant.price_override !== undefined) {
        resolvedPrice = toNumber(variant.price_override);
      }
    }

    let snapshotPrice = roundAmount(resolvedPrice);
    if (typeof priceSnapshot === 'number') {
      const normalizedInput = roundAmount(priceSnapshot);
      const minAllowedForPwyw = Math.max(toNumber(product.min_price), resolvedPrice);

      if (product.is_pwyw) {
        if (normalizedInput < minAllowedForPwyw) {
          return NextResponse.json(
            { error: `Price must be at least ${minAllowedForPwyw.toFixed(2)}` },
            { status: 400 },
          );
        }
        snapshotPrice = normalizedInput;
      } else if (Math.abs(normalizedInput - snapshotPrice) > 0.009) {
        return NextResponse.json({ error: 'Invalid price snapshot for fixed-price product' }, { status: 400 });
      }
    }

    const cart = await ensureActiveCart(db, user.id);
    const nowIso = new Date().toISOString();

    const { error: upsertError } = await db
      .from('cart_items')
      .upsert(
        {
          cart_id: cart.id,
          product_id: productId,
          variant_id: variantId ?? null,
          price_snapshot: snapshotPrice,
          added_at: nowIso,
        },
        { onConflict: 'cart_id,product_id,variant_key' },
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    await db.from('recommendation_events').insert({
      user_id: user.id,
      event_type: 'add_to_cart',
      source_type: 'product',
      target_product_id: productId,
      signal_payload: {
        variant_id: variantId ?? null,
        price_snapshot: snapshotPrice,
      },
    });

    await updateCartStatus(db, cart.id, 'active');
    const items = await fetchCartItems(db, cart.id);

    return NextResponse.json({
      success: true,
      cart: {
        id: cart.id,
        status: 'active',
      },
      items,
    });
  } catch (error) {
    console.error('Cart POST error:', error);
    if (error instanceof Error && error.message === 'Cart checkout is already in progress') {
      return NextResponse.json(
        { error: 'Cart checkout is already in progress. Complete, cancel, or wait for the checkout to expire.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

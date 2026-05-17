import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl } from '@/lib/env/server';
import { stripe } from '@/lib/stripe/server';
import { shouldTrackSignedInRecommendations } from '@/features/recommendations/server/privacy';
import {
  checkoutSchema,
  getOpenCart,
  resolveAuthoritativeCartCheckoutPrice,
  resolveCheckoutLocale,
  roundAmount,
} from '../_lib';
import { securityErrorResponse } from '@/lib/security/api-errors';

const PLATFORM_COMMISSION_RATE = 0.15;

function splitProportionalCents(totalCents: number, amountsCents: number[]): number[] {
  const sum = amountsCents.reduce((total, amount) => total + amount, 0);
  if (sum <= 0 || totalCents <= 0) return amountsCents.map(() => 0);

  const provisional = amountsCents.map((amount, index) => {
    const exact = (totalCents * amount) / sum;
    const floor = Math.floor(exact);
    return { index, floor, remainder: exact - floor };
  });
  let remainder = totalCents - provisional.reduce((total, item) => total + item.floor, 0);
  provisional
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (remainder > 0) {
        item.floor += 1;
        remainder -= 1;
      }
    });
  return provisional.sort((a, b) => a.index - b.index).map((item) => item.floor);
}

type NormalizedCartCheckoutItem = {
  cartItemId: string;
  productId: string;
  variantId: string | null;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  priceSnapshot: number;
  sellerId: string;
  variantName: string | null;
  stripeAccountId: string;
};

export async function POST(request: Request) {
  try {
    const requestId = request.headers.get('x-request-id') ?? undefined;
    const payload = await request.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(payload ?? {});
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
      return securityErrorResponse({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
        requestId,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminDb = createAdminClient() as any;
    const cart = await getOpenCart(db, user.id);
    if (!cart) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }
    if (cart.status !== 'active') {
      return NextResponse.json(
        { error: 'Cart checkout is already in progress. Complete, cancel, or wait for the checkout to expire.' },
        { status: 409 },
      );
    }

    const { data: rawItems, error: itemError } = await db
      .from('cart_items')
      .select(`
        id,
        product_id,
        variant_id,
        price_snapshot,
        products!inner(
          id,
          title,
          description,
          cover_image_url,
          seller_id,
          price,
          min_price,
          is_pwyw,
          status,
          profiles!products_seller_id_fkey(
            role,
            stripe_account_id,
            stripe_charges_enabled,
            stripe_payouts_enabled
          )
        ),
        product_variants(
          id,
          name,
          price_override
        )
      `)
      .eq('cart_id', cart.id);

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const normalizedItems: NormalizedCartCheckoutItem[] = [];

    for (const rawItem of (rawItems ?? []) as Array<{
      id: string;
      product_id: string;
      variant_id: string | null;
      price_snapshot: number | string;
      products:
        | {
            id: string;
            title: string | null;
            description: string | null;
            cover_image_url: string | null;
            seller_id: string;
            price: number | string | null;
            min_price: number | string | null;
            is_pwyw: boolean | null;
            status: string;
            profiles:
              | {
                  role: string;
                  stripe_account_id: string | null;
                  stripe_charges_enabled: boolean;
                  stripe_payouts_enabled: boolean;
                }
              | Array<{
                  role: string;
                  stripe_account_id: string | null;
                  stripe_charges_enabled: boolean;
                  stripe_payouts_enabled: boolean;
                }>
              | null;
          }
        | Array<{
            id: string;
            title: string | null;
            description: string | null;
            cover_image_url: string | null;
            seller_id: string;
            price: number | string | null;
            min_price: number | string | null;
            is_pwyw: boolean | null;
            status: string;
            profiles:
              | {
                  role: string;
                  stripe_account_id: string | null;
                  stripe_charges_enabled: boolean;
                  stripe_payouts_enabled: boolean;
                }
              | Array<{
                  role: string;
                  stripe_account_id: string | null;
                  stripe_charges_enabled: boolean;
                  stripe_payouts_enabled: boolean;
                }>
              | null;
          }>
        | null;
      product_variants:
        | { id: string; name: string; price_override: number | string | null }
        | Array<{ id: string; name: string; price_override: number | string | null }>
        | null;
    }>) {
      const product = Array.isArray(rawItem.products) ? rawItem.products[0] : rawItem.products;
      if (!product) continue;

      if (product.status !== 'published') {
        return NextResponse.json(
          { error: `Product "${product.title ?? rawItem.product_id}" is no longer available.` },
          { status: 400 },
        );
      }

      const sellerProfile = Array.isArray(product.profiles) ? product.profiles[0] : product.profiles;
      const canSell = sellerProfile?.role === 'seller'
        && sellerProfile.stripe_charges_enabled === true
        && sellerProfile.stripe_payouts_enabled === true
        && Boolean(sellerProfile.stripe_account_id);

      if (!canSell || !sellerProfile?.stripe_account_id) {
        return NextResponse.json(
          { error: `Seller for "${product.title ?? rawItem.product_id}" is not ready to receive payments.` },
          { status: 400 },
        );
      }

      const variant = Array.isArray(rawItem.product_variants) ? rawItem.product_variants[0] : rawItem.product_variants;
      const authoritativePrice = resolveAuthoritativeCartCheckoutPrice({
        productPrice: product.price,
        variantPriceOverride: variant?.price_override ?? null,
        isPwyw: product.is_pwyw === true,
        minPrice: product.min_price,
        priceSnapshot: rawItem.price_snapshot,
      });

      if (authoritativePrice == null) {
        return NextResponse.json(
          { error: `Invalid price snapshot for "${product.title ?? rawItem.product_id}".` },
          { status: 400 },
        );
      }

      normalizedItems.push({
        cartItemId: rawItem.id,
        productId: rawItem.product_id,
        variantId: rawItem.variant_id ?? null,
        title: product.title ?? 'Untitled product',
        description: product.description ?? null,
        coverImageUrl: product.cover_image_url ?? null,
        priceSnapshot: authoritativePrice,
        sellerId: product.seller_id,
        variantName: variant?.name ?? null,
        stripeAccountId: sellerProfile.stripe_account_id,
      });
    }

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const locale = resolveCheckoutLocale(parsed.data.locale);
    const appBaseUrl = getAppBaseUrl();

    const groupedBySeller = new Map<string, NormalizedCartCheckoutItem[]>();
    for (const item of normalizedItems) {
      const group = groupedBySeller.get(item.sellerId) ?? [];
      group.push(item);
      groupedBySeller.set(item.sellerId, group);
    }

    const sellerCheckoutRequests: Array<{
      sellerId: string;
      sellerAccountId: string;
      sellerItems: NormalizedCartCheckoutItem[];
      subtotalCents: number;
      cartItemIds: string;
      lineItems: Array<{
        price_data: {
          currency: string;
          product_data: {
            name: string;
            description: string;
            images: string[];
          };
          unit_amount: number;
        };
        quantity: number;
      }>;
    }> = [];

    for (const [sellerId, sellerItems] of groupedBySeller.entries()) {
      const sellerAccountId = sellerItems[0]?.stripeAccountId;
      if (!sellerAccountId) {
        return NextResponse.json({ error: 'Missing seller Stripe account' }, { status: 400 });
      }

      const subtotalCents = sellerItems.reduce((total, item) => total + Math.round(item.priceSnapshot * 100), 0);
      const cartItemIds = sellerItems.map((item) => item.cartItemId).join(',');

      if (cartItemIds.length > 450) {
        return NextResponse.json(
          { error: 'Too many items for one seller checkout. Reduce your cart and try again.' },
          { status: 400 },
        );
      }

      const lineItems = sellerItems.map((item) => {
        const variantSuffix = item.variantName ? ` (${item.variantName})` : '';
        return {
          price_data: {
            currency: 'cad',
            product_data: {
              name: `${item.title}${variantSuffix}`,
              description: item.description?.slice(0, 255) ?? 'Digital product',
              images: item.coverImageUrl ? [item.coverImageUrl] : [],
            },
            unit_amount: Math.round(item.priceSnapshot * 100),
          },
          quantity: 1,
        };
      });

      sellerCheckoutRequests.push({
        sellerId,
        sellerAccountId,
        sellerItems,
        subtotalCents,
        cartItemIds,
        lineItems,
      });
    }

    const sessions = await Promise.all(
      sellerCheckoutRequests.map(async (request) => {
        const applicationFeeCents = Math.round(request.subtotalCents * PLATFORM_COMMISSION_RATE);
        const amountCentsByItem = request.sellerItems.map((item) => Math.round(item.priceSnapshot * 100));
        const feeCentsByItem = splitProportionalCents(applicationFeeCents, amountCentsByItem);
        const session = await stripe.checkout.sessions.create({
          adaptive_pricing: {
            enabled: true,
          },
          line_items: request.lineItems,
          mode: 'payment',
          client_reference_id: user.id,
          success_url: `${appBaseUrl}/${locale}/buyer?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appBaseUrl}/${locale}/market?checkout_canceled=true`,
          payment_intent_data: {
            application_fee_amount: applicationFeeCents,
            transfer_data: {
              destination: request.sellerAccountId,
            },
          },
          metadata: {
            kind: 'cart_multi_vendor',
            buyerId: user.id,
            cartId: cart.id,
            sellerId: request.sellerId,
            cartItemIds: request.cartItemIds,
          },
        });

        const snapshotRows = request.sellerItems.map((item, index) => {
          const amountCents = amountCentsByItem[index] ?? 0;
          const applicationFeeForItem = feeCentsByItem[index] ?? 0;
          return {
            stripe_checkout_session_id: session.id,
            cart_id: cart.id,
            cart_item_id: item.cartItemId,
            buyer_id: user.id,
            seller_id: item.sellerId,
            product_id: item.productId,
            variant_id: item.variantId,
            amount_cents: amountCents,
            currency: 'cad',
            application_fee_cents: applicationFeeForItem,
            seller_payout_cents: Math.max(amountCents - applicationFeeForItem, 0),
          };
        });

        const { error: snapshotError } = await adminDb
          .from('checkout_session_items')
          .insert(snapshotRows);

        if (snapshotError) {
          throw new Error(`Unable to snapshot checkout session items: ${snapshotError.message}`);
        }

        return {
          sellerId: request.sellerId,
          itemCount: request.sellerItems.length,
          subtotal: roundAmount(request.subtotalCents / 100),
          checkoutUrl: session.url,
          checkoutSessionId: session.id,
        };
      }),
    );

    const { error: cartStatusError } = await db
      .from('carts')
      .update({ status: 'checkout_in_progress' })
      .eq('id', cart.id);
    if (cartStatusError) {
      return NextResponse.json({ error: cartStatusError.message }, { status: 500 });
    }

    if (await shouldTrackSignedInRecommendations(db, user.id)) {
      await db.from('recommendation_events').insert({
        user_id: user.id,
        event_type: 'checkout_started',
        source_type: 'checkout',
        signal_payload: {
          cart_id: cart.id,
          session_ids: sessions.map((session) => session.checkoutSessionId),
          multi_vendor: sessions.length > 1,
        },
      });
    }

    return NextResponse.json({
      sessions,
      multiVendor: sessions.length > 1,
      redirectUrl: sessions[0]?.checkoutUrl ?? null,
    });
  } catch (error) {
    console.error('Cart checkout error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

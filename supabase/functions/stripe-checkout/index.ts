import { getEdgeEnv } from '../_shared/env.ts';
import { badRequest, internalServerError, isInternalAuthorized, json, methodNotAllowed, unauthorized } from '../_shared/http.ts';
import { getStripe } from '../_shared/stripe.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';

const PLATFORM_COMMISSION_RATE = 0.15;
const PLATFORM_FIXED_FEE_CENTS = 0;

const schema = z.object({
  userId: z.string().uuid(),
  productId: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!isInternalAuthorized(req)) return unauthorized();

  const payload = await req.json().catch(() => null);
  const parsed = parseWithSchema(schema, payload);
  if (!parsed.success) return badRequest('Invalid request payload');

  const { userId, productId } = parsed.data;
  const stripe = getStripe();
  const env = getEdgeEnv();

  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, title, description, price, cover_image_url, status, profiles!products_seller_id_fkey(role, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled)')
      .eq('id', productId)
      .eq('status', 'published')
      .single();

    if (productError || !product) return badRequest('Product not found');

    if (Number(product.price) <= 0) {
      return badRequest('Product price must be greater than zero');
    }

    const seller = product.profiles as {
      role: string;
      stripe_account_id: string | null;
      stripe_charges_enabled: boolean;
      stripe_payouts_enabled: boolean;
    } | null;
    const canSell = seller?.role === 'seller'
      && Boolean(seller.stripe_account_id)
      && seller.stripe_charges_enabled === true
      && seller.stripe_payouts_enabled === true;
    if (!canSell || !seller?.stripe_account_id) {
      return badRequest('Seller Stripe onboarding is incomplete');
    }

    const productPriceCents = Math.round(Number(product.price) * 100);
    const applicationFeeCents = Math.round(
      productPriceCents * PLATFORM_COMMISSION_RATE + PLATFORM_FIXED_FEE_CENTS,
    );

    const session = await stripe.checkout.sessions.create({
      adaptive_pricing: {
        enabled: true,
      },
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: product.title,
              description: product.description?.substring(0, 255) || 'Digital File',
              images: product.cover_image_url ? [product.cover_image_url] : [],
            },
            unit_amount: productPriceCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${env.appBaseUrl}/en/buyer?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appBaseUrl}/en/products/${product.id}?canceled=true`,
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: {
          destination: seller.stripe_account_id,
        },
      },
      metadata: {
        buyerId: userId,
        productId: product.id,
      },
    });

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('stripe-checkout error:', error);
    return internalServerError();
  }
});

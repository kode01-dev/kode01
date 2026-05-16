import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getAppBaseUrl } from '@/lib/env/server';
import { getStripeClientForConnectSample } from '@/lib/stripe/connect-sample';

type CreateCheckoutSessionRequest = {
  productId?: string;
  quantity?: number;
  locale?: string;
};

function normalizeLocale(input: string | undefined): string {
  if (!input) return 'en';
  const trimmed = input.trim().toLowerCase();
  return trimmed === 'fr' ? 'fr' : 'en';
}

function resolveDefaultPrice(product: Stripe.Product): Stripe.Price | null {
  if (typeof product.default_price === 'object' && product.default_price && !('deleted' in product.default_price)) {
    return product.default_price;
  }

  return null;
}

/**
 * Creates a hosted Checkout Session that uses a destination charge and
 * an application fee to monetize the platform transaction.
 */
export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as CreateCheckoutSessionRequest;
    const productId = payload.productId?.trim();
    const parsedQuantity = payload.quantity;
    const quantity =
      typeof parsedQuantity === 'number' && Number.isInteger(parsedQuantity) && parsedQuantity > 0
        ? parsedQuantity
        : 1;
    const locale = normalizeLocale(payload.locale);

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const stripeClient = getStripeClientForConnectSample();
    const product = await stripeClient.products.retrieve(productId, {
      expand: ['default_price'],
    });

    const connectedAccountId = product.metadata.connected_account_id;
    if (!connectedAccountId) {
      return NextResponse.json(
        { error: 'This product is missing connected_account_id metadata.' },
        { status: 400 },
      );
    }

    const defaultPrice = resolveDefaultPrice(product);
    if (!defaultPrice || defaultPrice.unit_amount === null) {
      return NextResponse.json(
        { error: 'This product has no usable default price. Create it with default_price_data first.' },
        { status: 400 },
      );
    }

    const unitAmount = defaultPrice.unit_amount;
    const lineTotal = unitAmount * quantity;
    const applicationFeeAmount = Math.max(1, Math.round(lineTotal * 0.1));
    const appBaseUrl = getAppBaseUrl();

    const session = await stripeClient.checkout.sessions.create({
      adaptive_pricing: {
        enabled: true,
      },
      line_items: [
        {
          price_data: {
            currency: defaultPrice.currency,
            product_data: {
              name: product.name,
              description: product.description ?? undefined,
            },
            unit_amount: unitAmount,
          },
          quantity,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: connectedAccountId,
        },
      },
      mode: 'payment',
      success_url: `${appBaseUrl}/${locale}/stripe-connect-sample/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBaseUrl}/${locale}/stripe-connect-sample?checkout=canceled`,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      applicationFeeAmount,
      connectedAccountId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create checkout session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

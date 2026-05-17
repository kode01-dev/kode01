import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import {
  requireStripeConnectSampleSeller,
  stripeConnectSampleAccessResponse,
} from '@/lib/stripe/connect-sample-access';
import { getStripeClientForConnectSample } from '@/lib/stripe/connect-sample';

type CreateProductRequest = {
  name?: string;
  description?: string;
  priceInCents?: number;
  currency?: string;
};

type StorefrontProduct = {
  id: string;
  name: string;
  description: string | null;
  defaultPriceId: string | null;
  priceInCents: number | null;
  currency: string | null;
  connectedAccountId: string | null;
};

type ConnectedAccountSummary = {
  id: string;
  displayName: string | null;
  contactEmail: string | null;
};

function isPriceObject(
  price: string | Stripe.Price | Stripe.DeletedPrice | null | undefined,
): price is Stripe.Price {
  return typeof price === 'object' && price !== null && !('deleted' in price);
}

/**
 * Returns products (platform-level) and all connected recipient accounts
 * for the storefront demo.
 */
export async function GET() {
  try {
    const access = await requireStripeConnectSampleSeller();
    if (!access.ok) return stripeConnectSampleAccessResponse(access);

    const stripeClient = getStripeClientForConnectSample();

    const [products, accounts] = await Promise.all([
      // ⚡ Bolt: Resolves N+1 query problem by fetching price objects directly via Stripe's 'expand' feature.
      // Eliminates sequential individual API calls in resolveDefaultPrice for up to 100 products.
      stripeClient.products.list({ active: true, limit: 100, expand: ['data.default_price'] }),
      stripeClient.v2.core.accounts.list({ applied_configurations: ['recipient'], limit: 100 }),
    ]);

    const storefrontProducts: StorefrontProduct[] = products.data.map((product) => {
      let defaultPriceId: string | null = null;
      let priceInCents: number | null = null;
      let currency: string | null = null;

      if (isPriceObject(product.default_price)) {
        defaultPriceId = product.default_price.id;
        priceInCents = product.default_price.unit_amount ?? null;
        currency = product.default_price.currency ?? null;
      } else if (typeof product.default_price === 'string') {
        defaultPriceId = product.default_price;
      }

      return {
        id: product.id,
        name: product.name,
        description: product.description ?? null,
        defaultPriceId,
        priceInCents,
        currency,
        connectedAccountId: product.metadata.connected_account_id ?? null,
      };
    });

    const connectedAccounts: ConnectedAccountSummary[] = accounts.data.map((account) => ({
      id: account.id,
      displayName: account.display_name ?? null,
      contactEmail: account.contact_email ?? null,
    }));

    return NextResponse.json({
      products: storefrontProducts,
      connectedAccounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load storefront products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Creates a product on the platform account and stores product -> connected account mapping
 * in Stripe metadata (`connected_account_id`).
 */
export async function POST(req: Request) {
  try {
    const access = await requireStripeConnectSampleSeller();
    if (!access.ok) return stripeConnectSampleAccessResponse(access);
    const { user, profile } = access;

    const payload = (await req.json().catch(() => ({}))) as CreateProductRequest;
    const name = payload.name?.trim();
    const description = payload.description?.trim() || undefined;
    const priceInCents = payload.priceInCents;
    const currency = payload.currency?.trim().toLowerCase() || 'cad';

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!Number.isInteger(priceInCents) || (priceInCents ?? 0) <= 0) {
      return NextResponse.json({ error: 'priceInCents must be a positive integer' }, { status: 400 });
    }

    if (!profile?.stripe_account_id) {
      return NextResponse.json(
        { error: 'No connected account found for this user. Finish onboarding first.' },
        { status: 400 },
      );
    }

    const stripeClient = getStripeClientForConnectSample();
    const createdProduct = await stripeClient.products.create({
      name,
      description,
      default_price_data: {
        unit_amount: priceInCents,
        currency,
      },
      metadata: {
        connected_account_id: profile.stripe_account_id,
        owner_user_id: user.id,
        integration_sample: 'stripe_connect_v2_demo',
      },
    });

    return NextResponse.json({
      id: createdProduct.id,
      name: createdProduct.name,
      connectedAccountId: createdProduct.metadata.connected_account_id ?? null,
      defaultPriceId:
        typeof createdProduct.default_price === 'string'
          ? createdProduct.default_price
          : createdProduct.default_price?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create product';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

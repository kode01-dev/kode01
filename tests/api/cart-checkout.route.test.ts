import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type CartRow = {
  id: string;
  user_id: string;
  status: 'active' | 'checkout_in_progress' | 'abandoned_notified';
  created_at: string;
  updated_at: string;
} | null;

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};
let createAdminClientImpl: () => unknown = () => {
  throw new Error('createAdminClient mock not configured');
};
let shouldTrackSignedInRecommendationsImpl: (supabase: unknown, userId: string) => Promise<boolean> = async () => false;

const stripeCheckoutCreateMock = mock.fn(async (params: { metadata?: { sellerId?: string } }) => ({
  id: `cs_${params.metadata?.sellerId ?? 'unknown'}`,
  url: `https://checkout.example.test/${params.metadata?.sellerId ?? 'unknown'}`,
}));

mock.module('server-only', {
  defaultExport: {},
});

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/supabase/admin', {
  namedExports: {
    createAdminClient: () => createAdminClientImpl(),
  },
});

mock.module('@/lib/env/server', {
  namedExports: {
    getAppBaseUrl: () => 'https://kode01.test',
  },
});

mock.module('@/lib/stripe/server', {
  namedExports: {
    stripe: {
      checkout: {
        sessions: {
          create: stripeCheckoutCreateMock,
        },
      },
    },
  },
});

mock.module('@/features/recommendations/server/privacy', {
  namedExports: {
    shouldTrackSignedInRecommendations: (supabase: unknown, userId: string) =>
      shouldTrackSignedInRecommendationsImpl(supabase, userId),
  },
});

async function loadPostHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/cart/checkout/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.POST as (request: Request) => Promise<Response>;
}

function makePostRequest(payload: unknown = { locale: 'en' }): Request {
  return new Request('http://localhost/api/cart/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

class CartQuery {
  constructor(
    private readonly cart: CartRow,
    private readonly updateResult: { error: { message: string } | null } = { error: null },
  ) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  in() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    return { data: this.cart, error: null };
  }

  update() {
    return {
      eq: async () => this.updateResult,
    };
  }
}

function makePublishedCartItem(input: {
  id: string;
  productId: string;
  sellerId: string;
  sellerAccountId: string;
  title: string;
  price: number;
}) {
  return {
    id: input.id,
    product_id: input.productId,
    variant_id: null,
    price_snapshot: input.price,
    products: {
      id: input.productId,
      title: input.title,
      description: `${input.title} description`,
      cover_image_url: null,
      seller_id: input.sellerId,
      price: input.price,
      min_price: null,
      is_pwyw: false,
      status: 'published',
      profiles: {
        role: 'seller',
        stripe_account_id: input.sellerAccountId,
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
      },
    },
    product_variants: null,
  };
}

function makeSupabaseClient(options: {
  user: { id: string } | null;
  cart: CartRow;
  cartItems?: unknown[];
  recommendationInsertMock?: (payload: unknown) => Promise<{ error: null }>;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: options.user }, error: null }),
    },
    from: (table: string) => {
      if (table === 'carts') {
        return new CartQuery(options.cart);
      }
      if (table === 'cart_items') {
        return {
          select: () => ({
            eq: async () => ({ data: options.cartItems ?? [], error: null }),
          }),
        };
      }
      if (table === 'recommendation_events') {
        return {
          insert: options.recommendationInsertMock ?? mock.fn(async (_payload: unknown) => ({ error: null })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

test('POST /api/cart/checkout validates request payload before creating Supabase client', async () => {
  const createClientMock = mock.fn(async () => makeSupabaseClient({ user: null, cart: null }));
  createClientImpl = createClientMock;

  const POST = await loadPostHandler('invalid-payload');
  const response = await POST(makePostRequest({ locale: 'es' }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Validation error',
    details: {
      locale: ['Invalid option: expected one of "en"|"fr"'],
    },
  });
  assert.equal(createClientMock.mock.callCount(), 0);
});

test('POST /api/cart/checkout returns 401 when user is not authenticated', async () => {
  createClientImpl = async () => makeSupabaseClient({ user: null, cart: null });

  const POST = await loadPostHandler('unauthorized');
  const response = await POST(
    new Request('http://localhost/api/cart/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-cart-checkout',
      },
      body: JSON.stringify({ locale: 'en' }),
    }),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-security-error'), 'UNAUTHORIZED');
  assert.equal(response.headers.get('x-request-id'), 'req-cart-checkout');
  assert.deepEqual(await response.json(), {
    error: 'UNAUTHORIZED',
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });
});

test('POST /api/cart/checkout returns 409 for a cart already in checkout', async () => {
  stripeCheckoutCreateMock.mock.resetCalls();
  createClientImpl = async () =>
    makeSupabaseClient({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      cart: {
        id: 'cart-1',
        user_id: '11111111-1111-4111-8111-111111111111',
        status: 'checkout_in_progress',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
    });
  createAdminClientImpl = () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
  });

  const POST = await loadPostHandler('cart-in-progress');
  const response = await POST(makePostRequest({ locale: 'en' }));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'Cart checkout is already in progress. Complete, cancel, or wait for the checkout to expire.',
  });
  assert.equal(stripeCheckoutCreateMock.mock.callCount(), 0);
});

test('POST /api/cart/checkout creates seller Stripe sessions, snapshots items, and tracks checkout start', async () => {
  stripeCheckoutCreateMock.mock.resetCalls();
  shouldTrackSignedInRecommendationsImpl = async () => true;

  const snapshotInsertMock = mock.fn(async (_rows: unknown) => ({ error: null }));
  const recommendationInsertMock = mock.fn(async (_payload: unknown) => ({ error: null }));
  createAdminClientImpl = () => ({
    from: (table: string) => {
      assert.equal(table, 'checkout_session_items');
      return { insert: snapshotInsertMock };
    },
  });

  createClientImpl = async () =>
    makeSupabaseClient({
      user: { id: '22222222-2222-4222-8222-222222222222' },
      cart: {
        id: 'cart-2',
        user_id: '22222222-2222-4222-8222-222222222222',
        status: 'active',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      },
      cartItems: [
        makePublishedCartItem({
          id: 'cart-item-1',
          productId: 'product-1',
          sellerId: 'seller-1',
          sellerAccountId: 'acct_seller_1',
          title: 'Template Pack',
          price: 10,
        }),
        makePublishedCartItem({
          id: 'cart-item-2',
          productId: 'product-2',
          sellerId: 'seller-2',
          sellerAccountId: 'acct_seller_2',
          title: 'Growth Guide',
          price: 20,
        }),
      ],
      recommendationInsertMock,
    });

  const POST = await loadPostHandler('success');
  const response = await POST(makePostRequest({ locale: 'fr' }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.multiVendor, true);
  assert.equal(body.redirectUrl, 'https://checkout.example.test/seller-1');
  assert.deepEqual(
    body.sessions.map((session: { sellerId: string; subtotal: number; checkoutSessionId: string }) => ({
      sellerId: session.sellerId,
      subtotal: session.subtotal,
      checkoutSessionId: session.checkoutSessionId,
    })),
    [
      { sellerId: 'seller-1', subtotal: 10, checkoutSessionId: 'cs_seller-1' },
      { sellerId: 'seller-2', subtotal: 20, checkoutSessionId: 'cs_seller-2' },
    ],
  );

  assert.equal(stripeCheckoutCreateMock.mock.callCount(), 2);
  const firstStripeParams = stripeCheckoutCreateMock.mock.calls[0]?.arguments[0] as {
    success_url?: string;
    cancel_url?: string;
    payment_intent_data?: {
      application_fee_amount?: number;
      transfer_data?: { destination?: string };
    };
    metadata?: { buyerId?: string; cartId?: string; sellerId?: string; cartItemIds?: string };
  };
  assert.equal(firstStripeParams.success_url, 'https://kode01.test/fr/buyer?success=true&session_id={CHECKOUT_SESSION_ID}');
  assert.equal(firstStripeParams.cancel_url, 'https://kode01.test/fr/market?checkout_canceled=true');
  assert.equal(firstStripeParams.payment_intent_data?.application_fee_amount, 150);
  assert.equal(firstStripeParams.payment_intent_data?.transfer_data?.destination, 'acct_seller_1');
  assert.deepEqual(firstStripeParams.metadata, {
    kind: 'cart_multi_vendor',
    buyerId: '22222222-2222-4222-8222-222222222222',
    cartId: 'cart-2',
    sellerId: 'seller-1',
    cartItemIds: 'cart-item-1',
  });

  assert.equal(snapshotInsertMock.mock.callCount(), 2);
  assert.deepEqual(snapshotInsertMock.mock.calls[0]?.arguments[0], [
    {
      stripe_checkout_session_id: 'cs_seller-1',
      cart_id: 'cart-2',
      cart_item_id: 'cart-item-1',
      buyer_id: '22222222-2222-4222-8222-222222222222',
      seller_id: 'seller-1',
      product_id: 'product-1',
      variant_id: null,
      amount_cents: 1000,
      currency: 'cad',
      application_fee_cents: 150,
      seller_payout_cents: 850,
    },
  ]);
  assert.equal(recommendationInsertMock.mock.callCount(), 1);
  assert.deepEqual(recommendationInsertMock.mock.calls[0]?.arguments[0], {
    user_id: '22222222-2222-4222-8222-222222222222',
    event_type: 'checkout_started',
    source_type: 'checkout',
    signal_payload: {
      cart_id: 'cart-2',
      session_ids: ['cs_seller-1', 'cs_seller-2'],
      multi_vendor: true,
    },
  });
});

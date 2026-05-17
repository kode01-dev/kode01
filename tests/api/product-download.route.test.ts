import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

let createClientImpl: () => Promise<unknown> = async () => {
  throw new Error('createClient mock not configured');
};
let shouldTrackSignedInRecommendationsImpl: (supabase: unknown, userId: string) => Promise<boolean> = async () => false;
let auditEvents: Array<Record<string, unknown>> = [];
let rateLimitCalls: Array<Record<string, unknown>> = [];
let enforceRouteRateLimitImpl: (input: Record<string, unknown>) => Promise<Response | null> = async () => null;

mock.module('@/lib/supabase/server', {
  namedExports: {
    createClient: async () => createClientImpl(),
  },
});

mock.module('@/lib/security/audit', {
  namedExports: {
    getAuditContextFromRequest: () => ({
      path: '/api/download/product-1',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    }),
    logAuditEvent: async (event: Record<string, unknown>) => {
      auditEvents.push(event);
    },
  },
});

mock.module('@/lib/security/rate-limit-route', {
  namedExports: {
    enforceRouteRateLimit: async (input: Record<string, unknown>) => {
      rateLimitCalls.push(input);
      return enforceRouteRateLimitImpl(input);
    },
  },
});

mock.module('@/features/recommendations/server/privacy', {
  namedExports: {
    shouldTrackSignedInRecommendations: (supabase: unknown, userId: string) =>
      shouldTrackSignedInRecommendationsImpl(supabase, userId),
  },
});

async function loadGetHandler(scenario: string) {
  const routeModule = await import(
    `../../src/app/api/download/[product_id]/route.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`
  );
  return routeModule.GET as (
    request: Request,
    context: { params: Promise<{ product_id: string }> },
  ) => Promise<Response>;
}

function makeContext(productId = 'product-1') {
  return {
    params: Promise.resolve({ product_id: productId }),
  };
}

function resetState() {
  auditEvents = [];
  rateLimitCalls = [];
  enforceRouteRateLimitImpl = async () => null;
  shouldTrackSignedInRecommendationsImpl = async () => false;
}

class PurchaseQuery {
  public statusFilter: string[] | null = null;

  constructor(private readonly result: QueryResult) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  in(_column: string, values: string[]) {
    this.statusFilter = values;
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    return this.result;
  }
}

class ProductQuery {
  constructor(private readonly result: QueryResult) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  async single() {
    return this.result;
  }
}

test('GET /api/download/[product_id] returns 401 and audits unauthenticated requests', async () => {
  resetState();
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  });

  const GET = await loadGetHandler('unauthorized');
  const response = await GET(
    new Request('http://localhost/api/download/product-1', {
      headers: { 'x-request-id': 'req-download-unauthorized' },
    }),
    makeContext(),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-security-error'), 'UNAUTHORIZED');
  assert.equal(response.headers.get('x-request-id'), 'req-download-unauthorized');
  assert.deepEqual(await response.json(), {
    error: 'UNAUTHORIZED',
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  });
  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['product.download.failed.unauthorized'],
  );
});

test('GET /api/download/[product_id] returns 403 when no qualifying purchase exists', async () => {
  resetState();
  const purchaseQuery = new PurchaseQuery({ data: null, error: null });
  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
        error: null,
      }),
    },
    from: (table: string) => {
      assert.equal(table, 'purchases');
      return purchaseQuery;
    },
  });

  const GET = await loadGetHandler('forbidden');
  const response = await GET(new Request('http://localhost/api/download/product-1'), makeContext());

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('x-security-error'), 'FORBIDDEN_RESOURCE');
  assert.deepEqual(purchaseQuery.statusFilter, ['completed', 'paid', 'fulfilled']);
  assert.equal(rateLimitCalls.length, 1);
  assert.equal(rateLimitCalls[0]?.action, 'PRODUCT_DOWNLOAD');
  assert.equal(rateLimitCalls[0]?.extraKeyPart, '11111111-1111-4111-8111-111111111111:product-1');
  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['product.download.failed.forbidden'],
  );
});

test('GET /api/download/[product_id] redirects to a signed URL and tracks download start', async () => {
  resetState();
  shouldTrackSignedInRecommendationsImpl = async () => true;

  const recommendationInsertMock = mock.fn(async (_payload: unknown) => ({ error: null }));
  const createSignedUrlMock = mock.fn(async () => ({
    data: { signedUrl: 'https://files.example.test/signed/product.zip' },
    error: null,
  }));
  const purchaseQuery = new PurchaseQuery({
    data: { id: 'purchase-1', status: 'completed' },
    error: null,
  });
  const productQuery = new ProductQuery({
    data: {
      file_path_vault: 'digital_file/seller-1/product.zip',
      seller_id: 'seller-1',
    },
    error: null,
  });

  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === 'purchases') return purchaseQuery;
      if (table === 'products') return productQuery;
      if (table === 'recommendation_events') {
        return { insert: recommendationInsertMock };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, 'vault');
        return { createSignedUrl: createSignedUrlMock };
      },
    },
  });

  const GET = await loadGetHandler('success');
  const response = await GET(new Request('http://localhost/api/download/product-1'), makeContext());

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://files.example.test/signed/product.zip');
  assert.equal(rateLimitCalls.length, 1);
  assert.equal(rateLimitCalls[0]?.action, 'PRODUCT_DOWNLOAD');
  assert.equal(rateLimitCalls[0]?.extraKeyPart, '22222222-2222-4222-8222-222222222222:product-1');
  assert.equal(createSignedUrlMock.mock.callCount(), 1);
  assert.deepEqual(createSignedUrlMock.mock.calls[0]?.arguments, [
    'digital_file/seller-1/product.zip',
    60,
  ]);
  assert.equal(recommendationInsertMock.mock.callCount(), 1);
  assert.deepEqual(recommendationInsertMock.mock.calls[0]?.arguments[0], {
    user_id: '22222222-2222-4222-8222-222222222222',
    event_type: 'download_started',
    source_type: 'download',
    target_product_id: 'product-1',
    signal_payload: {
      purchase_id: 'purchase-1',
    },
  });
  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['product.download.success'],
  );
});

test('GET /api/download/[product_id] rejects invalid vault paths before signing', async () => {
  resetState();

  const createSignedUrlMock = mock.fn(async () => ({
    data: { signedUrl: 'https://files.example.test/signed/product.zip' },
    error: null,
  }));
  const purchaseQuery = new PurchaseQuery({
    data: { id: 'purchase-1', status: 'completed' },
    error: null,
  });
  const productQuery = new ProductQuery({
    data: {
      file_path_vault: 'digital_file/other-seller/product.zip',
      seller_id: 'seller-1',
    },
    error: null,
  });

  createClientImpl = async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: '33333333-3333-4333-8333-333333333333' } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === 'purchases') return purchaseQuery;
      if (table === 'products') return productQuery;
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, 'vault');
        return { createSignedUrl: createSignedUrlMock };
      },
    },
  });

  const GET = await loadGetHandler('invalid-vault-path');
  const response = await GET(new Request('http://localhost/api/download/product-1'), makeContext());

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Product file not found' });
  assert.equal(createSignedUrlMock.mock.callCount(), 0);
  assert.deepEqual(
    auditEvents.map((event) => event.eventType),
    ['product.download.failed.invalid_vault_path'],
  );
});

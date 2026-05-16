import { createHash, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type VendorLicenseIntegrationRow = {
  id: string;
  seller_id: string;
  enabled: boolean;
  api_secret: string | null;
  webhook_secret: string | null;
  webhook_url: string | null;
};

type ProductOwnerRow = {
  id: string;
  seller_id: string;
};

export type VendorIntegrationAuthSuccess = {
  ok: true;
  product: ProductOwnerRow;
  integration: VendorLicenseIntegrationRow;
  sellerId: string;
};

export type VendorIntegrationAuthFailure = {
  ok: false;
  status: number;
  error: string;
};

export type VendorIntegrationAuthResult = VendorIntegrationAuthSuccess | VendorIntegrationAuthFailure;

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

function secureCompareToken(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();

  if (providedDigest.length !== expectedDigest.length) return false;
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function authenticateVendorIntegrationByProduct(params: {
  admin: SupabaseClient;
  productId: string;
  authorizationHeader: string | null;
}): Promise<VendorIntegrationAuthResult> {
  const token = extractBearerToken(params.authorizationHeader);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing or invalid Authorization header' };
  }

  const { data: product, error: productError } = await params.admin
    .from('products')
    .select('id, seller_id')
    .eq('id', params.productId)
    .maybeSingle();

  if (productError) {
    console.error('Vendor integration auth product lookup failed:', productError);
    return { ok: false, status: 500, error: 'Failed to resolve product ownership' };
  }

  if (!product) {
    return { ok: false, status: 404, error: 'Product not found' };
  }

  const { data: integration, error: integrationError } = await params.admin
    .from('vendor_license_integrations')
    .select('id, seller_id, enabled, api_secret, webhook_secret, webhook_url')
    .eq('seller_id', product.seller_id)
    .maybeSingle();

  if (integrationError) {
    console.error('Vendor integration auth integration lookup failed:', integrationError);
    return { ok: false, status: 500, error: 'Failed to resolve vendor integration settings' };
  }

  if (!integration) {
    return { ok: false, status: 403, error: 'Vendor integration is not configured' };
  }

  if (!integration.enabled) {
    return { ok: false, status: 403, error: 'Vendor integration is disabled' };
  }

  const expectedToken = integration.api_secret ?? integration.webhook_secret;
  if (!expectedToken) {
    return { ok: false, status: 403, error: 'Vendor integration secret is missing' };
  }

  if (!secureCompareToken(token, expectedToken)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return {
    ok: true,
    product,
    integration,
    sellerId: product.seller_id,
  };
}

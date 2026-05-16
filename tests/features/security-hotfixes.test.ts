import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mock, test } from 'node:test';
import { resolveAuthoritativeCartCheckoutPrice } from '@/app/api/cart/_lib';
import {
  fetchWithServerSideUrlSafety,
  validateServerFetchUrl,
} from '@/lib/security/server-url-safety';

function readHotfixMigration(): string {
  const migrationName = readdirSync(resolve('supabase/migrations'))
    .find((name) => name.endsWith('_harden_security_scan_findings.sql'));
  assert.ok(migrationName, 'security hotfix migration should exist');
  return readFileSync(resolve('supabase/migrations', migrationName), 'utf8');
}

test('cart checkout ignores forged snapshots for fixed-price products', () => {
  assert.equal(
    resolveAuthoritativeCartCheckoutPrice({
      productPrice: '49.99',
      variantPriceOverride: null,
      isPwyw: false,
      minPrice: 0,
      priceSnapshot: 0.01,
    }),
    49.99,
  );

  assert.equal(
    resolveAuthoritativeCartCheckoutPrice({
      productPrice: '49.99',
      variantPriceOverride: '29.50',
      isPwyw: false,
      minPrice: 0,
      priceSnapshot: 0.01,
    }),
    29.5,
  );
});

test('cart checkout rejects PWYW snapshots below the allowed floor', () => {
  assert.equal(
    resolveAuthoritativeCartCheckoutPrice({
      productPrice: '10',
      variantPriceOverride: null,
      isPwyw: true,
      minPrice: '10',
      priceSnapshot: 0.01,
    }),
    null,
  );

  assert.equal(
    resolveAuthoritativeCartCheckoutPrice({
      productPrice: '10',
      variantPriceOverride: null,
      isPwyw: true,
      minPrice: '10',
      priceSnapshot: 12.345,
    }),
    12.35,
  );
});

test('server fetch URL validation blocks private image egress targets', async () => {
  const resolveHostname = async (hostname: string) => {
    if (hostname === 'safe.example') return ['93.184.216.34'];
    if (hostname === 'private.example') return ['169.254.169.254'];
    return [];
  };

  await assert.rejects(
    validateServerFetchUrl('http://safe.example/image.png', { resolveHostname }),
    /blocked_url:invalid_protocol/,
  );
  await assert.rejects(
    validateServerFetchUrl('https://127.0.0.1/image.png', { resolveHostname }),
    /blocked_url:blocked_ip_literal/,
  );
  await assert.rejects(
    validateServerFetchUrl('https://private.example/image.png', { resolveHostname }),
    /blocked_url:blocked_resolved_ip/,
  );
  assert.equal(
    (await validateServerFetchUrl('https://safe.example/image.png', { resolveHostname })).toString(),
    'https://safe.example/image.png',
  );
});

test('server fetch URL validation checks redirect targets before following them', async () => {
  const resolveHostname = async (hostname: string) => {
    if (hostname === 'safe.example') return ['93.184.216.34'];
    if (hostname === 'private.example') return ['10.0.0.5'];
    return [];
  };

  const fetchMock = mock.method(globalThis, 'fetch', async () => (
    new Response(null, {
      status: 302,
      headers: { location: 'https://private.example/image.png' },
    })
  ));

  try {
    await assert.rejects(
      fetchWithServerSideUrlSafety('https://safe.example/source.png', {
        dependency: 'test_image',
        timeoutMs: 1000,
        resolveHostname,
      }),
      /blocked_url:blocked_resolved_ip/,
    );
  } finally {
    fetchMock.mock.restore();
  }
});

test('security hotfix migration hardens direct Supabase access', () => {
  const sql = readHotfixMigration();

  assert.match(sql, /CREATE TRIGGER normalize_cart_item_price_snapshot_before_write/);
  assert.match(sql, /NEW\.price_snapshot := v_server_price/);
  assert.match(sql, /p_seller_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.upsert_article_clap\(uuid, text, uuid, integer\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /ALTER VIEW public\.profile_marketplace_data SET \(security_invoker = true\)/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.profile_marketplace_data FROM PUBLIC, anon, authenticated/);
});

test('static hotfix checks cover edge paths that are not imported in node tests', () => {
  const embeddedCheckout = readFileSync(
    resolve('supabase/functions/stripe-embedded-checkout/index.ts'),
    'utf8',
  );
  const stripeWebhook = readFileSync(resolve('supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const downloadRoute = readFileSync(resolve('src/app/api/download/[product_id]/route.ts'), 'utf8');
  const newsPage = readFileSync(resolve('src/app/[locale]/(marketing)/news/[slug]/page.tsx'), 'utf8');

  assert.match(embeddedCheckout, /Invalid price for fixed-price product/);
  assert.match(stripeWebhook, /status: 'pending'/);
  assert.doesNotMatch(stripeWebhook, /dispatchLicenseIssuedWebhook/);
  assert.match(downloadRoute, /\.in\('status', \['completed', 'paid', 'fulfilled'\]\)/);
  assert.match(newsPage, /ALLOWED_LINK_PROTOCOLS = new Set\(\['http:', 'https:', 'mailto:'\]\)/);
  assert.match(newsPage, /sanitizeMarkdownHref/);
});

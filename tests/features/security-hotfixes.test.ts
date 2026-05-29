import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { mock, test } from 'node:test';
import { resolveAuthoritativeCartCheckoutPrice } from '@/app/api/cart/_lib';
import {
  fetchWithServerSideUrlSafety,
  validateServerFetchUrl,
} from '@/lib/security/server-url-safety';
import { isOptionalSellerVaultPath, isSellerVaultPath } from '@/lib/vendor/vault-path';

function readHotfixMigration(): string {
  const migrationName = readdirSync(resolve('supabase/migrations'))
    .find((name) => name.endsWith('_harden_security_scan_findings.sql'));
  assert.ok(migrationName, 'security hotfix migration should exist');
  return readFileSync(resolve('supabase/migrations', migrationName), 'utf8');
}

function readMigration(name: string): string {
  return readFileSync(resolve('supabase/migrations', name), 'utf8');
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

test('security remediation migration limits sensitive RPCs to service role', () => {
  const sql = readMigration('20261013000000_harden_security_remediations.sql');

  for (const signature of [
    'reserve_news_inventory\\(uuid, text, integer, text, timestamptz\\)',
    'confirm_news_inventory\\(uuid\\)',
    'upsert_article_clap\\(uuid, text, uuid, integer\\)',
    'log_audit_event\\(text, uuid, jsonb, jsonb, jsonb\\)',
    'check_rate_limit_detailed\\(text, integer, integer\\)',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC, anon, authenticated`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature} TO service_role`));
  }
});

test('seller vault paths must stay under the authenticated seller prefix', () => {
  assert.equal(isSellerVaultPath('digital_file/seller-1/file.zip', 'seller-1'), true);
  assert.equal(isOptionalSellerVaultPath(null, 'seller-1'), true);
  assert.equal(isSellerVaultPath('digital_file/seller-2/file.zip', 'seller-1'), false);
  assert.equal(isSellerVaultPath('covers/seller-1/file.png', 'seller-1'), false);
  assert.equal(isSellerVaultPath('digital_file/seller-1/../seller-2/file.zip', 'seller-1'), false);
});

test('static hotfix checks cover edge paths that are not imported in node tests', () => {
  const embeddedCheckout = readFileSync(
    resolve('supabase/functions/stripe-embedded-checkout/index.ts'),
    'utf8',
  );
  const stripeWebhook = readFileSync(resolve('supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const downloadRoute = readFileSync(resolve('src/app/api/download/[product_id]/route.ts'), 'utf8');
  const newsArticleMarkdown = readFileSync(
    resolve('src/features/ai-recap/lib/news-article-markdown.tsx'),
    'utf8',
  );
  const weeklyAiRecapEdgeFunction = readFileSync(
    resolve('supabase/functions/weekly-ai-recap-cron/index.ts'),
    'utf8',
  );

  assert.match(embeddedCheckout, /Invalid price for fixed-price product/);
  assert.match(stripeWebhook, /status: 'pending'/);
  assert.doesNotMatch(stripeWebhook, /dispatchLicenseIssuedWebhook/);
  assert.match(downloadRoute, /\.in\('status', \['completed', 'paid', 'fulfilled'\]\)/);
  assert.match(newsArticleMarkdown, /ALLOWED_LINK_PROTOCOLS = new Set\(\['http:', 'https:', 'mailto:'\]\)/);
  assert.match(newsArticleMarkdown, /sanitizeMarkdownHref/);
  assert.match(weeklyAiRecapEdgeFunction, /async function blockDisabledDirectRun/);
  assert.match(weeklyAiRecapEdgeFunction, /Deno\.env\.get\('AGENT_CRON_KILL_SWITCH'\)/);
  assert.match(weeklyAiRecapEdgeFunction, /Deno\.env\.get\('AGENT_CRON_DISABLE_WEEKLY_RECAP'\)/);
  assert.match(weeklyAiRecapEdgeFunction, /if \(mode === 'tick'\) return null/);
  assert.match(weeklyAiRecapEdgeFunction, /const directRunBlock = await blockDisabledDirectRun\(mode\)/);
});

test('security remediation static checks cover async payments, RPC auth, SSRF, and samples', () => {
  const stripeWebhook = readFileSync(resolve('supabase/functions/stripe-webhook/index.ts'), 'utf8');
  const rateLimiter = readFileSync(resolve('src/lib/security/rate-limiter.ts'), 'utf8');
  const licenseRoute = readFileSync(resolve('src/app/api/cron/license-webhooks/route.ts'), 'utf8');
  const pinnedWebhookHttp = readFileSync(
    resolve('src/features/licenses/server/pinned-webhook-http.ts'),
    'utf8',
  );
  const connectSampleAccess = readFileSync(resolve('src/lib/stripe/connect-sample-access.ts'), 'utf8');
  const officialConnectRoute = readFileSync(resolve('src/app/api/stripe/connect/route.ts'), 'utf8');
  const adminRecapRunRoute = readFileSync(
    resolve('src/app/api/admin/weekly-ai-recap/run/route.ts'),
    'utf8',
  );
  const syncSecrets = readFileSync(resolve('sync_secrets.py'), 'utf8');
  const checkStatus = readFileSync(resolve('check_status.py'), 'utf8');
  const triggerRecap = readFileSync(resolve('trigger_recap.py'), 'utf8');
  const secretScan = readFileSync(resolve('scripts/secret-scan.mjs'), 'utf8');

  assert.match(stripeWebhook, /checkout\.session\.async_payment_succeeded/);
  assert.match(stripeWebhook, /checkout\.session\.async_payment_failed/);
  assert.match(stripeWebhook, /resolveCheckoutPaymentReadiness/);
  assert.match(stripeWebhook, /payment_not_settled/);
  assert.match(stripeWebhook, /session\.payment_status === 'no_payment_required' && isZeroAmountCheckout/);

  assert.match(rateLimiter, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(rateLimiter, /Authorization: `Bearer \$\{serviceRoleKey\}`/);
  assert.doesNotMatch(rateLimiter, /supabaseAnonKey/);

  assert.match(licenseRoute, /export const runtime = 'nodejs'/);
  assert.match(pinnedWebhookHttp, /lookup:/);
  assert.match(pinnedWebhookHttp, /servername:/);
  assert.match(pinnedWebhookHttp, /Host: parsedUrl\.host/);

  assert.match(connectSampleAccess, /ENABLE_STRIPE_CONNECT_SAMPLE/);
  assert.match(connectSampleAccess, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(connectSampleAccess, /isSellerRole/);
  assert.doesNotMatch(officialConnectRoute, /connect-sample-access/);

  assert.doesNotMatch(adminRecapRunRoute, /CRON_SECRET|cron-bypass|isAuthorizedByAnyBearerSecret/);

  assert.match(syncSecrets, /"--from-dotenv"/);
  assert.doesNotMatch(syncSecrets, /dotenv_values|KEY=VALUE/);
  assert.match(checkStatus, /required_env\("AGENT_INTERNAL_TOKEN"\)/);
  assert.match(triggerRecap, /required_env\("MODAL_AGENT_API_URL"\)/);
  assert.match(secretScan, /Hardcoded long secret token assignment/);
});

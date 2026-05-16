import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('vendor product contract stores canonical private-file fields', () => {
  const route = read('src/app/api/vendor/products/route.ts');
  const stepper = read('src/features/dashboard/components/ProductCreationStepper.tsx');
  const upload = read('src/app/api/vendor/uploads/route.ts');

  assert.match(stepper, /cover_image_url:/);
  assert.match(stepper, /file_path_vault:/);
  assert.doesNotMatch(stepper, /enable_pwyw:/);
  assert.match(route, /cover_image_url: coverImageUrl/);
  assert.match(route, /file_path_vault: filePathVault/);
  assert.match(route, /is_pwyw: isPwyw/);
  assert.match(route, /A paid published product must have a private vault file/);
  assert.match(upload, /const bucket = isImageUpload \? 'covers' : 'vault'/);
});

test('cart checkout freezes immutable Stripe session item snapshots', () => {
  const checkout = read('src/app/api/cart/checkout/route.ts');
  const cartLib = read('src/app/api/cart/_lib.ts');
  const migration = read('supabase/migrations/20260502000000_marketplace_production_foundations.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.checkout_session_items/);
  assert.match(checkout, /\.from\('checkout_session_items'\)/);
  assert.match(checkout, /stripe_checkout_session_id: session\.id/);
  assert.match(checkout, /application_fee_cents/);
  assert.match(cartLib, /Cart checkout is already in progress/);
});

test('Stripe webhook materializes commerce records from snapshots and handles stale locks', () => {
  const webhook = read('supabase/functions/stripe-webhook/index.ts');

  assert.match(webhook, /\.from\('checkout_session_items'\)/);
  assert.match(webhook, /resolveOrCreateCommerceOrder/);
  assert.match(webhook, /resolveOrCreateCommercePayment/);
  assert.match(webhook, /resolveOrCreateCommerceOrderItem/);
  assert.match(webhook, /WEBHOOK_PROCESSING_STALE_MS/);
  assert.match(webhook, /checkout\.session\.expired/);
  assert.match(webhook, /payment_intent\.payment_failed/);
  assert.match(webhook, /charge\.refunded/);
});

test('CI blocks secrets and runs production gates', () => {
  const workflow = read('.github/workflows/ci.yml');
  const packageJson = read('package.json');
  const secretScan = read('scripts/secret-scan.mjs');

  assert.match(packageJson, /"scan:secrets": "node scripts\/secret-scan\.mjs"/);
  assert.match(workflow, /pnpm run scan:secrets/);
  assert.match(workflow, /pnpm run typecheck/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /pnpm run build/);
  assert.match(workflow, /pnpm run check:migrations/);
  assert.match(secretScan, /Stripe live secret key/);
});

test('phase 4 to 6 surfaces exist for vendor edit, finance ops, replay, analytics periods, and funnel tracking', () => {
  const editPage = read('src/app/[locale]/vendor/products/[productId]/edit/page.tsx');
  const editForm = read('src/features/dashboard/components/ProductEditForm.tsx');
  const editApi = read('src/app/api/vendor/products/[productId]/route.ts');
  const analytics = read('src/app/api/seller/analytics/route.ts');
  const finance = read('src/app/[locale]/admin/finance/page.tsx');
  const replay = read('src/app/api/admin/api-monitoring/stripe-webhooks/[eventId]/replay/route.ts');
  const cron = read('src/lib/cron/task-dispatcher.ts');
  const migration = read('supabase/migrations/20260502000000_marketplace_production_foundations.sql');

  assert.match(editPage, /ProductEditForm/);
  assert.match(editForm, /file_path_vault/);
  assert.match(editApi, /export async function PATCH/);
  assert.match(analytics, /'7d'.*'30d'.*'90d'.*'12m'/s);
  assert.match(finance, /Finance operations/);
  assert.match(replay, /replay_event_id/);
  assert.match(cron, /CRON_TASK_MATRIX/);
  assert.match(migration, /seller_daily_analytics/);
});

test('funnel tracking events are captured server-side', () => {
  const cart = read('src/app/api/cart/route.ts');
  const checkout = read('src/app/api/cart/checkout/route.ts');
  const download = read('src/app/api/download/[product_id]/route.ts');
  const incidents = read('src/app/api/order-incidents/route.ts');
  const webhook = read('supabase/functions/stripe-webhook/index.ts');

  assert.match(cart, /event_type: 'add_to_cart'/);
  assert.match(checkout, /event_type: 'checkout_started'/);
  assert.match(webhook, /event_type: 'checkout_completed'/);
  assert.match(download, /event_type: 'download_started'/);
  assert.match(incidents, /event_type: 'refund_requested'/);
});

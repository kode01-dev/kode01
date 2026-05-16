import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl, getServerEnv } from '@/lib/env/server';
import type { Database } from '@/types/database.types';

const ABANDON_THRESHOLD_MINUTES = 30;
const DEFAULT_ENQUEUE_BATCH_SIZE = 500;
const DEFAULT_SEND_BATCH_SIZE = 25;
const MAX_SEND_ATTEMPTS = 5;

type CartItem = {
  id: string;
  price_snapshot: number | string;
  products:
    | { title?: string | null; slug?: string | null }
    | Array<{ title?: string | null; slug?: string | null }>
    | null;
};

type AbandonedCartJob = {
  id: string;
  attempts: number;
  cart_id: string;
  user_id: string;
  cart:
    | {
        id: string;
        status: string;
        user_id: string;
        cart_items: CartItem[] | null;
      }
    | Array<{
        id: string;
        status: string;
        user_id: string;
        cart_items: CartItem[] | null;
      }>
    | null;
};

type AdminDb = SupabaseClient<Database>;

function parseBatchSize(value: number | string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return 1;
  if (normalized > max) return max;
  return normalized;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCart(job: AbandonedCartJob) {
  if (Array.isArray(job.cart)) return job.cart[0] ?? null;
  return job.cart;
}

function buildAbandonedCartEmailHtml(options: {
  buyerName: string;
  cartUrl: string;
  itemTitles: string[];
  subtotal: number;
}) {
  const itemsPreview = options.itemTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join('');
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
      <h2>Vous avez des articles qui vous attendent.</h2>
      <p>Bonjour ${escapeHtml(options.buyerName)},</p>
      <p>Votre panier KODE01 est toujours actif depuis plus de ${ABANDON_THRESHOLD_MINUTES} minutes.</p>
      <p><strong>Sous-total:</strong> $${options.subtotal.toFixed(2)} CAD</p>
      <ul>
        ${itemsPreview}
      </ul>
      <p style="margin: 18px 0;">
        <a href="${options.cartUrl}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#111827;color:#fff;text-decoration:none;font-weight:700;">
          Reprendre mon checkout
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">Email automatique KODE01.</p>
    </div>
  `;
}

async function markJobSkipped(db: AdminDb, jobId: string, message: string) {
  await db
    .from('abandoned_cart_email_jobs')
    .update({
      status: 'skipped',
      error_message: message,
      locked_at: null,
    })
    .eq('id', jobId);
}

async function markJobFailed(db: AdminDb, job: AbandonedCartJob, message: string) {
  const nextAttempts = (job.attempts ?? 0) + 1;
  await db
    .from('abandoned_cart_email_jobs')
    .update({
      status: nextAttempts >= MAX_SEND_ATTEMPTS ? 'failed' : 'pending',
      attempts: nextAttempts,
      scheduled_for: new Date(Date.now() + Math.min(60, nextAttempts * 10) * 60_000).toISOString(),
      error_message: message,
      locked_at: null,
    })
    .eq('id', job.id);
}

export async function enqueueAbandonedCartEmailJobs() {
  const env = getServerEnv();
  const admin = createAdminClient();
  const db = admin;
  const batchSize = parseBatchSize(env.ABANDONED_CART_BATCH_SIZE, DEFAULT_ENQUEUE_BATCH_SIZE, 1000);
  const cutoffIso = new Date(Date.now() - ABANDON_THRESHOLD_MINUTES * 60_000).toISOString();

  const { data: carts, error: fetchError } = await db
    .from('carts')
    .select('id, user_id')
    .eq('status', 'active')
    .lte('updated_at', cutoffIso)
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  if (fetchError) throw fetchError;

  const rows = (carts ?? []).map((cart: { id: string; user_id: string }) => ({
    cart_id: cart.id,
    user_id: cart.user_id,
    status: 'pending',
    scheduled_for: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return { scanned: 0, enqueuedCandidates: 0 };
  }

  const { error: upsertError } = await db
    .from('abandoned_cart_email_jobs')
    .upsert(rows, { onConflict: 'cart_id', ignoreDuplicates: true });

  if (upsertError) throw upsertError;

  return {
    scanned: rows.length,
    enqueuedCandidates: rows.length,
  };
}

export async function processAbandonedCartEmailJobs() {
  const env = getServerEnv();
  if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required in production');
  }

  const admin = createAdminClient();
  const db = admin;
  const resend = new Resend(env.RESEND_API_KEY);
  const batchSize = parseBatchSize(env.ABANDONED_CART_SEND_BATCH_SIZE, DEFAULT_SEND_BATCH_SIZE, 100);
  const nowIso = new Date().toISOString();

  const { data: candidateJobs, error: fetchError } = await db
    .from('abandoned_cart_email_jobs')
    .select('id')
    .in('status', ['pending', 'failed'])
    .lt('attempts', MAX_SEND_ATTEMPTS)
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(batchSize);

  if (fetchError) throw fetchError;

  const candidateIds = (candidateJobs ?? []).map((job: { id: string }) => job.id);
  if (candidateIds.length === 0) {
    return { processed: 0, emailed: 0, skipped: 0, errorCount: 0, errors: [] };
  }

  const { data: lockedJobs, error: lockError } = await db
    .from('abandoned_cart_email_jobs')
    .update({ status: 'processing', locked_at: nowIso })
    .in('id', candidateIds)
    .in('status', ['pending', 'failed'])
    .select(`
      id,
      attempts,
      cart_id,
      user_id,
      cart:carts!cart_id(
        id,
        status,
        user_id,
        cart_items(
          id,
          price_snapshot,
          products(title, slug)
        )
      )
    `);

  if (lockError) throw lockError;

  let processed = 0;
  let emailed = 0;
  let skipped = 0;
  const errors: Array<{ jobId: string; cartId: string; message: string }> = [];
  const appBaseUrl = getAppBaseUrl();
  const cartUrl = `${appBaseUrl}/en/market`;
  const from = env.RESEND_FROM_EMAIL?.trim() || 'kode01 <onboarding@resend.dev>';

  for (const job of (lockedJobs ?? []) as unknown as AbandonedCartJob[]) {
    processed += 1;
    const cart = getCart(job);
    const cartItems = cart?.cart_items ?? [];

    if (!cart || cart.status !== 'active') {
      skipped += 1;
      await markJobSkipped(db, job.id, 'Cart is no longer active');
      continue;
    }

    if (cartItems.length === 0) {
      skipped += 1;
      await markJobSkipped(db, job.id, 'Cart has no items');
      continue;
    }

    const { data: authUserResult, error: authUserError } = await admin.auth.admin.getUserById(job.user_id);
    if (authUserError || !authUserResult.user?.email) {
      skipped += 1;
      await markJobSkipped(db, job.id, authUserError?.message ?? 'Missing user email');
      continue;
    }

    const subtotal = cartItems.reduce((total, item) => total + toNumber(item.price_snapshot), 0);
    const itemTitles = cartItems.slice(0, 6).map((item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return product?.title ?? 'Digital product';
    });

    try {
      await resend.emails.send({
        from,
        to: [authUserResult.user.email],
        subject: 'Votre panier KODE01 vous attend',
        html: buildAbandonedCartEmailHtml({
          buyerName: authUserResult.user.user_metadata?.display_name ?? authUserResult.user.email.split('@')[0] ?? 'Client',
          cartUrl,
          itemTitles,
          subtotal,
        }),
      });

      const sentAt = new Date().toISOString();
      await db
        .from('abandoned_cart_email_jobs')
        .update({
          status: 'sent',
          sent_at: sentAt,
          error_message: null,
          locked_at: null,
        })
        .eq('id', job.id);

      await db
        .from('carts')
        .update({ status: 'abandoned_notified' })
        .eq('id', cart.id)
        .eq('status', 'active');

      emailed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ jobId: job.id, cartId: job.cart_id, message });
      await markJobFailed(db, job, message);
    }
  }

  return {
    processed,
    emailed,
    skipped,
    errorCount: errors.length,
    errors,
  };
}

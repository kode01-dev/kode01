import { getEdgeEnv } from '../_shared/env.ts';
import {
  internalServerError,
  isCronAuthorized,
  json,
  methodNotAllowed,
  unauthorized,
} from '../_shared/http.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const DEFAULT_SEND_EMAILS_BATCH_SIZE = 25;
const DEFAULT_SEND_EMAILS_TIMEOUT_MS = 8_000;

type PendingEmail = {
  id: string;
  email_type: string;
  buyer?: {
    email?: string | null;
    display_name?: string | null;
  } | null;
  purchase?: {
    products?: {
      title?: string | null;
      slug?: string | null;
    } | null;
    license_keys?: Array<{ key?: string | null }> | null;
  } | null;
};

function parseNumberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
}

function getSubject(emailType: string, productTitle: string) {
  switch (emailType) {
    case 'purchase_confirmation':
      return `Confirmation de votre achat : ${productTitle}`;
    case 'day_1_followup':
      return `Alors, que pensez-vous de ${productTitle} ?`;
    case 'day_7_review':
      return `Partagez votre avis sur ${productTitle}`;
    default:
      return `Mise a jour pour votre achat : ${productTitle}`;
  }
}

function renderEmailHtml(options: {
  buyerName: string;
  productTitle: string;
  productLink: string;
  reviewHubLink: string;
  licenseKey?: string;
  emailType: string;
}) {
  const { buyerName, productTitle, productLink, reviewHubLink, licenseKey, emailType } = options;
  const licenseBlock = licenseKey
    ? `<p><strong>Cle de licence :</strong> <code>${licenseKey}</code></p>`
    : '';
  const isReviewEmail = emailType === 'day_7_review';
  const introText = emailType === 'purchase_confirmation'
    ? 'Merci pour votre achat.'
    : isReviewEmail
      ? 'Une semaine apres votre achat, votre retour peut aider d autres acheteurs et mettre en avant les meilleurs produits.'
      : 'Petit suivi concernant votre achat.';
  const primaryUrl = isReviewEmail ? reviewHubLink : productLink;
  const primaryLabel = isReviewEmail ? 'Laisser mon avis' : 'Acceder au produit';
  const secondaryLabel = isReviewEmail
    ? 'Lien direct pour noter ce produit'
    : 'Lien direct vers votre produit';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827;">
      <h2>Bonjour ${buyerName},</h2>
      <p>${introText}</p>
      <p><strong>Produit:</strong> ${productTitle}</p>
      ${licenseBlock}
      <p style="margin: 16px 0;">
        <a
          href="${primaryUrl}"
          style="display:inline-block;padding:12px 18px;border-radius:999px;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;"
        >
          ${primaryLabel}
        </a>
      </p>
      <p>${secondaryLabel}: <a href="${primaryUrl}">${primaryUrl}</a></p>
      <hr style="margin: 24px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">Email automatique KODE01.</p>
    </div>
  `;
}

async function sendEmailViaResend(payload: {
  to: string;
  subject: string;
  html: string;
  timeoutMs: number;
}) {
  const env = getEdgeEnv();
  if (!env.resendApiKey) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'kode01 <onboarding@resend.dev>';
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), payload.timeoutMs);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Resend API error (${response.status}): ${message}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Resend API timeout after ${payload.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed();
  if (!isCronAuthorized(req)) return unauthorized();

  try {
    const now = new Date().toISOString();
    const batchSize = parseNumberEnv('SEND_EMAILS_BATCH_SIZE', DEFAULT_SEND_EMAILS_BATCH_SIZE, 1, 100);
    const resendTimeoutMs = parseNumberEnv('SEND_EMAILS_TIMEOUT_MS', DEFAULT_SEND_EMAILS_TIMEOUT_MS, 1000, 60000);

    const { data: pendingEmails, error: fetchError } = await supabaseAdmin
      .from('scheduled_emails')
      .select(`
        id,
        email_type,
        buyer:profiles!buyer_id(email, display_name),
        purchase:purchases!purchase_id(
          products!product_id(title, slug),
          license_keys(key)
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(batchSize);

    if (fetchError) {
      console.error('Failed to fetch pending emails:', fetchError);
      return internalServerError();
    }

    const results: Array<{ id: string; status: 'success' | 'failed'; error?: string }> = [];

    for (const email of (pendingEmails ?? []) as PendingEmail[]) {
      try {
        const buyerEmail = email.buyer?.email;
        if (!buyerEmail) throw new Error('Missing buyer email');

        const productTitle = email.purchase?.products?.title || 'Votre produit';
        const productSlug = email.purchase?.products?.slug;
        const licenseKey = email.purchase?.license_keys?.[0]?.key || undefined;
        const appBaseUrl = getEdgeEnv().appBaseUrl;
        const productLink = productSlug
          ? `${appBaseUrl}/products/${productSlug}`
          : appBaseUrl;
        const reviewHubLink = productSlug
          ? `${appBaseUrl}/buyer/reviews?product=${encodeURIComponent(productSlug)}`
          : `${appBaseUrl}/buyer/reviews`;

        await sendEmailViaResend({
          to: buyerEmail,
          subject: getSubject(email.email_type, productTitle),
          html: renderEmailHtml({
            buyerName: email.buyer?.display_name || 'Client',
            productTitle,
            productLink,
            reviewHubLink,
            licenseKey,
            emailType: email.email_type,
          }),
          timeoutMs: resendTimeoutMs,
        });

        await supabaseAdmin
          .from('scheduled_emails')
          .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
          .eq('id', email.id);

        results.push({ id: email.id, status: 'success' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to send email ${email.id}:`, error);

        await supabaseAdmin
          .from('scheduled_emails')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', email.id);

        results.push({ id: email.id, status: 'failed', error: errorMessage });
      }
    }

    return json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('send-emails-cron error:', error);
    return internalServerError();
  }
});


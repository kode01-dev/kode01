import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
  computeConnectAccountStatus,
  getStripeClientForConnectSample,
  getStripeConnectThinWebhookSecret,
} from '@/lib/stripe/connect-sample';
import { trackInboundApiCallFromRequest } from '@/features/api-monitoring/server/tracker';

const REQUIREMENTS_UPDATED_EVENT = 'v2.core.account[requirements].updated';
const RECIPIENT_CAPABILITY_UPDATED_EVENT =
  'v2.core.account[configuration.recipient].capability_status_updated';

function isUniqueConstraintError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate key') === true;
}

function resolveRelatedAccountId(event: Stripe.V2.Core.Event): string | null {
  if ('related_object' in event && event.related_object?.id) {
    return event.related_object.id;
  }

  return null;
}

async function syncConnectedAccountStatus(accountId: string) {
  const stripeClient = getStripeClientForConnectSample();
  const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
    include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
  });

  const accountStatus = computeConnectAccountStatus(account);
  const supabaseAdmin = createAdminClient();

  // We collect requirement/capability updates by synchronizing status fields
  // on the mapped user profile for this connected account.
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      stripe_charges_enabled: accountStatus.readyToReceivePayments,
      stripe_payouts_enabled: accountStatus.readyToReceivePayments,
      stripe_details_submitted: accountStatus.onboardingComplete,
      stripe_onboarding_completed_at: accountStatus.onboardingComplete ? new Date().toISOString() : null,
    })
    .eq('stripe_account_id', accountId);

  if (error) {
    throw new Error(`Failed to sync connected account status: ${error.message}`);
  }

  return accountStatus;
}

async function markEventAsProcessed(eventId: string, status: 'processed' | 'failed', errorMessage?: string) {
  const supabaseAdmin = createAdminClient();
  await supabaseAdmin
    .from('stripe_webhook_events')
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId);
}

/**
 * Handles thin webhook events for Stripe Connect v2 account updates.
 * This endpoint expects payload style "Thin" from Stripe Event Destinations.
 */
export async function POST(req: Request) {
  const monitorStartedAt = Date.now();
  const respond = async (
    payload: Record<string, unknown>,
    status = 200,
    metadata?: Record<string, unknown>,
  ) => {
    await trackInboundApiCallFromRequest({
      request: req,
      endpoint: '/api/webhooks/stripe-connect-thin',
      startedAt: monitorStartedAt,
      statusCode: status,
      metadata,
    });
    return NextResponse.json(payload, { status });
  };

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return respond({ error: 'Missing stripe-signature header' }, 400, {
      failure_type: 'missing_signature',
    });
  }

  const rawBody = await req.text();

  let thinEvent: Stripe.V2.Core.EventNotification;
  try {
    const stripeClient = getStripeClientForConnectSample();
    const webhookSecret = getStripeConnectThinWebhookSecret();
    thinEvent = stripeClient.parseEventNotification(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook signature';
    return respond({ error: message }, 400, {
      failure_type: 'invalid_signature',
      error_message: message,
    });
  }

  const supabaseAdmin = createAdminClient();
  const { error: lockError } = await supabaseAdmin.from('stripe_webhook_events').insert({
    event_id: thinEvent.id,
    type: thinEvent.type,
    status: 'processing',
  });

  if (lockError) {
    if (isUniqueConstraintError(lockError)) {
      return respond(
        { received: true, duplicate: true },
        200,
        { business_status: 'duplicate_event', event_id: thinEvent.id },
      );
    }

    return respond(
      { error: `Failed to lock event: ${lockError.message}` },
      500,
      { failure_type: 'lock_failed', error_message: lockError.message, event_id: thinEvent.id },
    );
  }

  try {
    // For thin payloads we fetch the full event details after signature verification.
    const stripeClient = getStripeClientForConnectSample();
    const fullEvent = await stripeClient.v2.core.events.retrieve(thinEvent.id);
    const accountId = resolveRelatedAccountId(fullEvent);

    if (
      (fullEvent.type === REQUIREMENTS_UPDATED_EVENT ||
        fullEvent.type === RECIPIENT_CAPABILITY_UPDATED_EVENT) &&
      accountId
    ) {
      await syncConnectedAccountStatus(accountId);
    }

    await markEventAsProcessed(thinEvent.id, 'processed');
    return respond(
      { received: true, eventId: thinEvent.id, type: thinEvent.type },
      200,
      { business_status: 'processed', event_id: thinEvent.id },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    await markEventAsProcessed(thinEvent.id, 'failed', message);
    return respond(
      { error: message },
      500,
      { failure_type: 'processing_failed', error_message: message, event_id: thinEvent.id },
    );
  }
}

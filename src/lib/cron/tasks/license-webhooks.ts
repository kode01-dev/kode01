import { createAdminClient } from '@/lib/supabase/admin';
import { getServerEnv } from '@/lib/env/server';
import { trackExternalApiCallEvent } from '@/features/api-monitoring/server/tracker';
import {
  buildLicenseWebhookSignature,
  computeLicenseWebhookRetryDelaySeconds,
  truncateWebhookResponseBody,
} from '@/features/licenses/server/webhook-delivery';
import { postWebhookWithPinnedDns } from '@/features/licenses/server/pinned-webhook-http';
import { validateWebhookEndpointUrl } from '@/features/licenses/server/webhook-url-safety';
import { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_DELIVERY_BATCH_SIZE = 25;
const DEFAULT_DELIVERY_TIMEOUT_MS = 6_000;

type DeliveryRow = {
  id: string;
  event_id: string;
  event_type: string;
  seller_id: string;
  endpoint_url: string;
  payload: unknown;
  signature: string | null;
  status: 'pending' | 'retrying' | 'sent' | 'failed' | 'cancelled';
  attempt_count: number;
  max_attempts: number;
};

type IntegrationSecretRow = {
  seller_id: string;
  webhook_secret: string | null;
};

function resolveDeliveryBatchSize(env: Record<string, unknown>) {
  const envValue = env.LICENSE_WEBHOOK_BATCH_SIZE;
  const value = typeof envValue === 'number' ? envValue : DEFAULT_DELIVERY_BATCH_SIZE;
  return Number.isInteger(value) && value >= 1 && value <= 200
    ? value
    : DEFAULT_DELIVERY_BATCH_SIZE;
}

function resolveDeliveryTimeoutMs(env: Record<string, unknown>) {
  const envValue = env.LICENSE_WEBHOOK_TIMEOUT_MS;
  const value = typeof envValue === 'number' ? envValue : DEFAULT_DELIVERY_TIMEOUT_MS;
  return Number.isInteger(value) && value >= 1_000 && value <= 60_000
    ? value
    : DEFAULT_DELIVERY_TIMEOUT_MS;
}

async function preloadWebhookSecrets(
  admin: SupabaseClient,
  deliveries: DeliveryRow[],
): Promise<Map<string, string>> {

  const sellerIds = Array.from(
    new Set(deliveries.filter((delivery) => !delivery.signature).map((delivery) => delivery.seller_id)),
  ).filter((sellerId) => sellerId.length > 0);

  if (sellerIds.length === 0) return new Map<string, string>();

  const { data, error } = await admin
    .from('vendor_license_integrations')
    .select('seller_id, webhook_secret')
    .in('seller_id', sellerIds);

  if (error) {
    console.error('Failed to preload webhook signature secrets for cron batch:', error);
    return new Map<string, string>();
  }

  const secretBySellerId = new Map<string, string>();
  for (const row of (data ?? []) as IntegrationSecretRow[]) {
    if (row.seller_id && row.webhook_secret) {
      secretBySellerId.set(row.seller_id, row.webhook_secret);
    }
  }

  return secretBySellerId;
}

function resolveDeliverySignature(
  delivery: DeliveryRow,
  payloadText: string,
  secretBySellerId: Map<string, string>,
): string | null {
  if (delivery.signature) return delivery.signature;
  const webhookSecret = secretBySellerId.get(delivery.seller_id);
  if (!webhookSecret) return null;
  return buildLicenseWebhookSignature(payloadText, webhookSecret);
}

async function markDeliveryResult(params: {
  admin: SupabaseClient;
  delivery: DeliveryRow;
  signature: string | null;
  succeeded: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  lastError: string | null;
}) {
  const attemptCount = params.delivery.attempt_count + 1;
  const now = new Date();

  if (params.succeeded) {
    await params.admin
      .from('license_webhook_deliveries')
      .update({
        signature: params.signature,
        status: 'sent',
        attempt_count: attemptCount,
        last_attempt_at: now.toISOString(),
        delivered_at: now.toISOString(),
        last_response_status: params.responseStatus,
        last_response_body: truncateWebhookResponseBody(params.responseBody),
        last_error: null,
        updated_at: now.toISOString(),
      })
      .eq('id', params.delivery.id);
    return 'sent' as const;
  }

  const exhausted = attemptCount >= params.delivery.max_attempts;
  const nextAttemptAt = exhausted
    ? now
    : new Date(now.getTime() + computeLicenseWebhookRetryDelaySeconds(attemptCount) * 1000);

  await params.admin
    .from('license_webhook_deliveries')
    .update({
      signature: params.signature,
      status: exhausted ? 'failed' : 'retrying',
      attempt_count: attemptCount,
      last_attempt_at: now.toISOString(),
      next_attempt_at: nextAttemptAt.toISOString(),
      last_response_status: params.responseStatus,
      last_response_body: truncateWebhookResponseBody(params.responseBody),
      last_error: params.lastError,
      updated_at: now.toISOString(),
    })
    .eq('id', params.delivery.id);

  return exhausted ? ('failed' as const) : ('retrying' as const);
}

async function dispatchDelivery(params: {
  admin: SupabaseClient;
  delivery: DeliveryRow;
  requestId: string;
  secretBySellerId: Map<string, string>;
  timeoutMs: number;
}) {
  const payloadText = JSON.stringify(params.delivery.payload ?? {});
  const signature = resolveDeliverySignature(params.delivery, payloadText, params.secretBySellerId);
  const endpointValidation = await validateWebhookEndpointUrl(params.delivery.endpoint_url);

  if (!signature) {
    await trackExternalApiCallEvent({
      endpoint: 'license_webhook_delivery',
      channel: 'outbound',
      method: 'POST',
      statusCode: null,
      success: false,
      durationMs: 0,
      requestId: params.requestId,
      metadata: {
        failure_type: 'missing_signature_secret',
        delivery_id: params.delivery.id,
        event_id: params.delivery.event_id,
        event_type: params.delivery.event_type,
        seller_id: params.delivery.seller_id,
        endpoint_url: params.delivery.endpoint_url,
        attempt_count: params.delivery.attempt_count,
      },
    });
    return markDeliveryResult({
      admin: params.admin,
      delivery: params.delivery,
      signature: null,
      succeeded: false,
      responseStatus: null,
      responseBody: null,
      lastError: 'missing_webhook_signature_secret',
    });
  }

  if (!endpointValidation.ok) {
    await trackExternalApiCallEvent({
      endpoint: 'license_webhook_delivery',
      channel: 'outbound',
      method: 'POST',
      statusCode: null,
      success: false,
      durationMs: 0,
      requestId: params.requestId,
      metadata: {
        failure_type: 'blocked_ssrf',
        ssrf_reason: endpointValidation.reason,
        ssrf_details: endpointValidation.details ?? null,
        delivery_id: params.delivery.id,
        event_id: params.delivery.event_id,
        event_type: params.delivery.event_type,
        seller_id: params.delivery.seller_id,
        endpoint_url: params.delivery.endpoint_url,
        attempt_count: params.delivery.attempt_count,
      },
    });
    return markDeliveryResult({
      admin: params.admin,
      delivery: params.delivery,
      signature,
      succeeded: false,
      responseStatus: null,
      responseBody: null,
      lastError: `blocked_ssrf:${endpointValidation.reason}`,
    });
  }

  const startedAt = Date.now();

  try {
    const response = await postWebhookWithPinnedDns({
      url: endpointValidation.normalizedUrl,
      resolvedAddresses: endpointValidation.resolvedAddresses,
      headers: {
        'Content-Type': 'application/json',
        'x-kode01-signature': signature,
        'x-kode01-event-id': params.delivery.event_id,
        'x-kode01-event-type': params.delivery.event_type,
        'x-request-id': params.requestId,
      },
      body: payloadText,
      timeoutMs: params.timeoutMs,
    });

    await trackExternalApiCallEvent({
      endpoint: 'license_webhook_delivery',
      channel: 'outbound',
      method: 'POST',
      statusCode: response.status,
      success: response.ok,
      durationMs: Date.now() - startedAt,
      requestId: params.requestId,
      metadata: {
        delivery_id: params.delivery.id,
        event_id: params.delivery.event_id,
        event_type: params.delivery.event_type,
        seller_id: params.delivery.seller_id,
        endpoint_url: params.delivery.endpoint_url,
        attempt_count: params.delivery.attempt_count + 1,
      },
    });
    return markDeliveryResult({
      admin: params.admin,
      delivery: params.delivery,
      signature,
      succeeded: response.ok,
      responseStatus: response.status,
      responseBody: response.text,
      lastError: response.ok ? null : `http_${response.status}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await trackExternalApiCallEvent({
      endpoint: 'license_webhook_delivery',
      channel: 'outbound',
      method: 'POST',
      statusCode: null,
      success: false,
      durationMs: Date.now() - startedAt,
      requestId: params.requestId,
      metadata: {
        failure_type: 'fetch_error',
        error_message: errorMessage,
        delivery_id: params.delivery.id,
        event_id: params.delivery.event_id,
        event_type: params.delivery.event_type,
        seller_id: params.delivery.seller_id,
        endpoint_url: params.delivery.endpoint_url,
        attempt_count: params.delivery.attempt_count + 1,
      },
    });
    return markDeliveryResult({
      admin: params.admin,
      delivery: params.delivery,
      signature,
      succeeded: false,
      responseStatus: null,
      responseBody: null,
      lastError: errorMessage,
    });
  }
}

export async function runLicenseWebhookTask(requestId: string) {
  const env = getServerEnv();
  const deliveryBatchSize = resolveDeliveryBatchSize(env);
  const deliveryTimeoutMs = resolveDeliveryTimeoutMs(env);
  const nowIso = new Date().toISOString();
  const admin = createAdminClient();

  const { data: deliveries, error: fetchError } = await admin
    .from('license_webhook_deliveries')
    .select(
      'id, event_id, event_type, seller_id, endpoint_url, payload, signature, status, attempt_count, max_attempts',
    )
    .in('status', ['pending', 'retrying'])
    .lte('next_attempt_at', nowIso)
    .order('next_attempt_at', { ascending: true })
    .limit(deliveryBatchSize);

  if (fetchError) {
    throw fetchError;
  }

  const stats = {
    processed: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
  };
  const deliveryRows = (deliveries ?? []) as DeliveryRow[];
  const secretBySellerId = await preloadWebhookSecrets(admin, deliveryRows);

  for (const rawDelivery of deliveryRows) {
    const result = await dispatchDelivery({
      admin,
      delivery: rawDelivery,
      requestId,
      secretBySellerId,
      timeoutMs: deliveryTimeoutMs,
    });

    stats.processed += 1;
    if (result === 'sent') stats.sent += 1;
    if (result === 'retrying') stats.retrying += 1;
    if (result === 'failed') stats.failed += 1;
  }

  return {
    ...stats,
    batchSize: deliveryBatchSize,
    timeoutMs: deliveryTimeoutMs,
  };
}

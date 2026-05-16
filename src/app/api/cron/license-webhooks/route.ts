import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { trackExternalApiCallEvent } from '@/features/api-monitoring/server/tracker';
import { logCronFailed, logCronSucceeded, logCronUnauthorized, startCronRun, withCronHeaders } from '@/lib/cron/run-log';
import {
  buildLicenseWebhookSignature,
  computeLicenseWebhookRetryDelaySeconds,
  truncateWebhookResponseBody,
} from '@/features/licenses/server/webhook-delivery';
import { validateWebhookEndpointUrl } from '@/features/licenses/server/webhook-url-safety';

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

function resolveDeliveryBatchSize(env: ReturnType<typeof getServerEnv>) {
  const value = env.LICENSE_WEBHOOK_BATCH_SIZE ?? DEFAULT_DELIVERY_BATCH_SIZE;
  return Number.isInteger(value) && value >= 1 && value <= 200
    ? value
    : DEFAULT_DELIVERY_BATCH_SIZE;
}

function resolveDeliveryTimeoutMs(env: ReturnType<typeof getServerEnv>) {
  const value = env.LICENSE_WEBHOOK_TIMEOUT_MS ?? DEFAULT_DELIVERY_TIMEOUT_MS;
  return Number.isInteger(value) && value >= 1_000 && value <= 60_000
    ? value
    : DEFAULT_DELIVERY_TIMEOUT_MS;
}

async function preloadWebhookSecrets(
  admin: ReturnType<typeof createAdminClient>,
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
  admin: ReturnType<typeof createAdminClient>;
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
  admin: ReturnType<typeof createAdminClient>;
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

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), params.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(endpointValidation.normalizedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kode01-signature': signature,
        'x-kode01-event-id': params.delivery.event_id,
        'x-kode01-event-type': params.delivery.event_type,
        'x-request-id': params.requestId,
      },
      body: payloadText,
      cache: 'no-store',
      signal: timeoutController.signal,
      redirect: 'manual',
    });

    const responseText = await response.text().catch(() => null);
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
      responseBody: responseText,
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
  } finally {
    clearTimeout(timeout);
  }
}

async function runLicenseWebhookCron(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  const run = startCronRun(req, 'license-webhooks');
  const requestId = run.runId;
  const env = getServerEnv();
  const deliveryBatchSize = resolveDeliveryBatchSize(env);
  const deliveryTimeoutMs = resolveDeliveryTimeoutMs(env);
  try {
    if (!isCronAuthorized(req)) {
      logCronUnauthorized(run);
      await logAuditEvent({
        eventType: 'license_webhook_cron.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { run_id: run.runId, request_id: requestId },
      });
      return withCronHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), run);
    }

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
      logCronFailed(run, fetchError, { requestId });
      await logAuditEvent({
        eventType: 'license_webhook_cron.failed.fetch',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          run_id: run.runId,
          error_message: fetchError.message,
          request_id: requestId,
        },
      });
      return withCronHeaders(NextResponse.json({ error: 'Failed to fetch webhook deliveries' }, { status: 500 }), run);
    }

    const stats = {
      processed: 0,
      sent: 0,
      retrying: 0,
      failed: 0,
    };
    const deliveryRows = (deliveries ?? []) as DeliveryRow[];
    const secretBySellerId = await preloadWebhookSecrets(admin, deliveryRows);

    // Process in chunks to prevent unbounded concurrency and protect DB/external APIs
    const CHUNK_SIZE = 10;
    for (let i = 0; i < deliveryRows.length; i += CHUNK_SIZE) {
      const chunk = deliveryRows.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map((rawDelivery) =>
          dispatchDelivery({
            admin,
            delivery: rawDelivery,
            requestId,
            secretBySellerId,
            timeoutMs: deliveryTimeoutMs,
          }),
        ),
      );

      for (const result of results) {
        stats.processed += 1;
        if (result === 'sent') stats.sent += 1;
        if (result === 'retrying') stats.retrying += 1;
        if (result === 'failed') stats.failed += 1;
      }
    }

    logCronSucceeded(run, { requestId, ...stats, batchSize: deliveryBatchSize, timeoutMs: deliveryTimeoutMs });
    await logAuditEvent({
      eventType: 'license_webhook_cron.success',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        run_id: run.runId,
        request_id: requestId,
        ...stats,
      },
    });

    return withCronHeaders(NextResponse.json({
      requestId,
      ...stats,
    }), run);
  } catch (error) {
    logCronFailed(run, error, { requestId });
    await logAuditEvent({
      eventType: 'license_webhook_cron.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        run_id: run.runId,
        request_id: requestId,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return withCronHeaders(NextResponse.json({ error: 'Internal Server Error' }, { status: 500 }), run);
  }
}

export async function GET(req: Request) {
  return runLicenseWebhookCron(req);
}

export async function POST(req: Request) {
  return runLicenseWebhookCron(req);
}

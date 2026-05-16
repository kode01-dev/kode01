import 'server-only';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAppBaseUrl, getRequiredServerEnv, getServerEnv } from '@/lib/env/server';
import type { Database } from '@/types/database.types';

type PushSubscriptionInsert = Database['public']['Tables']['notification_push_subscriptions']['Insert'];
type PushDeliveryInsert = Database['public']['Tables']['notification_push_deliveries']['Insert'];

type PushDeliveryRow = {
  id: string;
  notification_id: string;
  subscription_id: string;
  attempt_count: number;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean;
};

type PushNotificationRow = {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  created_at: string;
};

type WebPushError = Error & {
  statusCode?: number;
  body?: string;
};

const MAX_PUSH_SUBSCRIPTION_FIELD_LENGTH = 4096;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_DEVICE_LABEL_LENGTH = 120;
const DEFAULT_PUSH_BATCH_SIZE = 100;
const MAX_PUSH_ATTEMPTS = 5;

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(MAX_PUSH_SUBSCRIPTION_FIELD_LENGTH),
    auth: z.string().trim().min(1).max(MAX_PUSH_SUBSCRIPTION_FIELD_LENGTH),
  }),
  deviceLabel: z.string().trim().max(MAX_DEVICE_LABEL_LENGTH).optional().nullable(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export type PushConfig = {
  enabled: boolean;
  publicKey: string | null;
};

export type PushDeliveryRunResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  disabledSubscriptions: number;
};

function truncate(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

export function getPushPublicConfig(): PushConfig {
  const env = getServerEnv();
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
  return {
    enabled: Boolean(publicKey),
    publicKey,
  };
}

function getRequiredPushCredentials() {
  const env = getRequiredServerEnv([
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ]);

  return {
    publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}

export function getPushRetryDelaySeconds(attemptCount: number): number {
  const normalizedAttempt = Math.max(1, attemptCount);
  return Math.min(60 * 60, 60 * 2 ** (normalizedAttempt - 1));
}

export function isPermanentWebPushError(error: unknown): boolean {
  const statusCode = typeof (error as WebPushError | null)?.statusCode === 'number'
    ? (error as WebPushError).statusCode
    : null;
  return statusCode === 404 || statusCode === 410;
}

function resolvePushUrl(link: string | null): string {
  const baseUrl = getAppBaseUrl();
  const base = new URL(baseUrl);

  if (!link) return base.toString();

  try {
    const candidate = new URL(link, base);
    if (candidate.origin !== base.origin) {
      return base.toString();
    }
    return candidate.toString();
  } catch {
    return base.toString();
  }
}

function buildPushPayload(notification: PushNotificationRow) {
  const baseUrl = getAppBaseUrl();
  return {
    notificationId: notification.id,
    title: notification.title,
    body: notification.message ?? '',
    url: resolvePushUrl(notification.link),
    icon: `${baseUrl}/logo.png`,
    createdAt: notification.created_at,
  };
}

async function sendWebPushNotification(input: {
  subscription: PushSubscriptionRow;
  notification: PushNotificationRow;
}) {
  const credentials = getRequiredPushCredentials();
  const webPushModule = await import('web-push');
  const webPush = webPushModule.default ?? webPushModule;

  webPush.setVapidDetails(credentials.subject, credentials.publicKey, credentials.privateKey);

  await webPush.sendNotification(
    {
      endpoint: input.subscription.endpoint,
      keys: {
        p256dh: input.subscription.p256dh,
        auth: input.subscription.auth,
      },
    },
    JSON.stringify(buildPushPayload(input.notification)),
    { TTL: 60 * 60 },
  );
}

export async function upsertPushSubscription(input: {
  userId: string;
  subscription: PushSubscriptionInput;
  userAgent?: string | null;
}) {
  const parsed = pushSubscriptionSchema.parse(input.subscription);
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const row = {
    user_id: input.userId,
    endpoint: parsed.endpoint,
    p256dh: parsed.keys.p256dh,
    auth: parsed.keys.auth,
    user_agent: truncate(input.userAgent, MAX_USER_AGENT_LENGTH),
    device_label: truncate(parsed.deviceLabel, MAX_DEVICE_LABEL_LENGTH),
    is_active: true,
    last_seen_at: nowIso,
    updated_at: nowIso,
  } satisfies PushSubscriptionInsert;

  const { data, error } = await admin
    .from('notification_push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save push subscription');
  }

  return { subscriptionId: data.id };
}

export async function deactivatePushSubscription(input: {
  userId: string;
  endpoint: string;
}) {
  const endpoint = z.string().trim().url().parse(input.endpoint);
  const admin = createAdminClient();

  const { error } = await admin
    .from('notification_push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', input.userId)
    .eq('endpoint', endpoint);

  if (error) {
    throw new Error(`Failed to deactivate push subscription: ${error.message}`);
  }

  return { success: true };
}

export async function enqueuePushDeliveriesForNotification(input: {
  notificationId: string;
  recipientUserId: string;
  pushEnabled: boolean;
}) {
  if (!input.pushEnabled) {
    return { enqueued: 0 };
  }

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin
    .from('notification_push_subscriptions')
    .select('id')
    .eq('user_id', input.recipientUserId)
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to load push subscriptions: ${error.message}`);
  }

  const rows = (subscriptions ?? []).map((subscription) => ({
    notification_id: input.notificationId,
    subscription_id: subscription.id,
  } satisfies PushDeliveryInsert));

  if (rows.length === 0) {
    return { enqueued: 0 };
  }

  const { error: insertError } = await admin
    .from('notification_push_deliveries')
    .upsert(rows, {
      onConflict: 'notification_id,subscription_id',
      ignoreDuplicates: true,
    });

  if (insertError) {
    throw new Error(`Failed to enqueue push deliveries: ${insertError.message}`);
  }

  return { enqueued: rows.length };
}

async function markDeliverySkipped(deliveryId: string, reason: string) {
  const admin = createAdminClient();
  await admin
    .from('notification_push_deliveries')
    .update({
      status: 'skipped',
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);
}

async function markDeliverySent(deliveryId: string) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  await admin
    .from('notification_push_deliveries')
    .update({
      status: 'sent',
      last_error: null,
      sent_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', deliveryId);
}

async function markDeliveryFailed(input: {
  deliveryId: string;
  errorMessage: string;
  attemptCount: number;
}) {
  const admin = createAdminClient();
  const finalFailure = input.attemptCount >= MAX_PUSH_ATTEMPTS;
  const nextAttemptAt = new Date(
    Date.now() + getPushRetryDelaySeconds(input.attemptCount) * 1000,
  ).toISOString();

  await admin
    .from('notification_push_deliveries')
    .update({
      status: finalFailure ? 'failed' : 'pending',
      last_error: input.errorMessage,
      next_attempt_at: nextAttemptAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.deliveryId);
}

async function deactivateSubscriptionById(subscriptionId: string) {
  const admin = createAdminClient();
  await admin
    .from('notification_push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);
}

export async function sendPendingPushNotifications(limit = DEFAULT_PUSH_BATCH_SIZE): Promise<PushDeliveryRunResult> {
  getRequiredPushCredentials();

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data: deliveries, error } = await admin
    .from('notification_push_deliveries')
    .select('id, notification_id, subscription_id, attempt_count')
    .eq('status', 'pending')
    .lte('next_attempt_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(`Failed to load pending push deliveries: ${error.message}`);
  }

  const pending = (deliveries ?? []) as PushDeliveryRow[];
  const stats: PushDeliveryRunResult = {
    processed: pending.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    disabledSubscriptions: 0,
  };

  if (pending.length === 0) {
    return stats;
  }

  const subscriptionIds = Array.from(new Set(pending.map((delivery) => delivery.subscription_id)));
  const notificationIds = Array.from(new Set(pending.map((delivery) => delivery.notification_id)));

  const [{ data: subscriptions, error: subscriptionsError }, { data: notifications, error: notificationsError }] =
    await Promise.all([
      admin
        .from('notification_push_subscriptions')
        .select('id, endpoint, p256dh, auth, is_active')
        .in('id', subscriptionIds),
      admin
        .from('notifications')
        .select('id, title, message, link, created_at')
        .in('id', notificationIds),
    ]);

  if (subscriptionsError) {
    throw new Error(`Failed to load push subscriptions: ${subscriptionsError.message}`);
  }
  if (notificationsError) {
    throw new Error(`Failed to load push notifications: ${notificationsError.message}`);
  }

  const subscriptionMap = new Map((subscriptions ?? []).map((row) => [row.id, row as PushSubscriptionRow]));
  const notificationMap = new Map((notifications ?? []).map((row) => [row.id, row as PushNotificationRow]));

  for (const delivery of pending) {
    const subscription = subscriptionMap.get(delivery.subscription_id);
    const notification = notificationMap.get(delivery.notification_id);

    if (!subscription || !subscription.is_active) {
      await markDeliverySkipped(delivery.id, 'Push subscription missing or inactive');
      stats.skipped += 1;
      continue;
    }

    if (!notification) {
      await markDeliverySkipped(delivery.id, 'Notification missing');
      stats.skipped += 1;
      continue;
    }

    const attemptCount = delivery.attempt_count + 1;
    const { data: claimed, error: claimError } = await admin
      .from('notification_push_deliveries')
      .update({
        attempt_count: attemptCount,
        next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', delivery.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      continue;
    }

    try {
      await sendWebPushNotification({ subscription, notification });
      await markDeliverySent(delivery.id);
      stats.sent += 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Web Push error';
      if (isPermanentWebPushError(error)) {
        await deactivateSubscriptionById(subscription.id);
        await markDeliverySkipped(delivery.id, errorMessage);
        stats.skipped += 1;
        stats.disabledSubscriptions += 1;
        continue;
      }

      await markDeliveryFailed({
        deliveryId: delivery.id,
        errorMessage,
        attemptCount,
      });
      stats.failed += 1;
    }
  }

  return stats;
}

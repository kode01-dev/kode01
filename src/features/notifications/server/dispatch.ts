import 'server-only';

import React from 'react';
import { render } from '@react-email/components';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database.types';
import { getAppBaseUrl, getRequiredServerEnv, getServerEnv } from '@/lib/env/server';
import { AppNotificationEmail } from '@/emails/AppNotificationEmail';
import { enqueuePushDeliveriesForNotification } from './push';

type EmailStatus = 'pending' | 'sent' | 'failed' | 'skipped';

type NotificationTemplateRow = {
  key: string;
  subject_en: string;
  subject_fr: string;
  message_en: string;
  message_fr: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  is_active: boolean;
};

type ExistingNotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  link: string | null;
  metadata: Json | null;
  email_to: string | null;
  email_subject: string | null;
  email_status: EmailStatus;
};

type NotificationLocale = 'en' | 'fr';
type NotificationEmailProvider = 'brevo';

type NotificationEmailProviderConfig = {
  provider: NotificationEmailProvider;
  endpointUrl: string;
  senderName: string;
  senderEmail: string;
  apiKey: string;
};

type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];

const DEFAULT_NOTIFICATION_EMAIL_PROVIDER: NotificationEmailProvider = 'brevo';
const DEFAULT_BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_BRAND_NAME = 'KODE01';

export const dispatchNotificationSchema = z.object({
  recipientUserId: z.string().uuid(),
  templateKey: z.string().trim().min(1),
  locale: z.string().trim().default('en'),
  title: z.string().trim().min(1).optional(),
  message: z.string().trim().optional().nullable(),
  link: z.string().trim().optional().nullable(),
  metadata: z.unknown().optional(), // Flexible for Json
  email: z
    .object({
      enabled: z.boolean().optional(),
      to: z.string().trim().email().optional(),
    })
    .optional(),
  emailSubject: z.string().trim().min(1).optional(),
});

export type DispatchNotificationInput = z.infer<typeof dispatchNotificationSchema>;

export type DispatchNotificationResult = {
  notificationId: string;
  inAppSaved: boolean;
  emailStatus: EmailStatus;
  emailError?: string;
};

const retryNotificationSchema = z.object({
  notificationId: z.string().uuid(),
});

function normalizeLocale(localeValue: string): NotificationLocale {
  return localeValue.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function resolveNotificationEmailProviderConfig(): NotificationEmailProviderConfig {
  const env = getServerEnv();
  const provider = (env.NOTIF_EMAIL_PROVIDER ?? DEFAULT_NOTIFICATION_EMAIL_PROVIDER)
    .trim()
    .toLowerCase();

  if (provider !== 'brevo') {
    throw new Error(`Unsupported notification email provider: ${provider}`);
  }

  const required = getRequiredServerEnv(['BREVO_API_KEY', 'BREVO_SENDER_EMAIL']);
  const senderName =
    env.BREVO_SENDER_NAME?.trim() ||
    env.APP_BRAND_NAME?.trim() ||
    DEFAULT_BRAND_NAME;

  return {
    provider,
    endpointUrl: env.NOTIF_PROVIDER_URL?.trim() || DEFAULT_BREVO_ENDPOINT,
    senderName,
    senderEmail: required.BREVO_SENDER_EMAIL,
    apiKey: required.BREVO_API_KEY,
  };
}

function buildEmailCopy(locale: NotificationLocale, brandName: string) {
  if (locale === 'fr') {
    return {
      ctaLabel: 'Ouvrir la notification',
      footerText: `Cet email a ete envoye par les notifications ${brandName}.`,
    };
  }

  return {
    ctaLabel: 'Open notification',
    footerText: `This email was sent by ${brandName} notifications.`,
  };
}

function resolveNotificationLocaleFromMetadata(
  metadata: Json | null | undefined,
): NotificationLocale {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'en';
  }
  const raw = (metadata as Record<string, unknown>).notification_locale;
  if (typeof raw === 'string') {
    return normalizeLocale(raw);
  }

  return 'en';
}

function interpolateTemplate(template: string, metadata: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = metadata[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  });
}

function toEmailLink(link: string | null): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;

  try {
    const baseUrl = getAppBaseUrl();
    return `${baseUrl}${link.startsWith('/') ? '' : '/'}${link}`;
  } catch {
    return null;
  }
}

async function loadTemplate(templateKey: string): Promise<NotificationTemplateRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notification_templates')
    .select(
      'key, subject_en, subject_fr, message_en, message_fr, email_enabled, in_app_enabled, push_enabled, is_active',
    )
    .eq('key', templateKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load notification template: ${error.message}`);
  }
  if (!data || !data.is_active) {
    throw new Error('Notification template is missing or inactive');
  }

  return data as NotificationTemplateRow;
}

async function resolveRecipientEmail(
  userId: string,
  explicitEmail?: string,
): Promise<string | null> {
  if (explicitEmail) return explicitEmail;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(`Failed to resolve recipient email: ${error.message}`);
  }
  return data.user?.email ?? null;
}

async function sendBrevoEmail(input: {
  to: string;
  subject: string;
  title: string;
  message: string | null;
  link: string | null;
  locale: NotificationLocale;
  providerConfig: NotificationEmailProviderConfig;
}) {
  const emailLink = toEmailLink(input.link);
  const emailCopy = buildEmailCopy(input.locale, input.providerConfig.senderName);

  const htmlContent = await render(
    React.createElement(AppNotificationEmail, {
      title: input.title,
      message: input.message,
      ctaUrl: emailLink,
      ctaLabel: emailCopy.ctaLabel,
      footerText: emailCopy.footerText,
    }),
  );

  const response = await fetch(input.providerConfig.endpointUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': input.providerConfig.apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: input.providerConfig.senderName,
        email: input.providerConfig.senderEmail,
      },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: unknown }).message ?? 'Brevo API request failed')
        : 'Brevo API request failed';
    throw new Error(`${response.status}: ${message}`);
  }

  const messageId =
    typeof payload === 'object' && payload
      ? ((payload as { messageId?: string; messageIds?: string[] }).messageId ??
        (payload as { messageIds?: string[] }).messageIds?.[0] ??
        null)
      : null;

  return {
    messageId,
    provider: input.providerConfig.provider,
  };
}

export async function dispatchNotification(
  rawInput: DispatchNotificationInput,
): Promise<DispatchNotificationResult> {
  const input = dispatchNotificationSchema.parse(rawInput);
  const locale = normalizeLocale(input.locale);
  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};
  const notificationMetadata: Record<string, unknown> = { ...metadata };
  if (typeof notificationMetadata.notification_locale !== 'string') {
    notificationMetadata.notification_locale = locale;
  }
  const template = await loadTemplate(input.templateKey);

  const localizedSubjectTemplate = locale === 'fr' ? template.subject_fr : template.subject_en;
  const localizedMessageTemplate = locale === 'fr' ? template.message_fr : template.message_en;
  const title = input.title ?? interpolateTemplate(localizedSubjectTemplate, metadata);
  const message =
    input.message === undefined
      ? interpolateTemplate(localizedMessageTemplate, metadata)
      : input.message;
  const link = input.link ?? null;

  const emailEnabled = input.email?.enabled ?? template.email_enabled;
  const inAppEnabled = template.in_app_enabled;
  const emailSubject = input.emailSubject ?? title;
  const emailTo = emailEnabled ? await resolveRecipientEmail(input.recipientUserId, input.email?.to) : null;
  const initialEmailStatus: EmailStatus = emailEnabled && emailTo ? 'pending' : 'skipped';
  const providerConfig = initialEmailStatus === 'pending'
    ? resolveNotificationEmailProviderConfig()
    : null;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: created, error: insertError } = await admin
    .from('notifications')
    .insert([
      {
        user_id: input.recipientUserId,
        template_key: input.templateKey,
        title,
        message,
        link,
        metadata: notificationMetadata as Json,
        is_read: !inAppEnabled,
        read_at: !inAppEnabled ? nowIso : null,
        email_to: emailTo,
        email_subject: emailSubject,
        email_status: initialEmailStatus,
        email_provider: providerConfig?.provider ?? null,
      } satisfies NotificationInsert,
    ])
    .select('id')
    .single();

  if (insertError || !created) {
    throw new Error(insertError?.message ?? 'Failed to save notification');
  }

  try {
    await enqueuePushDeliveriesForNotification({
      notificationId: created.id,
      recipientUserId: input.recipientUserId,
      pushEnabled: template.push_enabled,
    });
  } catch (error) {
    console.error('Failed to enqueue push deliveries:', error);
  }

  if (initialEmailStatus !== 'pending' || !emailTo) {
    return {
      notificationId: created.id,
      inAppSaved: inAppEnabled,
      emailStatus: initialEmailStatus,
    };
  }

  try {
    const result = await sendBrevoEmail({
      to: emailTo,
      subject: emailSubject,
      title,
      message: message ?? null,
      link,
      locale,
      providerConfig: providerConfig ?? resolveNotificationEmailProviderConfig(),
    });

    await admin
      .from('notifications')
      .update({
        email_status: 'sent',
        email_provider: result.provider,
        email_provider_message_id: result.messageId,
        email_error: null,
        email_sent_at: new Date().toISOString(),
      })
      .eq('id', created.id);

    return {
      notificationId: created.id,
      inAppSaved: inAppEnabled,
      emailStatus: 'sent',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
    await admin
      .from('notifications')
      .update({
        email_status: 'failed',
        email_provider: providerConfig?.provider ?? null,
        email_error: errorMessage,
      })
      .eq('id', created.id);

    return {
      notificationId: created.id,
      inAppSaved: inAppEnabled,
      emailStatus: 'failed',
      emailError: errorMessage,
    };
  }
}

export async function retryNotificationEmail(notificationId: string): Promise<DispatchNotificationResult> {
  const parsed = retryNotificationSchema.parse({ notificationId });
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('notifications')
    .select('id, user_id, title, message, link, metadata, email_to, email_subject, email_status')
    .eq('id', parsed.notificationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load notification: ${error.message}`);
  }
  if (!data) {
    throw new Error('Notification not found');
  }

  const notification = data as ExistingNotificationRow;
  if (!notification.email_to) {
    await admin
      .from('notifications')
      .update({ email_status: 'skipped', email_error: 'No recipient email' })
      .eq('id', notification.id);

    return {
      notificationId: notification.id,
      inAppSaved: true,
      emailStatus: 'skipped',
      emailError: 'No recipient email',
    };
  }

  try {
    const locale = resolveNotificationLocaleFromMetadata(notification.metadata);
    const providerConfig = resolveNotificationEmailProviderConfig();
    const result = await sendBrevoEmail({
      to: notification.email_to,
      subject: notification.email_subject ?? notification.title,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      locale,
      providerConfig,
    });

    await admin
      .from('notifications')
      .update({
        email_status: 'sent',
        email_provider: result.provider,
        email_provider_message_id: result.messageId,
        email_error: null,
        email_sent_at: new Date().toISOString(),
      })
      .eq('id', notification.id);

    return {
      notificationId: notification.id,
      inAppSaved: true,
      emailStatus: 'sent',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
    await admin
      .from('notifications')
      .update({
        email_status: 'failed',
        email_provider: DEFAULT_NOTIFICATION_EMAIL_PROVIDER,
        email_error: errorMessage,
      })
      .eq('id', notification.id);

    return {
      notificationId: notification.id,
      inAppSaved: true,
      emailStatus: 'failed',
      emailError: errorMessage,
    };
  }
}

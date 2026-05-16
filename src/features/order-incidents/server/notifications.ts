import 'server-only';

import { dispatchNotification } from '@/features/notifications/server/dispatch';
import type {
  OrderIncidentDecision,
  OrderIncidentIssueType,
  OrderIncidentStatus,
} from '@/features/order-incidents/types';

function normalizeLocale(locale: string | null | undefined): 'en' | 'fr' {
  if (!locale) return 'en';
  return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

function getIssueTypeLabel(issueType: OrderIncidentIssueType, locale: 'en' | 'fr') {
  const labels: Record<OrderIncidentIssueType, { en: string; fr: string }> = {
    purchase_info_missing: {
      en: 'Purchase information not received',
      fr: 'Informations d achat non recues',
    },
    content_missing: {
      en: 'Purchased content not received',
      fr: 'Contenu achete non recu',
    },
    license_issue: {
      en: 'License or key issue',
      fr: 'Probleme de licence ou de cle',
    },
    other: {
      en: 'Other issue',
      fr: 'Autre probleme',
    },
  };
  return labels[issueType][locale];
}

function getStatusLabel(status: OrderIncidentStatus, locale: 'en' | 'fr') {
  const labels: Record<OrderIncidentStatus, { en: string; fr: string }> = {
    open: { en: 'Open', fr: 'Ouvert' },
    in_progress: { en: 'In progress', fr: 'En cours' },
    resolved: { en: 'Resolved', fr: 'Resolu' },
    rejected: { en: 'Rejected', fr: 'Rejete' },
  };
  return labels[status][locale];
}

function getDecisionLabel(decision: OrderIncidentDecision, locale: 'en' | 'fr') {
  const labels: Record<OrderIncidentDecision, { en: string; fr: string }> = {
    confirmed: { en: 'Confirmed', fr: 'Confirme' },
    not_confirmed: { en: 'Not confirmed', fr: 'Non confirme' },
  };
  return labels[decision][locale];
}

export async function sendOrderIncidentStatusNotification(input: {
  recipientUserId: string;
  locale?: string | null;
  incidentId: string;
  issueType: OrderIncidentIssueType;
  status: OrderIncidentStatus;
  decision: OrderIncidentDecision | null;
  productTitle: string | null;
}) {
  const locale = normalizeLocale(input.locale);
  const issueLabel = getIssueTypeLabel(input.issueType, locale);
  const statusLabel = getStatusLabel(input.status, locale);
  const decisionLabel = input.decision ? getDecisionLabel(input.decision, locale) : null;

  const title =
    locale === 'fr'
      ? `Mise a jour incident commande #${input.incidentId.slice(0, 8)}`
      : `Order incident update #${input.incidentId.slice(0, 8)}`;

  const productSegment = input.productTitle
    ? locale === 'fr'
      ? `Produit: ${input.productTitle}.`
      : `Product: ${input.productTitle}.`
    : '';

  const decisionSegment = decisionLabel
    ? locale === 'fr'
      ? ` Decision: ${decisionLabel}.`
      : ` Decision: ${decisionLabel}.`
    : '';

  const message =
    locale === 'fr'
      ? `Statut: ${statusLabel}. Type: ${issueLabel}. ${productSegment}${decisionSegment}`.trim()
      : `Status: ${statusLabel}. Type: ${issueLabel}. ${productSegment}${decisionSegment}`.trim();

  await dispatchNotification({
    recipientUserId: input.recipientUserId,
    templateKey: 'order_incident_update',
    locale,
    title,
    message,
    link: '/buyer',
    email: {
      enabled: true,
    },
    metadata: {
      incident_id: input.incidentId,
      issue_type: input.issueType,
      status: input.status,
      decision: input.decision,
    },
  });
}

export async function sendOrderAccessNotification(input: {
  recipientUserId: string;
  locale?: string | null;
  incidentId: string;
  productTitle: string | null;
  productSlug: string | null;
  kind: 'resend_purchase_confirmation' | 'send_access_notification';
}) {
  const locale = normalizeLocale(input.locale);
  const title = locale === 'fr'
    ? 'Informations de commande renvoyees'
    : 'Order access information re-sent';
  const message = locale === 'fr'
    ? 'Nous avons renvoye les informations de votre achat. Verifiez votre boite courriel.'
    : 'We have re-sent your purchase information. Please check your email inbox.';

  const link = input.productSlug ? `/products/${input.productSlug}` : '/buyer';

  await dispatchNotification({
    recipientUserId: input.recipientUserId,
    templateKey: 'order_access_restored',
    locale,
    title,
    message,
    link,
    email: {
      enabled: true,
    },
    metadata: {
      incident_id: input.incidentId,
      action_type: input.kind,
      product_title: input.productTitle,
      product_slug: input.productSlug,
    },
  });
}

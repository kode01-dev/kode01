export const ORDER_INCIDENT_STATUSES = ['open', 'in_progress', 'resolved', 'rejected'] as const;
export type OrderIncidentStatus = (typeof ORDER_INCIDENT_STATUSES)[number];

export const ORDER_INCIDENT_DECISIONS = ['confirmed', 'not_confirmed'] as const;
export type OrderIncidentDecision = (typeof ORDER_INCIDENT_DECISIONS)[number];

export const ORDER_INCIDENT_RESOLUTIONS = [
  'refunded',
  'partial_refund',
  'rejected',
  'escalated',
] as const;
export type OrderIncidentResolution = (typeof ORDER_INCIDENT_RESOLUTIONS)[number];

export const ORDER_INCIDENT_ISSUE_TYPES = [
  'purchase_info_missing',
  'content_missing',
  'license_issue',
  'other',
] as const;
export type OrderIncidentIssueType = (typeof ORDER_INCIDENT_ISSUE_TYPES)[number];

export type OrderIncidentOpenedBy = 'buyer' | 'admin';
export type OrderIncidentActorRole = 'buyer' | 'vendor' | 'admin' | 'system';

export type OrderIncidentActionType =
  | 'incident_opened'
  | 'status_updated'
  | 'resend_purchase_confirmation'
  | 'send_access_notification'
  | 'vendor_response'
  | 'vendor_refund_proposed'
  | 'refund_processed'
  | 'sla_auto_escalated';

export type OrderIncidentActionTimelineItem = {
  id: string;
  incidentId: string;
  actionType: string;
  actorRole: OrderIncidentActorRole;
  actorUserId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type BuyerOrderIncidentListItem = {
  id: string;
  purchaseId: string;
  productId: string;
  productTitle: string | null;
  productSlug: string | null;
  issueType: OrderIncidentIssueType;
  status: OrderIncidentStatus;
  decision: OrderIncidentDecision | null;
  openedBy: OrderIncidentOpenedBy;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  evidenceUrls: string[];
  slaDeadlineAt: string | null;
  stripeRefundId: string | null;
  refundAmount: number | null;
  resolution: OrderIncidentResolution | null;
};

export type AdminOrderIncidentListItem = BuyerOrderIncidentListItem & {
  buyerId: string;
  buyerDisplayName: string | null;
  buyerShopName: string | null;
  assignedAdminId: string | null;
  purchaseAmount: number | null;
  purchaseStatus: string | null;
  purchaseCreatedAt: string | null;
  purchaseCurrency: string | null;
  timeline: OrderIncidentActionTimelineItem[];
};

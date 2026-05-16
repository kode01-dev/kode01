import { z } from 'zod';
import {
  ORDER_INCIDENT_DECISIONS,
  ORDER_INCIDENT_ISSUE_TYPES,
  ORDER_INCIDENT_RESOLUTIONS,
  ORDER_INCIDENT_STATUSES,
} from '@/features/order-incidents/types';

const orderIncidentIssueTypeEnum = z.enum(ORDER_INCIDENT_ISSUE_TYPES);
const orderIncidentStatusEnum = z.enum(ORDER_INCIDENT_STATUSES);
const orderIncidentDecisionEnum = z.enum(ORDER_INCIDENT_DECISIONS);
const orderIncidentResolutionEnum = z.enum(ORDER_INCIDENT_RESOLUTIONS);

export const createOrderIncidentSchema = z.object({
  purchaseId: z.string().uuid(),
  issueType: orderIncidentIssueTypeEnum,
  evidenceUrls: z.array(z.string().url()).max(8).optional().default([]),
  locale: z.string().trim().min(2).max(16).optional(),
});

export const adminListOrderIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional().default(''),
  status: z.union([z.literal('all'), orderIncidentStatusEnum]).default('all'),
  issueType: z.union([z.literal('all'), orderIncidentIssueTypeEnum]).default('all'),
  decision: z.union([z.literal('all'), orderIncidentDecisionEnum]).default('all'),
});

export const adminPatchOrderIncidentSchema = z
  .object({
    status: orderIncidentStatusEnum,
    decision: orderIncidentDecisionEnum.optional().nullable(),
    resolution: orderIncidentResolutionEnum.optional().nullable(),
    locale: z.string().trim().min(2).max(16).optional(),
  })
  .superRefine((value, ctx) => {
    const isClosed = value.status === 'resolved' || value.status === 'rejected';
    if (isClosed && !value.decision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision'],
        message: 'decision is required for resolved/rejected incidents',
      });
    }
  });

export const adminRefundOrderIncidentSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
});

export const adminIncidentActionSchema = z.object({
  actionType: z.enum(['resend_purchase_confirmation', 'send_access_notification']),
  locale: z.string().trim().min(2).max(16).optional(),
});

export const vendorRespondIncidentSchema = z
  .object({
    message: z.string().trim().max(2000).optional().default(''),
    proposedRefundAmount: z.number().int().positive().optional().nullable(),
    locale: z.string().trim().min(2).max(16).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.message && !value.proposedRefundAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: 'message or proposedRefundAmount is required',
      });
    }
  });

export type CreateOrderIncidentInput = z.infer<typeof createOrderIncidentSchema>;
export type AdminListOrderIncidentsQueryInput = z.infer<typeof adminListOrderIncidentsQuerySchema>;
export type AdminPatchOrderIncidentInput = z.infer<typeof adminPatchOrderIncidentSchema>;
export type AdminRefundOrderIncidentInput = z.infer<typeof adminRefundOrderIncidentSchema>;
export type AdminIncidentActionInput = z.infer<typeof adminIncidentActionSchema>;
export type VendorRespondIncidentInput = z.infer<typeof vendorRespondIncidentSchema>;

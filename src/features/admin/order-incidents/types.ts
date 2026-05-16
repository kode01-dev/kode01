import type {
  AdminOrderIncidentListItem,
  OrderIncidentDecision,
  OrderIncidentIssueType,
  OrderIncidentStatus,
} from '@/features/order-incidents/types';

export type AdminOrderIncidentFilters = {
  page: number;
  pageSize: number;
  q: string;
  status: 'all' | OrderIncidentStatus;
  issueType: 'all' | OrderIncidentIssueType;
  decision: 'all' | OrderIncidentDecision;
};

export type AdminOrderIncidentListResponse = {
  data: AdminOrderIncidentListItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    rejected: number;
  };
};

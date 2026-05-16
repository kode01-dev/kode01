export type AdminUserRole = 'buyer' | 'seller' | 'admin';
export type AdminPlanType = 'free' | 'pro';
export type AdminUserStatusFilter = 'all' | 'active' | 'blocked';
export type AdminUserRoleFilter = 'all' | AdminUserRole;
export type AdminUserPlanFilter = 'all' | AdminPlanType;

export interface AdminUserListItem {
  id: string;
  displayName: string;
  email: string | null;
  role: AdminUserRole;
  planType: AdminPlanType;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  isBlocked: boolean;
}

export interface AdminUsersSummary {
  totalUsers: number;
  activeUsers: number;
  blockedUsers: number;
}

export interface AdminUsersListResponse {
  data: AdminUserListItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: AdminUsersSummary;
}

export const DASHBOARD_ROLES = {
  ADMIN: 'admin',
  VENDOR: 'vendor',
  BUYER: 'buyer',
} as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[keyof typeof DASHBOARD_ROLES];

export function isDashboardAdminRole(role: DashboardRole): boolean {
  return role === DASHBOARD_ROLES.ADMIN;
}

export function isDashboardVendorRole(role: DashboardRole): boolean {
  return role === DASHBOARD_ROLES.VENDOR;
}

export function isDashboardBuyerRole(role: DashboardRole): boolean {
  return role === DASHBOARD_ROLES.BUYER;
}

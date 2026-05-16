import { isAdminRole, isBuyerRole, isSellerRole } from '@/lib/auth/roles';

export function isAdsMemberRole(role: string | null | undefined): boolean {
  return isBuyerRole(role) || isSellerRole(role) || isAdminRole(role);
}

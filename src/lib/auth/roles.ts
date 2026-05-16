export const PROFILE_ROLES = {
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin',
} as const;

export type NormalizedProfileRole = (typeof PROFILE_ROLES)[keyof typeof PROFILE_ROLES];

const SELLER_ROLE_ALIASES = new Set([PROFILE_ROLES.SELLER, 'vendor', 'vendeur']);
const BUYER_ROLE_ALIASES = new Set([PROFILE_ROLES.BUYER, 'client', 'acheteur']);

export function normalizeProfileRole(role: string | null | undefined): NormalizedProfileRole | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase();

  if (normalized === PROFILE_ROLES.ADMIN) return PROFILE_ROLES.ADMIN;
  if (SELLER_ROLE_ALIASES.has(normalized)) return PROFILE_ROLES.SELLER;
  if (BUYER_ROLE_ALIASES.has(normalized)) return PROFILE_ROLES.BUYER;

  return null;
}

export function isSellerRole(role: string | null | undefined): boolean {
  return normalizeProfileRole(role) === PROFILE_ROLES.SELLER;
}

export function isBuyerRole(role: string | null | undefined): boolean {
  return normalizeProfileRole(role) === PROFILE_ROLES.BUYER;
}

export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeProfileRole(role) === PROFILE_ROLES.ADMIN;
}

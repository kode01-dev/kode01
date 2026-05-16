import { VENDOR_BADGE_TYPES, type VendorBadgeType } from './types';

export interface VendorBadgeStats {
  totalSales: number;
  followerCount: number;
  averageRating: number | null;
  totalReviews: number;
  isVerified: boolean;
  /**
   * Average response time in minutes. Null when the messaging feature is not
   * yet in place (always null for now).
   */
  avgResponseMinutes: number | null;
}

/**
 * Compute the set of badges a vendor qualifies for based on their current stats.
 * Kept as pure logic so it can be reused by the cron and unit tested.
 */
export function computeEarnedBadges(stats: VendorBadgeStats): Set<VendorBadgeType> {
  const earned = new Set<VendorBadgeType>();

  if (stats.isVerified) earned.add('verified');

  if (stats.totalSales >= 100) {
    earned.add('100_sales');
    earned.add('top_seller');
  }

  if (stats.followerCount >= 25) earned.add('rising_star');

  if (
    stats.averageRating !== null &&
    stats.averageRating >= 4.5 &&
    stats.totalReviews >= 5
  ) {
    earned.add('trusted_quality');
  }

  // fast_responder is a placeholder until the messaging system lands.
  if (stats.avgResponseMinutes !== null && stats.avgResponseMinutes <= 60) {
    earned.add('fast_responder');
  }

  return earned;
}

export function diffBadges(
  earned: Set<VendorBadgeType>,
  existing: Set<VendorBadgeType>,
): { toAdd: VendorBadgeType[]; toRemove: VendorBadgeType[] } {
  const toAdd: VendorBadgeType[] = [];
  const toRemove: VendorBadgeType[] = [];

  for (const type of VENDOR_BADGE_TYPES) {
    const isEarned = earned.has(type);
    const isExisting = existing.has(type);
    if (isEarned && !isExisting) toAdd.push(type);
    else if (!isEarned && isExisting) toRemove.push(type);
  }

  return { toAdd, toRemove };
}

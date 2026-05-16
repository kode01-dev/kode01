import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, Gem, Sparkles, ShieldCheck, Trophy, Zap } from 'lucide-react';

export type VendorBadgeType =
  | 'top_seller'
  | 'verified'
  | 'fast_responder'
  | '100_sales'
  | 'rising_star'
  | 'trusted_quality';

export const VENDOR_BADGE_TYPES: readonly VendorBadgeType[] = [
  'top_seller',
  'verified',
  'fast_responder',
  '100_sales',
  'rising_star',
  'trusted_quality',
] as const;

export interface VendorBadgeMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind color token (matches the kode01 palette). */
  color: 'pink' | 'blue' | 'green';
}

export const VENDOR_BADGE_META: Record<VendorBadgeType, VendorBadgeMeta> = {
  top_seller: {
    label: 'Top Seller',
    description: 'Among the best-selling vendors on the marketplace.',
    icon: Trophy,
    color: 'pink',
  },
  verified: {
    label: 'Verified',
    description: 'Identity verified by the kode01 team.',
    icon: BadgeCheck,
    color: 'blue',
  },
  fast_responder: {
    label: 'Fast Responder',
    description: 'Replies quickly to buyer messages.',
    icon: Zap,
    color: 'green',
  },
  '100_sales': {
    label: '100+ Sales',
    description: 'Reached 100 completed sales.',
    icon: Gem,
    color: 'pink',
  },
  rising_star: {
    label: 'Rising Star',
    description: 'Gained a growing community of followers.',
    icon: Sparkles,
    color: 'blue',
  },
  trusted_quality: {
    label: 'Trusted Quality',
    description: 'Consistently high ratings from buyers.',
    icon: ShieldCheck,
    color: 'green',
  },
};

export function isVendorBadgeType(value: unknown): value is VendorBadgeType {
  return typeof value === 'string' && (VENDOR_BADGE_TYPES as readonly string[]).includes(value);
}

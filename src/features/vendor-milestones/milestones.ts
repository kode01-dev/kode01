import type { Milestone, MilestoneKey, MilestoneProgress } from './types';

export const MILESTONES: Milestone[] = [
  {
    key: 'shop_opened',
    label: 'Shop Opened',
    description: 'You created your vendor shop on kode01!',
    icon: '\uD83C\uDFEA',
    threshold: 1,
    category: 'products',
  },
  {
    key: 'first_product',
    label: 'First Product',
    description: 'You listed your first product for sale.',
    icon: '\uD83D\uDCE6',
    threshold: 1,
    category: 'products',
  },
  {
    key: 'first_sale',
    label: 'First Sale',
    description: 'Congratulations on your very first sale!',
    icon: '\uD83C\uDF89',
    threshold: 1,
    category: 'sales',
  },
  {
    key: 'ten_sales',
    label: '10 Sales',
    description: 'You have reached 10 total sales.',
    icon: '\uD83D\uDD25',
    threshold: 10,
    category: 'sales',
  },
  {
    key: 'fifty_sales',
    label: '50 Sales',
    description: 'An incredible 50 sales milestone!',
    icon: '\u2B50',
    threshold: 50,
    category: 'sales',
  },
  {
    key: 'hundred_sales',
    label: '100 Sales',
    description: 'You are a top seller with 100 sales!',
    icon: '\uD83D\uDC8E',
    threshold: 100,
    category: 'sales',
  },
  {
    key: 'rising_star',
    label: 'Rising Star',
    description: 'Gained 25 followers who love your work.',
    icon: '\uD83C\uDF1F',
    threshold: 25,
    category: 'followers',
  },
  {
    key: 'top_creator',
    label: 'Top Creator',
    description: 'Earned over $1,000 in total revenue.',
    icon: '\uD83D\uDC51',
    threshold: 1000,
    category: 'revenue',
  },
];

const MILESTONE_MAP = new Map<MilestoneKey, Milestone>(
  MILESTONES.map((m) => [m.key, m]),
);

export function getMilestone(key: MilestoneKey): Milestone | undefined {
  return MILESTONE_MAP.get(key);
}

interface VendorStats {
  totalSales: number;
  productCount: number;
  followerCount: number;
  totalRevenue: number;
}

function currentValueForCategory(
  stats: VendorStats,
  category: Milestone['category'],
): number {
  switch (category) {
    case 'sales':
      return stats.totalSales;
    case 'products':
      return stats.productCount;
    case 'followers':
      return stats.followerCount;
    case 'revenue':
      return stats.totalRevenue;
  }
}

export function computeMilestoneProgress(stats: VendorStats): MilestoneProgress[] {
  return MILESTONES.map((milestone) => {
    const current = currentValueForCategory(stats, milestone.category);
    const achieved = current >= milestone.threshold;

    return {
      key: milestone.key,
      achieved,
      ...(achieved ? { achievedAt: new Date().toISOString() } : {}),
      current: Math.min(current, milestone.threshold),
      target: milestone.threshold,
    };
  });
}

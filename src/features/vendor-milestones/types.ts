export type MilestoneKey = 'shop_opened' | 'first_product' | 'first_sale' | 'ten_sales' | 'fifty_sales' | 'hundred_sales' | 'rising_star' | 'top_creator';

export interface Milestone {
  key: MilestoneKey;
  label: string;
  description: string;
  icon: string; // emoji
  threshold: number;
  category: 'sales' | 'products' | 'followers' | 'revenue';
}

export interface MilestoneProgress {
  key: MilestoneKey;
  achieved: boolean;
  achievedAt?: string;
  current: number;
  target: number;
}

import 'server-only';

import { AdPlacementSlug } from '@/features/ads/types';
import { getActivePlacements, getActivePricingPlans } from '@/features/ads/server/repository';

export async function computeCampaignPrice(args: {
  pricingPlanId: string;
  placementSlugs: AdPlacementSlug[];
  newsFormat?: 'split' | 'full';
}) {
  const plans = await getActivePricingPlans();
  const placements = await getActivePlacements();

  const plan = plans.find((item) => item.id === args.pricingPlanId);
  if (!plan) {
    throw new Error('Unknown pricing plan');
  }

  const selectedPlacements = placements.filter((placement) =>
    args.placementSlugs.includes(placement.slug),
  );

  if (selectedPlacements.length === 0) {
    throw new Error('At least one placement is required');
  }

  if (selectedPlacements.some((placement) => placement.slug === 'news') && !args.newsFormat) {
    throw new Error('newsFormat is required when selecting the news placement');
  }

  const uniqueMultipliers = selectedPlacements.map((placement) => {
    const baseMultiplier = Number(placement.price_multiplier);
    if (placement.slug === 'news' && args.newsFormat === 'split') {
      return Number((baseMultiplier * 0.5).toFixed(3));
    }
    return baseMultiplier;
  });
  const multiplierSum = uniqueMultipliers.reduce((sum, value) => sum + value, 0);
  const basePrice = Number(plan.price ?? plan.price_usd);
  const currency = typeof plan.currency === 'string' && /^[a-z]{3}$/.test(plan.currency)
    ? plan.currency
    : 'cad';
  const total = basePrice * multiplierSum;
  const normalizedTotal = Number(total.toFixed(2));

  return {
    durationDays: plan.duration_days,
    currency,
    basePrice,
    totalPrice: normalizedTotal,
    // Deprecated compatibility fields kept for a short transition period.
    basePriceUsd: basePrice,
    totalPriceUsd: normalizedTotal,
    placements: selectedPlacements.map((placement) => ({
      id: placement.id,
      slug: placement.slug,
      multiplier:
        placement.slug === 'news' && args.newsFormat === 'split'
          ? Number((Number(placement.price_multiplier) * 0.5).toFixed(3))
          : Number(placement.price_multiplier),
      channel: placement.channel,
    })),
  };
}

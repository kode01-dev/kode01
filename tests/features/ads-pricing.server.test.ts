import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

type PricingPlan = {
  id: string;
  code: string;
  name: string;
  duration_days: number;
  price: number;
  price_usd: number | null;
  currency: string;
  is_active: boolean;
};

type Placement = {
  id: string;
  slug: 'free' | 'news' | 'newsletter_footer';
  channel: 'web' | 'email';
  price_multiplier: number;
  is_active: boolean;
};

let pricingPlans: PricingPlan[] = [];
let placements: Placement[] = [];

mock.module('server-only', {
  defaultExport: {},
});

mock.module('@/features/ads/server/repository', {
  namedExports: {
    getActivePricingPlans: async () => pricingPlans,
    getActivePlacements: async () => placements,
  },
});

async function loadPricingModule(scenario: string) {
  return import(`../../src/features/ads/server/pricing.ts?scenario=${scenario}-${Date.now()}-${Math.random()}`);
}

test('computeCampaignPrice returns CAD-first totals with compatibility fields', async () => {
  pricingPlans = [
    {
      id: 'plan-1',
      code: 'ads_7d',
      name: '7 days',
      duration_days: 7,
      price: 49,
      price_usd: 49,
      currency: 'cad',
      is_active: true,
    },
  ];
  placements = [
    { id: 'news', slug: 'news', channel: 'web', price_multiplier: 1.5, is_active: true },
    { id: 'newsletter', slug: 'newsletter_footer', channel: 'email', price_multiplier: 1.75, is_active: true },
  ];

  const { computeCampaignPrice } = await loadPricingModule('cad-pricing');
  const result = await computeCampaignPrice({
    pricingPlanId: 'plan-1',
    placementSlugs: ['news', 'newsletter_footer'],
    newsFormat: 'full',
  });

  assert.equal(result.currency, 'cad');
  assert.equal(result.basePrice, 49);
  assert.equal(result.totalPrice, 159.25);
  assert.equal(result.basePriceUsd, 49);
  assert.equal(result.totalPriceUsd, 159.25);
});

test('computeCampaignPrice applies split-news multiplier correctly', async () => {
  pricingPlans = [
    {
      id: 'plan-1',
      code: 'ads_7d',
      name: '7 days',
      duration_days: 7,
      price: 49,
      price_usd: 49,
      currency: 'cad',
      is_active: true,
    },
  ];
  placements = [
    { id: 'news', slug: 'news', channel: 'web', price_multiplier: 1.5, is_active: true },
  ];

  const { computeCampaignPrice } = await loadPricingModule('split-news');
  const result = await computeCampaignPrice({
    pricingPlanId: 'plan-1',
    placementSlugs: ['news'],
    newsFormat: 'split',
  });

  assert.equal(result.totalPrice, 36.75);
  assert.equal(result.placements[0]?.multiplier, 0.75);
});

test('computeCampaignPrice requires newsFormat when news placement is selected', async () => {
  pricingPlans = [
    {
      id: 'plan-1',
      code: 'ads_7d',
      name: '7 days',
      duration_days: 7,
      price: 49,
      price_usd: 49,
      currency: 'cad',
      is_active: true,
    },
  ];
  placements = [
    { id: 'news', slug: 'news', channel: 'web', price_multiplier: 1.5, is_active: true },
  ];

  const { computeCampaignPrice } = await loadPricingModule('missing-format');
  await assert.rejects(
    () =>
      computeCampaignPrice({
        pricingPlanId: 'plan-1',
        placementSlugs: ['news'],
      }),
    /newsFormat is required/,
  );
});

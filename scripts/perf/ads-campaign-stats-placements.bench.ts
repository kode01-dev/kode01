import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  aggregateCampaignEvents,
  buildCampaignStatsResponse,
  type CampaignStatsEventAggregate,
  type CampaignStatsPlacement,
} from '../../src/features/ads/server/campaign-stats';

const EVENT_COUNT = 100_000;
const PLACEMENT_COUNT = 250;
const ITERATIONS = 30;
const WARMUP_ITERATIONS = 5;

function createFixture() {
  const placements: CampaignStatsPlacement[] = Array.from({ length: PLACEMENT_COUNT }, (_, index) => ({
    id: `placement-${index}`,
    slug: `placement-${index}`,
  }));
  const eventTypes: CampaignStatsEventAggregate['event_type'][] = [
    'impression',
    'click',
    'email_delivered',
    'email_ad_click',
  ];
  const events: CampaignStatsEventAggregate[] = Array.from({ length: EVENT_COUNT }, (_, index) => ({
    event_type: eventTypes[index % eventTypes.length],
    channel: index % 4 < 2 ? 'web' : 'email',
    quantity: (index % 5) + 1,
    placement_id: index % 23 === 0 ? null : `placement-${index % PLACEMENT_COUNT}`,
  }));

  return { events, placements };
}

function legacyCampaignStats(
  events: CampaignStatsEventAggregate[],
  placements: CampaignStatsPlacement[],
) {
  const totals = {
    webImpressions: 0,
    webClicks: 0,
    webCtr: 0,
    emailDelivered: 0,
    emailClicks: 0,
    emailCtr: 0,
  };
  const byPlacement: Record<string, { impressions: number; clicks: number; ctr: number }> = {};

  const placementIds = Array.from(
    new Set(((events ?? []) as CampaignStatsEventAggregate[]).map((event) => event.placement_id).filter(Boolean)),
  ) as string[];
  const placementMap = new Map<string, string>();
  if (placementIds.length > 0) {
    for (const placement of placements ?? []) {
      placementMap.set(String(placement.id), String(placement.slug));
    }
  }

  for (const event of (events ?? []) as CampaignStatsEventAggregate[]) {
    const quantity = Number(event.quantity || 0);
    if (event.event_type === 'impression' && event.channel === 'web') totals.webImpressions += quantity;
    if (event.event_type === 'click' && event.channel === 'web') totals.webClicks += quantity;
    if (event.event_type === 'email_delivered' && event.channel === 'email') totals.emailDelivered += quantity;
    if (event.event_type === 'email_ad_click' && event.channel === 'email') totals.emailClicks += quantity;

    const slug = event.placement_id ? placementMap.get(event.placement_id) : undefined;
    if (slug) {
      if (!byPlacement[slug]) {
        byPlacement[slug] = { impressions: 0, clicks: 0, ctr: 0 };
      }
      if (event.event_type === 'impression') byPlacement[slug].impressions += quantity;
      if (event.event_type === 'click' || event.event_type === 'email_ad_click') byPlacement[slug].clicks += quantity;
    }
  }

  totals.webCtr = totals.webImpressions > 0 ? Number(((totals.webClicks / totals.webImpressions) * 100).toFixed(2)) : 0;
  totals.emailCtr = totals.emailDelivered > 0 ? Number(((totals.emailClicks / totals.emailDelivered) * 100).toFixed(2)) : 0;
  for (const key of Object.keys(byPlacement)) {
    const row = byPlacement[key];
    row.ctr = row.impressions > 0 ? Number(((row.clicks / row.impressions) * 100).toFixed(2)) : 0;
  }

  return { ...totals, byPlacement };
}

function optimizedCampaignStats(
  events: CampaignStatsEventAggregate[],
  placements: CampaignStatsPlacement[],
) {
  return buildCampaignStatsResponse(aggregateCampaignEvents(events), placements);
}

function runCase(args: {
  name: string;
  execute: (events: CampaignStatsEventAggregate[], placements: CampaignStatsPlacement[]) => unknown;
}) {
  const { events, placements } = createFixture();
  const durationsMs: number[] = [];

  for (let iteration = 0; iteration < ITERATIONS + WARMUP_ITERATIONS; iteration += 1) {
    const startedAt = performance.now();
    args.execute(events, placements);
    const durationMs = performance.now() - startedAt;

    if (iteration >= WARMUP_ITERATIONS) {
      durationsMs.push(durationMs);
    }
  }

  const averageMs = durationsMs.reduce((total, value) => total + value, 0) / durationsMs.length;
  return {
    name: args.name,
    avgMs: Number(averageMs.toFixed(2)),
    minMs: Number(Math.min(...durationsMs).toFixed(2)),
    maxMs: Number(Math.max(...durationsMs).toFixed(2)),
  };
}

const fixture = createFixture();
assert.deepEqual(
  optimizedCampaignStats(fixture.events, fixture.placements),
  legacyCampaignStats(fixture.events, fixture.placements),
);

const baseline = runCase({
  name: 'baseline_map_filter_set_then_rescan_events',
  execute: legacyCampaignStats,
});
const optimized = runCase({
  name: 'optimized_single_pass_event_aggregation',
  execute: optimizedCampaignStats,
});
const improvementMs = baseline.avgMs - optimized.avgMs;
const improvementPct = (improvementMs / baseline.avgMs) * 100;

console.log(JSON.stringify({ eventCount: EVENT_COUNT, placementCount: PLACEMENT_COUNT, iterations: ITERATIONS }));
console.log(JSON.stringify(baseline));
console.log(JSON.stringify(optimized));
console.log(
  JSON.stringify({
    name: 'delta',
    improvementMs: Number(improvementMs.toFixed(2)),
    improvementPct: Number(improvementPct.toFixed(2)),
  }),
);

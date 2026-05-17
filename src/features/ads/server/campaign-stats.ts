export type CampaignStatsEventAggregate = {
  event_type: 'impression' | 'click' | 'email_delivered' | 'email_ad_click';
  channel: 'web' | 'email';
  quantity: number | string | null;
  placement_id: string | null;
};

export type CampaignStatsPlacement = {
  id: string | number | null;
  slug: string | number | null;
};

export type CampaignStatsPlacementRow = {
  impressions: number;
  clicks: number;
  ctr: number;
};

type CampaignStatsTotals = {
  webImpressions: number;
  webClicks: number;
  webCtr: number;
  emailDelivered: number;
  emailClicks: number;
  emailCtr: number;
};

export type CampaignStatsDraft = {
  totals: CampaignStatsTotals;
  placementIds: string[];
  byPlacementId: Record<string, CampaignStatsPlacementRow>;
};

function createPlacementStats(): CampaignStatsPlacementRow {
  return { impressions: 0, clicks: 0, ctr: 0 };
}

function calculateCtr(clicks: number, impressions: number) {
  return impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
}

export function aggregateCampaignEvents(events: CampaignStatsEventAggregate[]): CampaignStatsDraft {
  const totals: CampaignStatsTotals = {
    webImpressions: 0,
    webClicks: 0,
    webCtr: 0,
    emailDelivered: 0,
    emailClicks: 0,
    emailCtr: 0,
  };
  const byPlacementId: Record<string, CampaignStatsPlacementRow> = {};
  const seenPlacementIds = new Set<string>();
  const placementIds: string[] = [];

  for (const event of events) {
    const quantity = Number(event.quantity || 0);
    if (event.event_type === 'impression' && event.channel === 'web') totals.webImpressions += quantity;
    if (event.event_type === 'click' && event.channel === 'web') totals.webClicks += quantity;
    if (event.event_type === 'email_delivered' && event.channel === 'email') totals.emailDelivered += quantity;
    if (event.event_type === 'email_ad_click' && event.channel === 'email') totals.emailClicks += quantity;

    if (!event.placement_id) {
      continue;
    }

    if (!seenPlacementIds.has(event.placement_id)) {
      seenPlacementIds.add(event.placement_id);
      placementIds.push(event.placement_id);
    }

    byPlacementId[event.placement_id] ??= createPlacementStats();
    if (event.event_type === 'impression') byPlacementId[event.placement_id].impressions += quantity;
    if (event.event_type === 'click' || event.event_type === 'email_ad_click') {
      byPlacementId[event.placement_id].clicks += quantity;
    }
  }

  return { totals, placementIds, byPlacementId };
}

export function buildCampaignStatsResponse(
  draft: CampaignStatsDraft,
  placements: CampaignStatsPlacement[],
) {
  const byPlacement: Record<string, CampaignStatsPlacementRow> = {};

  for (const placement of placements) {
    const placementStats = draft.byPlacementId[String(placement.id)];
    if (!placementStats) {
      continue;
    }

    const slug = String(placement.slug);
    if (!slug) {
      continue;
    }

    byPlacement[slug] ??= createPlacementStats();
    byPlacement[slug].impressions += placementStats.impressions;
    byPlacement[slug].clicks += placementStats.clicks;
  }

  const totals = {
    ...draft.totals,
    webCtr: calculateCtr(draft.totals.webClicks, draft.totals.webImpressions),
    emailCtr: calculateCtr(draft.totals.emailClicks, draft.totals.emailDelivered),
  };

  for (const row of Object.values(byPlacement)) {
    row.ctr = calculateCtr(row.clicks, row.impressions);
  }

  return { ...totals, byPlacement };
}

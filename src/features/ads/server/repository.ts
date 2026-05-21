import 'server-only';

import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database.types';
import { AdPlacementSlug, SponsoredCreative } from '@/features/ads/types';

type PlacementRow = {
  id: string;
  slug: AdPlacementSlug;
  channel: 'web' | 'email';
  price_multiplier: number;
  is_active: boolean;
};

type PricingPlanRow = {
  id: string;
  code: string;
  name: string;
  duration_days: number;
  price: number;
  price_usd: number | null;
  currency: string;
  is_active: boolean;
};

type CampaignRow = {
  id: string;
  status: string;
  is_paid: boolean;
  start_at: string | null;
  end_at: string | null;
  news_format: 'split' | 'full' | null;
};

type CreativeRow = {
  campaign_id: string;
  id: string;
  placement_slug: 'news' | 'newsletter_footer' | null;
  title: string;
  cta_text: string;
  image_url: string;
  destination_url: string;
  destination_kind: 'internal' | 'external';
  validation_status: string;
};

type CampaignCreativeCandidate = {
  campaign: CampaignRow;
  creative: CreativeRow;
};

type CreativeClickTargetRow = {
  destination_url: string | null;
  destination_kind: 'internal' | 'external' | null;
  placement_slug: 'news' | 'newsletter_footer' | null;
};

function hashToUnitInterval(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) / 4294967296;
}

function normalizeNewsFormat(value: string | null | undefined): 'split' | 'full' {
  return value === 'full' ? 'full' : 'split';
}

function buildNewsServingWindow(candidates: CampaignCreativeCandidate[], bucket: number) {
  const fullCandidates = candidates.filter((item) => normalizeNewsFormat(item.campaign.news_format) === 'full');
  const splitCandidates = candidates.filter((item) => normalizeNewsFormat(item.campaign.news_format) === 'split');

  const window: CampaignCreativeCandidate[] = [];
  if (fullCandidates.length > 0) {
    window.push(fullCandidates[bucket % fullCandidates.length]);
  }

  if (splitCandidates.length > 0) {
    const start = bucket % splitCandidates.length;
    const maxSplitWindow = Math.min(2, splitCandidates.length);
    for (let i = 0; i < maxSplitWindow; i += 1) {
      window.push(splitCandidates[(start + i) % splitCandidates.length]);
    }
  }

  if (window.length === 0) {
    return candidates.slice(0, 3);
  }

  return window;
}

function pickWeightedWithoutReplacement(
  window: CampaignCreativeCandidate[],
  limit: number,
  seedPrefix: string,
) {
  const selected: CampaignCreativeCandidate[] = [];
  const pool = [...window];
  const target = Math.max(1, Math.min(limit, window.length));

  while (selected.length < target && pool.length > 0) {
    const hasFull = pool.some((item) => normalizeNewsFormat(item.campaign.news_format) === 'full');
    const splitCount = pool.filter((item) => normalizeNewsFormat(item.campaign.news_format) === 'split').length;

    const weighted = pool.map((item) => {
      const format = normalizeNewsFormat(item.campaign.news_format);
      if (!hasFull) {
        return { item, weight: 1 / pool.length };
      }

      if (format === 'full') {
        return { item, weight: 0.6 };
      }

      return { item, weight: splitCount > 0 ? 0.4 / splitCount : 0 };
    });

    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    const threshold = hashToUnitInterval(`${seedPrefix}:${selected.length}`) * Math.max(totalWeight, 1);

    let cumulative = 0;
    let selectedIndex = 0;
    for (let i = 0; i < weighted.length; i += 1) {
      cumulative += weighted[i].weight;
      if (threshold <= cumulative) {
        selectedIndex = i;
        break;
      }
    }

    selected.push(weighted[selectedIndex].item);
    const poolIndex = pool.findIndex((entry) => entry.campaign.id === weighted[selectedIndex].item.campaign.id);
    if (poolIndex >= 0) {
      pool.splice(poolIndex, 1);
    } else {
      pool.shift();
    }
  }

  return selected;
}

export type AuthContext = {
  userId: string;
  role: string | null;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: profile?.role ?? null,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) {
    throw new Error('UNAUTHORIZED');
  }
  return auth;
}

export async function getActivePlacements(): Promise<PlacementRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_placements')
    .select('id, slug, channel, price_multiplier, is_active')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to load ad placements: ${error.message}`);
  }

  return (data ?? []) as PlacementRow[];
}

export async function getActivePricingPlans(): Promise<PricingPlanRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_pricing_plans')
    .select('id, code, name, duration_days, price, price_usd, currency, is_active')
    .eq('is_active', true)
    .order('duration_days', { ascending: true });

  if (error) {
    throw new Error(`Failed to load ad pricing plans: ${error.message}`);
  }

  return (data ?? []) as PricingPlanRow[];
}

export async function resolveActiveCreativeForPlacement(
  placementSlug: AdPlacementSlug,
): Promise<SponsoredCreative | null> {
  const creatives = await resolveActiveCreativesForPlacement(placementSlug, 1);
  return creatives[0] ?? null;
}

export async function resolveCreativeClickTarget(args: {
  campaignId: string;
  creativeId: string;
  placementSlug: AdPlacementSlug;
}): Promise<{ destinationUrl: string; destinationKind: 'internal' | 'external' } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_creatives')
    .select('destination_url, destination_kind, placement_slug')
    .eq('campaign_id', args.campaignId)
    .eq('id', args.creativeId)
    .eq('validation_status', 'approved')
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as CreativeClickTargetRow;
  if (!row.destination_url || !row.destination_kind) {
    return null;
  }

  if (row.placement_slug && row.placement_slug !== args.placementSlug) {
    return null;
  }

  return {
    destinationUrl: row.destination_url,
    destinationKind: row.destination_kind,
  };
}

export async function resolveActiveCreativesForPlacement(
  placementSlug: AdPlacementSlug,
  limit = 1,
): Promise<SponsoredCreative[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    console.warn(`[Ads] Skipping sponsored ad resolution for "${placementSlug}": SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is not configured.`);
    return [];
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const maxCreatives = Math.max(1, Math.min(limit, 10));

  const { data: placement, error: placementError } = await admin
    .from('ad_placements')
    .select('id, slug, channel, price_multiplier, is_active')
    .eq('slug', placementSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (placementError || !placement) {
    return [];
  }

  const { data: campaignLinks, error: linksError } = await admin
    .from('ad_campaign_placements')
    .select('campaign_id')
    .eq('placement_id', placement.id);

  if (linksError || !campaignLinks || campaignLinks.length === 0) {
    return [];
  }

  const campaignIds = campaignLinks
    .map((row) => row.campaign_id as string)
    .filter(Boolean);

  if (campaignIds.length === 0) return [];

  const { data: campaigns, error: campaignsError } = await admin
    .from('ad_campaigns')
    .select('id, status, is_paid, start_at, end_at, news_format')
    .in('id', campaignIds)
    .in('status', ['approved', 'active'])
    .order('created_at', { ascending: true })
    .limit(Math.max(20, maxCreatives * 10));

  if (campaignsError || !campaigns || campaigns.length === 0) {
    return [];
  }

  const eligibleCampaigns = (campaigns as CampaignRow[]).filter((campaign) => {
    if (campaign.status !== 'approved' && campaign.status !== 'active') return false;
    if (campaign.start_at && campaign.start_at > nowIso) return false;
    if (campaign.end_at && campaign.end_at < nowIso) return false;
    return true;
  });

  if (eligibleCampaigns.length === 0) return [];

  const eligibleCampaignIds = eligibleCampaigns.map((campaign) => campaign.id);
  const { data: creatives, error: creativesError } = await admin
    .from('ad_creatives')
    .select('campaign_id, id, placement_slug, title, cta_text, image_url, destination_url, destination_kind, validation_status')
    .in('campaign_id', eligibleCampaignIds)
    .eq('validation_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(Math.max(30, eligibleCampaignIds.length * 2));

  if (creativesError || !creatives || creatives.length === 0) {
    return [];
  }

  const creativesByCampaignId = new Map<string, CreativeRow[]>();
  for (const creative of creatives as CreativeRow[]) {
    const existing = creativesByCampaignId.get(creative.campaign_id) ?? [];
    existing.push(creative);
    creativesByCampaignId.set(creative.campaign_id, existing);
  }

  const candidates: CampaignCreativeCandidate[] = [];
  for (const campaign of eligibleCampaigns) {
    const campaignCreatives = creativesByCampaignId.get(campaign.id) ?? [];
    const creative = campaignCreatives.find((item) => item.placement_slug === placementSlug)
      ?? campaignCreatives.find((item) => item.placement_slug === null)
      ?? campaignCreatives[0];
    if (!creative) continue;

    candidates.push({
      campaign,
      creative,
    });
  }

  if (candidates.length === 0) return [];

  let selectedCandidates = candidates.slice(0, maxCreatives);
  if (placementSlug === 'news') {
    const bucket = Math.floor(Date.now() / (1000 * 60 * 15));
    const window = buildNewsServingWindow(candidates, bucket);
    selectedCandidates = pickWeightedWithoutReplacement(
      window,
      maxCreatives,
      `${placementSlug}:${bucket}:${window.map((item) => item.campaign.id).join('|')}`,
    );

    if (selectedCandidates.length < maxCreatives) {
      const selectedIds = new Set(selectedCandidates.map((item) => item.campaign.id));
      for (const fallback of candidates) {
        if (selectedIds.has(fallback.campaign.id)) continue;
        selectedCandidates.push(fallback);
        if (selectedCandidates.length >= maxCreatives) break;
      }
    }
  }

  return selectedCandidates.slice(0, maxCreatives).map((item) => ({
    campaignId: item.campaign.id,
    creativeId: item.creative.id,
    title: item.creative.title,
    ctaText: item.creative.cta_text,
    imageUrl: item.creative.image_url,
    destinationUrl: item.creative.destination_url,
    destinationKind: item.creative.destination_kind,
  }));
}

export async function recordAdEvent(args: {
  campaignId: string;
  creativeId?: string;
  placementSlug?: AdPlacementSlug;
  eventType: 'impression' | 'click' | 'email_delivered' | 'email_ad_click';
  channel: 'web' | 'email';
  locale?: string | null;
  pagePath?: string | null;
  fingerprint?: string | null;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  let placementId: string | null = null;

  if (args.placementSlug) {
    const { data: placement } = await admin
      .from('ad_placements')
      .select('id')
      .eq('slug', args.placementSlug)
      .maybeSingle();
    placementId = (placement?.id as string | undefined) ?? null;
  }

  await admin.from('ad_events').insert({
    campaign_id: args.campaignId,
    creative_id: args.creativeId ?? null,
    placement_id: placementId,
    event_type: args.eventType,
    channel: args.channel,
    locale: args.locale ?? null,
    page_path: args.pagePath ?? null,
    quantity: Math.max(1, args.quantity ?? 1),
    fingerprint: args.fingerprint ?? null,
    metadata: (args.metadata ?? {}) as Json,
  });
}

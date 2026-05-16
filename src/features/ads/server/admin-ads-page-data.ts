import 'server-only';

import { z } from 'zod';

import { getServerAdminAuthState } from '@/lib/auth/server-admin';
import { createAdminClient } from '@/lib/supabase/admin';

const campaignCreativeSchema = z.object({
  id: z.string(),
  title: z.string(),
  cta_text: z.string(),
  image_url: z.string(),
  destination_url: z.string(),
  destination_kind: z.string(),
  validation_status: z.string(),
  locale: z.string().nullable().optional(),
});

const campaignPlacementSchema = z.object({
  ad_placements: z
    .object({
      slug: z.string().nullable().optional(),
      channel: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

const campaignRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  total_price: z.union([z.number(), z.string()]).nullable(),
  total_price_usd: z.union([z.number(), z.string()]).nullable(),
  currency: z.string().nullable(),
  created_at: z.string(),
  start_at: z.string().nullable(),
  end_at: z.string().nullable(),
  owner_user_id: z.string().nullable(),
  duration_days: z.number().nullable(),
  is_paid: z.boolean().nullable(),
  news_format: z.string().nullable(),
  rejected_reason: z.string().nullable(),
  ad_creatives: z.array(campaignCreativeSchema).nullable().optional(),
  ad_campaign_placements: z.array(campaignPlacementSchema).nullable().optional(),
});

const revenueRowSchema = z.object({
  amount: z.union([z.number(), z.string()]).nullable().optional(),
  amount_usd: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().nullable().optional(),
});

export type CampaignRow = z.infer<typeof campaignRowSchema>;

type AdminAdsPageData = {
  totalActive: number;
  pendingReview: number;
  totalImpressions: number;
  revenueSummary: string;
  campaignRows: CampaignRow[];
  ongoingCampaigns: CampaignRow[];
  pendingCampaigns: CampaignRow[];
  hasQueryErrors: boolean;
};

export type AdminAdsPageDataResult =
  | { kind: 'redirect'; destination: string }
  | { kind: 'ok'; data: AdminAdsPageData };

function formatMoney(value: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value.toFixed(2)));
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseRows<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context: string,
): T[] {
  const parsed = z.array(schema).safeParse(input);
  if (parsed.success) return parsed.data;

  if (Array.isArray(input)) {
    const safeRows: T[] = [];
    for (const entry of input) {
      const result = schema.safeParse(entry);
      if (result.success) {
        safeRows.push(result.data);
      }
    }

    console.error(`[AdminAds] Invalid ${context} payload`, {
      droppedRows: input.length - safeRows.length,
      keptRows: safeRows.length,
    });
    return safeRows;
  }

  console.error(`[AdminAds] Invalid ${context} payload`, {
    issues: parsed.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
  return [];
}

export async function loadAdminAdsPageData(locale: string): Promise<AdminAdsPageDataResult> {
  const auth = await getServerAdminAuthState();
  if (auth.state === 'unauthenticated') {
    return { kind: 'redirect', destination: `/${locale}` };
  }
  if (auth.state === 'forbidden') {
    return { kind: 'redirect', destination: `/${locale}/buyer` };
  }

  const admin = createAdminClient();
  const [
    { count: totalActive, error: totalActiveError },
    { count: pendingReview, error: pendingReviewError },
    { data: revenueData, error: revenueError },
    { count: totalImpressions, error: totalImpressionsError },
    { data: activeCampaignsData, error: activeCampaignsError },
    { data: pendingCampaignsData, error: pendingCampaignsError },
    { data: campaigns, error: campaignsError },
  ] = await Promise.all([
    admin.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
    admin.from('ad_orders').select('amount, amount_usd, currency').eq('status', 'paid'),
    admin.from('ad_events').select('id', { count: 'exact', head: true }).eq('event_type', 'impression'),
    admin
      .from('ad_campaigns')
      .select(`
        id,
        name,
        status,
        total_price,
        total_price_usd,
        currency,
        created_at,
        start_at,
        end_at,
        owner_user_id,
        duration_days,
        is_paid,
        news_format,
        rejected_reason,
        ad_creatives (
          id, title, cta_text, image_url, destination_url, destination_kind, validation_status, locale
        ),
        ad_campaign_placements (
          ad_placements (slug, channel)
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('ad_campaigns')
      .select(`
        id,
        name,
        status,
        total_price,
        total_price_usd,
        currency,
        created_at,
        start_at,
        end_at,
        owner_user_id,
        duration_days,
        is_paid,
        news_format,
        rejected_reason,
        ad_creatives (
          id, title, cta_text, image_url, destination_url, destination_kind, validation_status, locale
        ),
        ad_campaign_placements (
          ad_placements (slug, channel)
        )
      `)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('ad_campaigns')
      .select(`
        id,
        name,
        status,
        total_price,
        total_price_usd,
        currency,
        created_at,
        start_at,
        end_at,
        owner_user_id,
        duration_days,
        is_paid,
        news_format,
        rejected_reason,
        ad_creatives (
          id, title, cta_text, image_url, destination_url, destination_kind, validation_status, locale
        ),
        ad_campaign_placements (
          ad_placements (slug, channel)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const queryErrors = [
    totalActiveError,
    pendingReviewError,
    revenueError,
    totalImpressionsError,
    activeCampaignsError,
    pendingCampaignsError,
    campaignsError,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    console.error('[AdminAds] Failed one or more dashboard queries', {
      failures: queryErrors.map((error) => ({
        code: error?.code ?? null,
        message: error?.message ?? 'unknown',
      })),
    });
  }

  const revenueRows = parseRows(revenueRowSchema, revenueData, 'revenue');
  const revenueByCurrency = revenueRows.reduce((acc, order) => {
    const normalizedCurrency =
      typeof order.currency === 'string' ? order.currency.toLowerCase() : 'usd';
    const amount = toFiniteNumber(order.amount ?? order.amount_usd ?? 0);
    if (!Number.isFinite(amount)) return acc;
    acc.set(normalizedCurrency, (acc.get(normalizedCurrency) ?? 0) + amount);
    return acc;
  }, new Map<string, number>());

  const revenueSummary =
    revenueByCurrency.size === 0
      ? formatMoney(0, locale, 'cad')
      : [...revenueByCurrency.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, amount]) => formatMoney(amount, locale, currency))
          .join(' · ');

  return {
    kind: 'ok',
    data: {
      totalActive: totalActive ?? 0,
      pendingReview: pendingReview ?? 0,
      totalImpressions: totalImpressions ?? 0,
      revenueSummary,
      campaignRows: parseRows(campaignRowSchema, campaigns, 'campaigns'),
      ongoingCampaigns: parseRows(campaignRowSchema, activeCampaignsData, 'active campaigns'),
      pendingCampaigns: parseRows(campaignRowSchema, pendingCampaignsData, 'pending campaigns'),
      hasQueryErrors: queryErrors.length > 0,
    },
  };
}

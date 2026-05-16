import 'server-only';

export const ADS_BLOCK_TIMEZONE = 'America/Toronto';

export type NewsFormat = 'split' | 'full';

export type ReserveInventoryResult = {
  ok: boolean;
  errorCode?: string;
  message?: string;
  blockStart?: string;
  blockCount?: number;
  slotKind?: NewsFormat;
};

export type NewsInventoryWindow = {
  blockStart: string;
  blockCount: number;
  startAt: string;
  endAt: string;
};

type RpcResult = PromiseLike<{ data: unknown; error: { message?: string } | null }>;
type DeleteResult = PromiseLike<{ error: { message?: string } | null }>;

type AdminClientLike = {
  rpc: (fn: string, params?: Record<string, unknown>) => RpcResult;
  from: (table: string) => {
    delete: () => {
      match: (values: Record<string, unknown>) => DeleteResult;
    };
  };
};

export function resolveCampaignBlockCount(args: {
  pricingPlanCode?: string | null;
  durationDays?: number | null;
}) {
  const normalizedCode = (args.pricingPlanCode ?? '').toLowerCase();
  if (normalizedCode === 'ads_30d') return 4;
  if (normalizedCode === 'ads_7d') return 1;

  const duration = Number(args.durationDays ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  if (duration >= 30) return 4;
  return Math.max(1, Math.ceil(duration / 7));
}

export function buildNewsRotationPolicySnapshot() {
  return {
    version: 'v3',
    placement: 'news',
    timezone: ADS_BLOCK_TIMEZONE,
    blockAnchor: 'monday_00_00',
    inventory: {
      fullMax: 1,
      splitMax: 4,
      activeWindowSize: 3,
      activeWindowPattern: '1_full_plus_2_split',
      fullTargetShare: 0.6,
    },
  } as const;
}

export async function reserveNewsInventory(args: {
  admin: AdminClientLike;
  campaignId: string;
  newsFormat: NewsFormat;
  blockCount: number;
  holdMinutes?: number;
}) {
  const holdMinutes = Math.max(5, args.holdMinutes ?? 30);
  const expiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();

  const { data, error } = await args.admin.rpc('reserve_news_inventory', {
    p_campaign_id: args.campaignId,
    p_news_format: args.newsFormat,
    p_block_count: args.blockCount,
    p_timezone: ADS_BLOCK_TIMEZONE,
    p_hold_expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to reserve news inventory');
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: payload.ok === true,
    errorCode: typeof payload.error_code === 'string' ? payload.error_code : undefined,
    message: typeof payload.message === 'string' ? payload.message : undefined,
    blockStart: typeof payload.block_start === 'string' ? payload.block_start : undefined,
    blockCount: typeof payload.block_count === 'number' ? payload.block_count : undefined,
    slotKind: payload.slot_kind === 'full' || payload.slot_kind === 'split' ? payload.slot_kind : undefined,
  } satisfies ReserveInventoryResult;
}

export async function confirmNewsInventory(args: {
  admin: AdminClientLike;
  campaignId: string;
}) {
  const { data, error } = await args.admin.rpc('confirm_news_inventory', {
    p_campaign_id: args.campaignId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to confirm news inventory');
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: payload.ok === true,
    confirmedCount: typeof payload.confirmed_count === 'number' ? payload.confirmed_count : 0,
  };
}

export async function getConfirmedNewsInventoryWindow(args: {
  admin: AdminClientLike;
  campaignId: string;
}) {
  const { data, error } = await args.admin.rpc('get_news_inventory_window', {
    p_campaign_id: args.campaignId,
    p_timezone: ADS_BLOCK_TIMEZONE,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to load news inventory window');
  }

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return null;

  const blockStart = typeof row.block_start === 'string' ? row.block_start : null;
  const blockCount = typeof row.block_count === 'number' ? row.block_count : null;
  const startAt = typeof row.start_at === 'string' ? row.start_at : null;
  const endAt = typeof row.end_at === 'string' ? row.end_at : null;

  if (!blockStart || !blockCount || !startAt || !endAt) {
    return null;
  }

  return {
    blockStart,
    blockCount,
    startAt,
    endAt,
  } satisfies NewsInventoryWindow;
}

export async function releaseNewsInventoryHolds(args: {
  admin: AdminClientLike;
  campaignId: string;
}) {
  const { error } = await args.admin
    .from('ad_inventory_reservations')
    .delete()
    .match({
      campaign_id: args.campaignId,
      placement_slug: 'news',
      status: 'hold',
    });

  if (error) {
    throw new Error(error.message ?? 'Failed to release news inventory holds');
  }
}

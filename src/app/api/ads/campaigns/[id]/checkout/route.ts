import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { getAppBaseUrl } from '@/lib/env/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  releaseNewsInventoryHolds,
  type NewsFormat,
  reserveNewsInventory,
  resolveCampaignBlockCount,
} from '@/features/ads/server/inventory';
import type { Database } from '@/types/database.types';

type InventoryAdminClient = Parameters<typeof reserveNewsInventory>[0]['admin'];

function resolveCheckoutLocale(value: unknown): 'en' | 'fr' {
  return value === 'fr' ? 'fr' : 'en';
}

function resolveCurrency(value: unknown, fallback = 'usd') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(normalized)) return fallback;
  return normalized;
}

function resolveReturnPath(value: unknown, locale: 'en' | 'fr') {
  const defaultPath = `/${locale}/advertise`;
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return defaultPath;
  }

  try {
    const parsed = new URL(value, 'https://kode01.local');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return defaultPath;
  }
}

function buildCheckoutReturnUrl(args: {
  baseUrl: string;
  returnPath: string;
  status: 'success' | 'cancel';
  campaignId: string;
}) {
  const target = new URL(args.returnPath, args.baseUrl);
  target.searchParams.set('ad_checkout', args.status);
  target.searchParams.set('campaign_id', args.campaignId);
  return target.toString();
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const isNewsFormat = (value: unknown): value is NewsFormat => value === 'split' || value === 'full';

  let reservedNewsInventoryCampaignId: string | null = null;
  const releaseReservedInventory = async () => {
    if (!reservedNewsInventoryCampaignId) return;
    await releaseNewsInventoryHolds({
      admin: createAdminClient() as unknown as InventoryAdminClient,
      campaignId: reservedNewsInventoryCampaignId,
    });
    reservedNewsInventoryCampaignId = null;
  };

  try {
    const { id } = await params;
    const requestBody = await req.json().catch(() => null) as
      | { locale?: string; returnPath?: string }
      | null;

    const checkoutLocale = resolveCheckoutLocale(requestBody?.locale);
    const returnPath = resolveReturnPath(requestBody?.returnPath, checkoutLocale);

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: campaign, error: campaignError } = await admin
      .from('ad_campaigns')
      .select(
        `
        id,
        owner_user_id,
        name,
        total_price,
        total_price_usd,
        currency,
        status,
        is_paid,
        pricing_plan_id,
        duration_days,
        news_format,
        ad_campaign_placements (
          ad_placements (slug)
        )
      `,
      )
      .eq('id', id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (campaign.is_paid) {
      return NextResponse.json({ error: 'Campaign already paid' }, { status: 400 });
    }

    const campaignAmount = Number(campaign.total_price ?? campaign.total_price_usd);
    const campaignCurrency = resolveCurrency(campaign.currency, 'usd');
    const amountCents = Math.round(campaignAmount * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid campaign amount' }, { status: 400 });
    }

    const placementSlugs = ((campaign.ad_campaign_placements ?? []) as Array<{
      ad_placements?: { slug?: string | null } | null;
    }>)
      .map((row) => row.ad_placements?.slug)
      .filter((slug): slug is string => Boolean(slug));

    const includesNewsPlacement = placementSlugs.includes('news');
    if (includesNewsPlacement && !isNewsFormat(campaign.news_format)) {
      return NextResponse.json({ error: 'News format is required for news campaigns' }, { status: 400 });
    }

    if (includesNewsPlacement) {
      const newsFormat = campaign.news_format;
      if (!isNewsFormat(newsFormat)) {
        return NextResponse.json({ error: 'News format is required for news campaigns' }, { status: 400 });
      }

      const { data: planRow, error: planError } = await admin
        .from('ad_pricing_plans')
        .select('code, duration_days')
        .eq('id', campaign.pricing_plan_id!)
        .maybeSingle();

      if (planError) {
        return NextResponse.json({ error: planError.message }, { status: 500 });
      }

      const blockCount = resolveCampaignBlockCount({
        pricingPlanCode: planRow?.code ?? null,
        durationDays: Number(campaign.duration_days ?? planRow?.duration_days ?? 0),
      });

      const reservation = await reserveNewsInventory({
        admin: admin as unknown as InventoryAdminClient,
        campaignId: campaign.id,
        newsFormat,
        blockCount,
      });

      if (!reservation.ok) {
        return NextResponse.json(
          {
            error: reservation.message ?? 'Selected news slot is full for upcoming blocks.',
            code: reservation.errorCode ?? 'SLOT_FULL',
          },
          { status: 409 },
        );
      }

      reservedNewsInventoryCampaignId = campaign.id;
    }

    const baseUrl = getAppBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      adaptive_pricing: {
        enabled: true,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: campaignCurrency,
            unit_amount: amountCents,
            product_data: {
              name: `Ad Campaign: ${campaign.name}`,
              description: 'Sponsored placement campaign',
            },
          },
        },
      ],
      success_url: buildCheckoutReturnUrl({
        baseUrl,
        returnPath,
        status: 'success',
        campaignId: campaign.id,
      }),
      cancel_url: buildCheckoutReturnUrl({
        baseUrl,
        returnPath,
        status: 'cancel',
        campaignId: campaign.id,
      }),
      metadata: {
        kind: 'ad_campaign',
        campaignId: campaign.id,
        ownerUserId: user.id,
      },
    });

    const orderInsert: Database['public']['Tables']['ad_orders']['Insert'] = {
      campaign_id: campaign.id,
      owner_user_id: user.id,
      stripe_checkout_session_id: session.id,
      amount: campaignAmount,
      amount_usd: campaignAmount,
      currency: campaignCurrency,
      status: 'pending',
    };
    const { error: orderError } = await admin.from('ad_orders').insert(orderInsert);

    if (orderError) {
      await releaseReservedInventory();
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    await admin
      .from('ad_campaigns')
      .update({ status: 'pending_payment' })
      .eq('id', campaign.id);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    if (reservedNewsInventoryCampaignId) {
      try {
        await releaseReservedInventory();
      } catch (releaseError) {
        console.error('Failed to release reserved news inventory:', releaseError);
      }
    }

    console.error('Ad checkout error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

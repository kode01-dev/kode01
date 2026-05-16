import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminRole } from '@/lib/auth/roles';

type EventAggregate = {
  event_type: 'impression' | 'click' | 'email_delivered' | 'email_ad_click';
  channel: 'web' | 'email';
  quantity: number;
  placement_id: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
      .select('id, owner_user_id')
      .eq('id', id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = isAdminRole(profile?.role);
    if (!isAdmin && campaign.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: events, error: eventsError } = await admin
      .from('ad_events')
      .select('event_type, channel, quantity, placement_id')
      .eq('campaign_id', id);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

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
      new Set(((events ?? []) as EventAggregate[]).map((event) => event.placement_id).filter(Boolean)),
    ) as string[];
    const placementMap = new Map<string, string>();
    if (placementIds.length > 0) {
      const { data: placements } = await admin
        .from('ad_placements')
        .select('id, slug')
        .in('id', placementIds);
      for (const placement of placements ?? []) {
        placementMap.set(String(placement.id), String(placement.slug));
      }
    }

    for (const event of (events ?? []) as EventAggregate[]) {
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

    return NextResponse.json({ data: { ...totals, byPlacement } });
  } catch (error) {
    console.error('Campaign stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

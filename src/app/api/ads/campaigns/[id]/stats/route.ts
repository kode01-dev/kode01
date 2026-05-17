import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminRole } from '@/lib/auth/roles';
import {
  aggregateCampaignEvents,
  buildCampaignStatsResponse,
  type CampaignStatsEventAggregate,
  type CampaignStatsPlacement,
} from '@/features/ads/server/campaign-stats';

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

    const statsDraft = aggregateCampaignEvents((events ?? []) as CampaignStatsEventAggregate[]);
    let placements: CampaignStatsPlacement[] = [];
    if (statsDraft.placementIds.length > 0) {
      const { data: placementRows } = await admin
        .from('ad_placements')
        .select('id, slug')
        .in('id', statsDraft.placementIds);
      placements = (placementRows ?? []) as CampaignStatsPlacement[];
    }

    return NextResponse.json({ data: buildCampaignStatsResponse(statsDraft, placements) });
  } catch (error) {
    console.error('Campaign stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

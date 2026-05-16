import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSupabaseOrNull } from '@/app/api/admin/ads/_lib';

export async function GET(request: Request) {
  try {
    const adminSession = await getAdminSupabaseOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('ad_campaigns')
      .select(
        `
        id,
        owner_user_id,
        advertiser_type,
        name,
        status,
        total_price,
        total_price_usd,
        currency,
        is_paid,
        news_format,
        rotation_policy_snapshot,
        created_at,
        start_at,
        end_at,
        rejected_reason,
        ad_creatives (
          id, title, cta_text, image_url, destination_url, destination_kind, validation_status, locale
        ),
        ad_campaign_placements (
          ad_placements (slug, channel, price_multiplier)
        )
      `,
      )
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Admin list campaigns error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

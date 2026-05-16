import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/marketing/active
 * Get active campaigns for a specific page/context
 * Query params:
 *   - page: normalized page path (without locale prefix)
 *   - locale: 'en' or 'fr'
 *   - device: 'desktop', 'mobile', or 'tablet'
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Extract parameters
    let page_url = searchParams.get('page') || '/';
    const locale = searchParams.get('locale') || 'en';
    const device = searchParams.get('device') || 'desktop';

    // Normalize page URL - remove locale prefix if present
    // This handles /en/market → /market and /fr/market → /market
    if (page_url.startsWith('/en/') || page_url.startsWith('/fr/')) {
      page_url = '/' + page_url.split('/').slice(2).join('/');
      // Clean up double slashes and trailing slashes
      page_url = page_url.replace(/\/+/g, '/');
      if (page_url.endsWith('/') && page_url.length > 1) {
        page_url = page_url.slice(0, -1);
      }
    }

    // Ensure page_url starts with /
    if (!page_url.startsWith('/')) {
      page_url = '/' + page_url;
    }

    // Get user role if authenticated
    const { data: { user } } = await supabase.auth.getUser();
    let user_role = 'all';

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      user_role = profile?.role || 'all';
    }

    // Call Supabase RPC function to get matching campaigns
    const { data: campaigns, error } = await supabase.rpc(
      'get_active_campaigns_for_context',
      {
        p_page_url: page_url,
        p_locale: locale,
        p_user_role: user_role,
        p_device_type: device,
      }
    );

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    return NextResponse.json({
      campaigns: campaigns || [],
      context: {
        page: page_url,
        locale,
        device,
        user_role,
      },
    });
  } catch (error) {
    console.error('Error fetching active campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active campaigns', campaigns: [] },
      { status: 200 } // Return 200 even on error to prevent client-side issues
    );
  }
}

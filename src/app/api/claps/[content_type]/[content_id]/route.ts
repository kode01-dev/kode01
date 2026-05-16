import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { ClapStatsResponse } from '@/features/claps/types';

const CLAP_ANON_COOKIE = 'clap_anon_id';
const VALID_CONTENT_TYPES = new Set(['editorial_post', 'recap_post']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ content_type: string; content_id: string }> },
) {
  try {
    const { content_type, content_id } = await params;

    if (!VALID_CONTENT_TYPES.has(content_type) || !UUID_RE.test(content_id)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const supabase = await createClient();

    // Get aggregate stats from the view
    const { data: stats } = await supabase
      .from('article_clap_stats')
      .select('total_claps, unique_clappers')
      .eq('content_type', content_type)
      .eq('content_id', content_id)
      .maybeSingle();

    // Resolve clapper_id for user-specific count
    const { data: { user } } = await supabase.auth.getUser();
    const cookieStore = await cookies();
    const anonId = cookieStore.get(CLAP_ANON_COOKIE)?.value;
    const clapperId = user?.id ?? (anonId && UUID_RE.test(anonId) ? anonId : null);

    let userClaps = 0;
    if (clapperId) {
      const { data: userRow } = await supabase
        .from('article_claps')
        .select('clap_count')
        .eq('clapper_id', clapperId)
        .eq('content_type', content_type)
        .eq('content_id', content_id)
        .maybeSingle();

      userClaps = userRow?.clap_count ?? 0;
    }

    const result: ClapStatsResponse = {
      totalClaps: stats?.total_claps ?? 0,
      uniqueClappers: stats?.unique_clappers ?? 0,
      userClaps,
    };

    // Response contains user-specific data (userClaps via cookie) — never cache publicly
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Clap stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

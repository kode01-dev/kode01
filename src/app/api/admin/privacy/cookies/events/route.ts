import { NextResponse } from 'next/server';
import { getAdminClient, getRangeInMs, sanitizeCategories } from '../_lib';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function getLimit(raw: string | null): number {
  const parsed = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function getRange(rawRange: string | null): '24h' | '7d' | '30d' {
  if (rawRange === '24h' || rawRange === '7d' || rawRange === '30d') {
    return rawRange;
  }
  return '30d';
}

function getEventType(raw: string | null) {
  if (
    raw === 'consent_first_choice' ||
    raw === 'consent_updated' ||
    raw === 'consent_withdrawn'
  ) {
    return raw;
  }
  return null;
}

function getSource(raw: string | null) {
  if (raw === 'banner' || raw === 'preferences' || raw === 'settings') {
    return raw;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const supabase = await getAdminClient(req);
    if (!supabase) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = getLimit(url.searchParams.get('limit'));
    const range = getRange(url.searchParams.get('range'));
    const cursor = url.searchParams.get('cursor');
    const eventType = getEventType(url.searchParams.get('eventType'));
    const source = getSource(url.searchParams.get('source'));
    const fromDate = new Date(Date.now() - getRangeInMs(range));

    let query = supabase
      .from('cookie_consent_events')
      .select(
        'id, user_id, anonymous_consent_id, event_type, accepted_categories, rejected_categories, consent_version, source, locale, created_at',
      )
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt('created_at', cursor);
    if (eventType) query = query.eq('event_type', eventType);
    if (source) query = query.eq('source', source);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at ?? null : null;

    return NextResponse.json({
      data: pageRows.map((row) => ({
        ...row,
        accepted_categories: sanitizeCategories(row.accepted_categories),
        rejected_categories: sanitizeCategories(row.rejected_categories),
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('Cookie events route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

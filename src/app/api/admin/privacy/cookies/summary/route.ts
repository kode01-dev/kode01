import { NextResponse } from 'next/server';
import { getAdminClient, getRangeInMs, sanitizeCategories } from '../_lib';
import type { CookieConsentSummaryRangeResponse } from '@/features/cookies/types';

type SummaryRange = '24h' | '7d' | '30d';

function getRequestedRange(rawRange: string | null): SummaryRange {
  if (rawRange === '24h' || rawRange === '7d' || rawRange === '30d') {
    return rawRange;
  }
  return '7d';
}

function getBucketKey(date: Date, range: SummaryRange): string {
  if (range === '24h') {
    return date.toISOString().slice(0, 13);
  }
  return date.toISOString().slice(0, 10);
}

function getBucketLabel(date: Date, range: SummaryRange): string {
  if (range === '24h') {
    return `${String(date.getHours()).padStart(2, '0')}:00`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export async function GET(req: Request) {
  try {
    const supabase = await getAdminClient(req);
    if (!supabase) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const range = getRequestedRange(url.searchParams.get('range'));
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - getRangeInMs(range));

    const { data, error } = await supabase
      .from('cookie_consent_events')
      .select('event_type, accepted_categories, created_at')
      .gte('created_at', fromDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(10000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    let firstChoices = 0;
    let firstChoicesWithOptional = 0;
    let analyticsAccepted = 0;
    let marketingAccepted = 0;
    let optOutEvents = 0;

    const bucketMap = new Map<string, CookieConsentSummaryRangeResponse['series'][number]>();

    for (const row of rows) {
      const acceptedCategories = sanitizeCategories(row.accepted_categories);
      const hasAnalytics = acceptedCategories.includes('analytics');
      const hasMarketing = acceptedCategories.includes('marketing');
      const hasOptional = hasAnalytics || hasMarketing;

      if (row.event_type === 'consent_first_choice') {
        firstChoices += 1;
        if (hasOptional) firstChoicesWithOptional += 1;
      }

      if (hasAnalytics) analyticsAccepted += 1;
      if (hasMarketing) marketingAccepted += 1;
      if (row.event_type === 'consent_withdrawn' || !hasOptional) optOutEvents += 1;

      const createdAt = row.created_at ? new Date(row.created_at) : new Date();
      const key = getBucketKey(createdAt, range);
      const existing = bucketMap.get(key);

      if (!existing) {
        bucketMap.set(key, {
          bucket: key,
          label: getBucketLabel(createdAt, range),
          total: 1,
          withdrawals: row.event_type === 'consent_withdrawn' ? 1 : 0,
          optionalAccepted: hasOptional ? 1 : 0,
        });
      } else {
        existing.total += 1;
        if (row.event_type === 'consent_withdrawn') existing.withdrawals += 1;
        if (hasOptional) existing.optionalAccepted += 1;
      }
    }

    const totalEvents = rows.length;
    const result: CookieConsentSummaryRangeResponse = {
      range,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      kpis: {
        totalEvents,
        firstChoices,
        consentRatePercent: firstChoices > 0 ? (firstChoicesWithOptional / firstChoices) * 100 : 0,
        analyticsAcceptedPercent: totalEvents > 0 ? (analyticsAccepted / totalEvents) * 100 : 0,
        marketingAcceptedPercent: totalEvents > 0 ? (marketingAccepted / totalEvents) * 100 : 0,
        optOutPercent: totalEvents > 0 ? (optOutEvents / totalEvents) * 100 : 0,
      },
      series: Array.from(bucketMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Cookie summary route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

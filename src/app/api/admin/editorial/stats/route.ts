import { NextResponse } from 'next/server';
import { getEditorialAdminSessionOrNull } from '@/app/api/admin/editorial/_lib';

function formatChange(current: number, previous: number): string {
  if (previous <= 0) {
    return current > 0 ? '+100.0%' : '0.0%';
  }
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

export async function GET(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { admin: supabase } = adminSession;

    const now = new Date();
    const startCurrentMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    const startPreviousMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
    );
    const startCurrentMonthIso = startCurrentMonth.toISOString();
    const startPreviousMonthIso = startPreviousMonth.toISOString();

    // Build the 6-month range for timeline
    const sixMonthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1, 0, 0, 0, 0)
    );
    const sixMonthsAgoIso = sixMonthsAgo.toISOString();

    // Parallel queries for KPIs and data
    const [
      totalResult,
      publishedResult,
      draftResult,
      currentMonthResult,
      previousMonthResult,
      publishedCurrentResult,
      publishedPreviousResult,
      translationData,
      timelineData,
      coverImageResult,
      seoResult,
      recentArticles,
      contentLengthData,
      trackingData,
      topArticlesData,
      sponsoredStatusData,
      sponsoredTrackingData,
      sponsorshipOrdersData,
    ] = await Promise.all([
      // Total articles
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true }),
      // Published articles
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published'),
      // Draft articles
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft'),
      // Articles created this month
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startCurrentMonthIso),
      // Articles created previous month
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startPreviousMonthIso)
        .lt('created_at', startCurrentMonthIso),
      // Published articles this month
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('published_at', startCurrentMonthIso),
      // Published articles previous month
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('published_at', startPreviousMonthIso)
        .lt('published_at', startCurrentMonthIso),
      // Translation groups data
      supabase
        .from('editorial_posts')
        .select('translation_group_id, locale'),
      // Timeline data (last 6 months)
      supabase
        .from('editorial_posts')
        .select('locale, created_at')
        .gte('created_at', sixMonthsAgoIso)
        .order('created_at', { ascending: true }),
      // Articles with cover images
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .not('cover_image_url', 'is', null)
        .neq('cover_image_url', ''),
      // Articles with SEO data
      supabase
        .from('editorial_posts')
        .select('*', { count: 'exact', head: true })
        .or('seo_title.neq.,seo_description.neq.'),
      // Recent articles
      supabase
        .from('editorial_posts')
        .select('id, title, locale, status, slug, published_at, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      // Content lengths
      supabase
        .from('editorial_posts')
        .select('content_markdown'),
      // Tracking: total views and clicks
      supabase
        .from('editorial_posts')
        .select('view_count, click_count'),
      // Top articles by views
      supabase
        .from('editorial_posts')
        .select('id, title, locale, slug, view_count, click_count')
        .order('view_count', { ascending: false })
        .limit(5),
      // Sponsored statuses (grouped later by translation group)
      supabase
        .from('editorial_posts')
        .select('translation_group_id, sponsorship_status, status')
        .eq('is_sponsored', true),
      // Sponsored tracking
      supabase
        .from('editorial_posts')
        .select('view_count, click_count')
        .eq('is_sponsored', true),
      // Sponsored orders
      supabase
        .from('editorial_sponsorship_orders')
        .select('status, amount, currency'),
    ]);

    const total = totalResult.count ?? 0;
    const published = publishedResult.count ?? 0;
    const drafts = draftResult.count ?? 0;
    const currentMonth = currentMonthResult.count ?? 0;
    const previousMonth = previousMonthResult.count ?? 0;
    const publishedCurrent = publishedCurrentResult.count ?? 0;
    const publishedPrevious = publishedPreviousResult.count ?? 0;

    // Calculate translation coverage
    const groupMap = new Map<string, Set<string>>();
    if (translationData.data) {
      for (const row of translationData.data) {
        if (!row.translation_group_id) continue;
        if (!groupMap.has(row.translation_group_id)) {
          groupMap.set(row.translation_group_id, new Set());
        }
        groupMap.get(row.translation_group_id)!.add(row.locale);
      }
    }
    const totalGroups = groupMap.size;
    let completePairs = 0;
    let enCount = 0;
    let frCount = 0;
    if (translationData.data) {
      for (const row of translationData.data) {
        if (row.locale === 'en') enCount++;
        if (row.locale === 'fr') frCount++;
      }
    }
    for (const locales of groupMap.values()) {
      if (locales.has('en') && locales.has('fr')) {
        completePairs++;
      }
    }
    const coveragePercent = totalGroups > 0
      ? Math.round((completePairs / totalGroups) * 100 * 10) / 10
      : 0;

    // Build timeline (last 6 months)
    const timeline: { month: string; en: number; fr: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)
      );
      const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
      timeline.push({ month: monthKey, en: 0, fr: 0 });
    }
    if (timelineData.data) {
      for (const row of timelineData.data) {
        const d = new Date(row.created_at);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const entry = timeline.find((t) => t.month === key);
        if (entry) {
          if (row.locale === 'en') entry.en++;
          else if (row.locale === 'fr') entry.fr++;
        }
      }
    }

    // Content health
    const withCoverImages = coverImageResult.count ?? 0;
    const withSeo = seoResult.count ?? 0;
    const contentLengths = contentLengthData.data ?? [];
    const avgContentLength = contentLengths.length > 0
      ? Math.round(
          contentLengths.reduce((sum, row) => sum + (row.content_markdown?.length ?? 0), 0)
          / contentLengths.length
        )
      : 0;

    // Tracking totals
    const trackingRows = trackingData.data ?? [];
    const totalViews = trackingRows.reduce((sum, r) => sum + (r.view_count ?? 0), 0);
    const totalClicks = trackingRows.reduce((sum, r) => sum + (r.click_count ?? 0), 0);
    const topArticles = (topArticlesData.data ?? []).filter((a) => (a.view_count ?? 0) > 0);
    const sponsoredTrackingRows = sponsoredTrackingData.data ?? [];
    const sponsoredViews = sponsoredTrackingRows.reduce((sum, row) => sum + (row.view_count ?? 0), 0);
    const sponsoredClicks = sponsoredTrackingRows.reduce((sum, row) => sum + (row.click_count ?? 0), 0);
    const sponsoredGroups = new Map<
      string,
      { sponsorship_status: string | null; status: string | null }
    >();
    for (const row of sponsoredStatusData.data ?? []) {
      if (!row.translation_group_id || sponsoredGroups.has(row.translation_group_id)) continue;
      sponsoredGroups.set(row.translation_group_id, {
        sponsorship_status: row.sponsorship_status,
        status: row.status,
      });
    }

    let sponsoredPendingPayment = 0;
    let sponsoredPendingReview = 0;
    let sponsoredApprovedPublished = 0;
    let sponsoredRejected = 0;
    for (const group of sponsoredGroups.values()) {
      switch (group.sponsorship_status) {
        case 'pending_payment':
          sponsoredPendingPayment += 1;
          break;
        case 'pending_review':
          sponsoredPendingReview += 1;
          break;
        case 'approved':
          if (group.status === 'published') {
            sponsoredApprovedPublished += 1;
          }
          break;
        case 'rejected':
          sponsoredRejected += 1;
          break;
        default:
          break;
      }
    }

    let sponsoredPaidOrders = 0;
    const sponsoredRevenueCad = (sponsorshipOrdersData.data ?? []).reduce((sum, row) => {
      if (row.status !== 'paid') {
        return sum;
      }
      sponsoredPaidOrders += 1;
      const amount = Number(row.amount ?? 0);
      if (!Number.isFinite(amount)) return sum;
      return sum + amount;
    }, 0);

    // Distribution
    const distribution = {
      en: { draft: 0, published: 0 },
      fr: { draft: 0, published: 0 },
    };
    // Simple distribution query
    const [enPublished, enDraft, frPublished, frDraft] = await Promise.all([
      supabase.from('editorial_posts').select('*', { count: 'exact', head: true }).eq('locale', 'en').eq('status', 'published'),
      supabase.from('editorial_posts').select('*', { count: 'exact', head: true }).eq('locale', 'en').eq('status', 'draft'),
      supabase.from('editorial_posts').select('*', { count: 'exact', head: true }).eq('locale', 'fr').eq('status', 'published'),
      supabase.from('editorial_posts').select('*', { count: 'exact', head: true }).eq('locale', 'fr').eq('status', 'draft'),
    ]);
    distribution.en.published = enPublished.count ?? 0;
    distribution.en.draft = enDraft.count ?? 0;
    distribution.fr.published = frPublished.count ?? 0;
    distribution.fr.draft = frDraft.count ?? 0;

    const response = {
      kpis: {
        totalArticles: {
          current: total,
          published,
          drafts,
          change: formatChange(currentMonth, previousMonth),
        },
        publishingVelocity: {
          thisMonth: publishedCurrent,
          lastMonth: publishedPrevious,
          change: formatChange(publishedCurrent, publishedPrevious),
        },
        translation: {
          enCount,
          frCount,
          completePairs,
          totalGroups,
          coveragePercent,
        },
        contentHealth: {
          withCoverImages,
          withCoverPercent: total > 0 ? Math.round((withCoverImages / total) * 100 * 10) / 10 : 0,
          withSeo,
          withSeoPercent: total > 0 ? Math.round((withSeo / total) * 100 * 10) / 10 : 0,
          avgContentLength,
        },
        tracking: {
          totalViews,
          totalClicks,
        },
        sponsored: {
          submissions: sponsoredGroups.size,
          paid: sponsoredPaidOrders,
          pendingPayment: sponsoredPendingPayment,
          pendingReview: sponsoredPendingReview,
          approvedPublished: sponsoredApprovedPublished,
          rejected: sponsoredRejected,
          views: sponsoredViews,
          clicks: sponsoredClicks,
          revenueCad: Number(sponsoredRevenueCad.toFixed(2)),
        },
      },
      timeline,
      distribution,
      recentArticles: recentArticles.data ?? [],
      topArticles,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('[editorial/stats] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

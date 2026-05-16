import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type AnalyticsPoint = {
    date: string;
    sales: number;
    revenue: number;
    views: number;
};

type PeriodKey = '7d' | '30d' | '90d' | '12m';

const PRIVATE_CACHE_HEADERS = {
    'Cache-Control': 'private, max-age=15, stale-while-revalidate=45',
};

const PERIODS: Record<PeriodKey, { days: number; bucket: 'day' | 'month' }> = {
    '7d': { days: 7, bucket: 'day' },
    '30d': { days: 30, bucket: 'day' },
    '90d': { days: 90, bucket: 'day' },
    '12m': { days: 365, bucket: 'month' },
};

function formatAnalyticsPayload({
    chartData,
    totalRevenue,
    totalSales,
    totalViews,
    conversionRate,
    previous,
}: {
    chartData: AnalyticsPoint[];
    totalRevenue: number;
    totalSales: number;
    totalViews: number;
    conversionRate: number;
    previous?: {
        totalRevenue: number;
        totalSales: number;
        totalViews: number;
        conversionRate: number;
    };
}) {
    return {
        chartData,
        stats: {
            totalRevenue: `$${totalRevenue.toLocaleString()}`,
            totalSales: totalSales.toLocaleString(),
            totalViews: totalViews.toLocaleString(),
            conversionRate: `${conversionRate.toFixed(1)}%`,
            prevRevenue: previous ? `$${previous.totalRevenue.toLocaleString()}` : undefined,
            prevSales: previous ? previous.totalSales.toLocaleString() : undefined,
            prevViews: previous ? previous.totalViews.toLocaleString() : undefined,
            prevConversionRate: previous ? `${previous.conversionRate.toFixed(1)}%` : undefined,
        },
    };
}

function jsonWithPrivateCache(body: unknown, init?: ResponseInit): NextResponse {
    return NextResponse.json(body, {
        ...init,
        headers: {
            ...PRIVATE_CACHE_HEADERS,
            ...(init?.headers ?? {}),
        },
    });
}

function resolvePeriod(request: Request): PeriodKey {
    const raw = new URL(request.url).searchParams.get('period');
    return raw === '7d' || raw === '90d' || raw === '12m' ? raw : '30d';
}

function dateKey(date: Date, bucket: 'day' | 'month') {
    const iso = date.toISOString();
    return bucket === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function buildEmptySeries(start: Date, days: number, bucket: 'day' | 'month') {
    const data: Record<string, AnalyticsPoint> = {};
    for (let i = 0; i < days; i += 1) {
        const key = dateKey(addDays(start, i), bucket);
        data[key] ??= { date: key, sales: 0, revenue: 0, views: 0 };
    }
    return data;
}

function summarize(points: AnalyticsPoint[]) {
    const totalRevenue = points.reduce((sum, point) => sum + point.revenue, 0);
    const totalSales = points.reduce((sum, point) => sum + point.sales, 0);
    const totalViews = points.reduce((sum, point) => sum + point.views, 0);
    return {
        totalRevenue,
        totalSales,
        totalViews,
        conversionRate: totalViews > 0 ? (totalSales / totalViews) * 100 : 0,
    };
}

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return jsonWithPrivateCache({ error: 'Unauthorized' }, { status: 401 });
        }

        const period = PERIODS[resolvePeriod(request)];
        const now = new Date();
        const currentStart = addDays(now, -period.days);
        const previousStart = addDays(currentStart, -period.days);

        const [purchasesResult, viewsResult] = await Promise.all([
            supabase
                .from('purchases')
                .select('amount, created_at')
                .eq('seller_id', user.id)
                .gte('created_at', previousStart.toISOString())
                .order('created_at', { ascending: true }),
            supabase
                .from('product_views')
                .select('count, view_date, products!inner(seller_id)')
                .eq('products.seller_id', user.id)
                .gte('view_date', previousStart.toISOString().split('T')[0])
                .order('view_date', { ascending: true }),
        ]);

        if (purchasesResult.error) throw purchasesResult.error;
        if (viewsResult.error) throw viewsResult.error;

        const currentData = buildEmptySeries(currentStart, period.days, period.bucket);
        const previousData = buildEmptySeries(previousStart, period.days, period.bucket);

        purchasesResult.data?.forEach((purchase) => {
            const createdAt = new Date(purchase.created_at);
            const target = createdAt >= currentStart ? currentData : previousData;
            const key = dateKey(createdAt, period.bucket);
            if (target[key]) {
                target[key].sales += 1;
                target[key].revenue += Number(purchase.amount);
            }
        });

        viewsResult.data?.forEach((view) => {
            const viewedAt = new Date(`${view.view_date}T00:00:00.000Z`);
            const target = viewedAt >= currentStart ? currentData : previousData;
            const key = dateKey(viewedAt, period.bucket);
            if (target[key]) {
                target[key].views += view.count;
            }
        });

        const chartData = Object.values(currentData).sort((a, b) => a.date.localeCompare(b.date));
        const currentSummary = summarize(chartData);
        const previousSummary = summarize(Object.values(previousData));

        return jsonWithPrivateCache(
            formatAnalyticsPayload({
                chartData,
                ...currentSummary,
                previous: previousSummary,
            }),
        );
    } catch (error) {
        console.error('Analytics Error:', error);
        return jsonWithPrivateCache({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}

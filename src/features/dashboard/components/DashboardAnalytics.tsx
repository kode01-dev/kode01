'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DollarSign, Package, Eye, TrendingUp, Loader2, AlertCircle, RefreshCw, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChartData {
    date: string;
    sales: number;
    revenue: number;
    views: number;
}

interface Stats {
    totalRevenue: string;
    totalSales: string;
    totalViews: string;
    conversionRate: string;
    prevRevenue?: string;
    prevSales?: string;
    prevViews?: string;
    prevConversionRate?: string;
}

type Period = '7d' | '30d' | '90d' | '12m';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: '12m', label: '12 months' },
];

function calcVariation(current: string | undefined, previous: string | undefined): number | null {
    const curr = parseFloat((current ?? '0').replace(/[^0-9.-]/g, ''));
    const prev = parseFloat((previous ?? '0').replace(/[^0-9.-]/g, ''));
    if (prev === 0) return curr > 0 ? 100 : null;
    return Math.round(((curr - prev) / prev) * 100);
}

export function DashboardAnalytics() {
    const locale = useLocale();
    const t = useTranslations('dashboard.analytics');
    const [data, setData] = useState<ChartData[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [period, setPeriod] = useState<Period>('30d');

    const fetchAnalytics = useCallback(async (background = false, p?: Period) => {
        if (background) {
            setIsRefreshing(true);
        } else {
            setLoading(true);
        }

        setError(false);

        try {
            const selectedPeriod = p ?? period;
            const response = await fetch(`/api/seller/analytics?period=${selectedPeriod}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            const nextData = Array.isArray(result.chartData) ? result.chartData : [];
            setData(nextData);
            setStats(result.stats ?? null);
        } catch (fetchError) {
            console.error('Failed to fetch analytics:', fetchError);
            setError(true);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [period]);

    function handlePeriodChange(newPeriod: Period) {
        setPeriod(newPeriod);
        void fetchAnalytics(false, newPeriod);
    }

    function handleExportCSV() {
        if (!data.length) return;
        const headers = ['Date', 'Sales', 'Revenue', 'Views'];
        const rows = data.map((d) => [d.date, d.sales, d.revenue, d.views]);
        const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kode01-analytics-${period}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    useEffect(() => {
        void fetchAnalytics();
    }, [fetchAnalytics]);

    if (loading) {
        return (
            <div className="space-y-8 mt-8">
                <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-[32px] bg-black/5" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                    <Skeleton className="h-[400px] rounded-[32px] bg-black/5" />
                    <Skeleton className="h-[400px] rounded-[32px] bg-black/5" />
                </div>
            </div>
        );
    }

    const statCards = [
        { label: t('total_revenue'), value: stats?.totalRevenue || '$0', prev: stats?.prevRevenue, icon: DollarSign, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
        { label: t('total_sales'), value: stats?.totalSales || '0', prev: stats?.prevSales, icon: Package, color: 'text-kode01-blue', iconBg: 'bg-kode01-blue/10' },
        { label: t('total_views'), value: stats?.totalViews || '0', prev: stats?.prevViews, icon: Eye, color: 'text-kode01-pink', iconBg: 'bg-kode01-pink/10' },
        { label: t('conversion'), value: stats?.conversionRate || '0%', prev: stats?.prevConversionRate, icon: TrendingUp, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
    ];
    const hasData = data.length > 0;

    return (
        <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3 rounded-2xl border border-kode01-noir/10 bg-kode01-white px-3 sm:px-4 py-3">
                {/* Period selector */}
                <div className="flex items-center gap-1.5">
                    {PERIOD_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => handlePeriodChange(opt.value)}
                            className={`rounded-full px-2 sm:px-3 py-1 text-xs font-bold transition-colors ${
                                period === opt.value
                                    ? 'bg-kode01-pink/15 text-kode01-pink'
                                    : 'text-kode01-noir/40 hover:text-kode01-noir/60 hover:bg-kode01-noir/5'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleExportCSV}
                        disabled={!hasData}
                        className="rounded-full border-kode01-noir/15 text-kode01-noir/75 hover:text-kode01-noir hover:bg-kode01-noir/5"
                    >
                        <Download size={14} className="mr-1.5" />
                        CSV
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchAnalytics(true)}
                        disabled={isRefreshing}
                        className="rounded-full border-kode01-noir/15 text-kode01-noir/75 hover:text-kode01-noir hover:bg-kode01-noir/5"
                    >
                        {isRefreshing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
                        {t('refresh')}
                    </Button>
                </div>
            </div>

            {error && (
                <div
                    className="flex items-start gap-3 rounded-2xl border border-kode01-pink/25 bg-kode01-pink/5 px-4 py-3 text-sm text-kode01-pink"
                    role="alert"
                >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p>{t('error_message')}</p>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {statCards.map((stat) => {
                    const Icon = stat.icon;
                    const variation = calcVariation(stat.value, stat.prev);
                    return (
                        <Card key={stat.label} className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.iconBg}`}>
                                    <Icon size={24} className={stat.color} />
                                </div>
                                <div>
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {stat.label}
                                    </CardTitle>
                                    <div className="text-3xl font-serif font-black text-kode01-noir mt-1 leading-none">{stat.value}</div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <p className="text-xs font-bold text-kode01-noir/30 flex items-center gap-1">
                                    {variation !== null && (
                                        <span className={`inline-flex items-center gap-0.5 ${variation > 0 ? 'text-kode01-green' : variation < 0 ? 'text-kode01-pink' : 'text-kode01-noir/30'}`}>
                                            {variation > 0 ? <ArrowUp size={10} /> : variation < 0 ? <ArrowDown size={10} /> : null}
                                            {variation > 0 ? '+' : ''}{variation}%
                                        </span>
                                    )}
                                    <span className="text-kode01-noir/25">vs prev. period</span>
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Charts Grid */}
            {!hasData ? (
                <Card className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm">
                    <CardContent className="py-12 text-center">
                        <p className="text-sm font-bold text-kode01-noir/65">{t('empty_title')}</p>
                        <p className="mt-2 text-xs text-kode01-noir/50">{t('empty_description')}</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                    {/* Sales & Revenue Chart */}
                    <Card className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                        <CardHeader className="border-b border-black/5 pb-6">
                            <CardTitle className="text-xl font-serif font-black text-kode01-noir">{t('revenue_overview_title')}</CardTitle>
                            <CardDescription>{t('revenue_overview_desc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-8">
                            <div className="h-[250px] sm:h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
                                    <AreaChart data={data}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2B463C" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#2B463C" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fontWeight: 700 }}
                                            tickFormatter={(str) => {
                                                const date = new Date(str);
                                                return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                                            }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                            tickFormatter={(val) => `$${val}`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '16px',
                                                border: 'none',
                                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                                fontFamily: 'var(--font-dm-sans)',
                                                fontWeight: 700
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="revenue"
                                            stroke="#2B463C"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorRevenue)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Views Chart */}
                    <Card className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                        <CardHeader className="border-b border-black/5 pb-6">
                            <CardTitle className="text-xl font-serif font-black text-kode01-noir">{t('traffic_title')}</CardTitle>
                            <CardDescription>{t('traffic_desc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-8">
                            <div className="h-[250px] sm:h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
                                    <BarChart data={data}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fontWeight: 700 }}
                                            tickFormatter={(str) => {
                                                const date = new Date(str);
                                                return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                                            }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '16px',
                                                border: 'none',
                                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                                fontFamily: 'var(--font-dm-sans)',
                                                fontWeight: 700
                                            }}
                                        />
                                        <Bar
                                            dataKey="views"
                                            fill="#F291C8"
                                            radius={[4, 4, 0, 0]}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

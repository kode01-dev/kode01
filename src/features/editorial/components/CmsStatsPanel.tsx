'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  FileText,
  Globe2,
  TrendingUp,
  Loader2,
  AlertCircle,
  RefreshCw,
  Heart,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StatsKpis {
  totalArticles: {
    current: number;
    published: number;
    drafts: number;
    change: string;
  };
  publishingVelocity: {
    thisMonth: number;
    lastMonth: number;
    change: string;
  };
  translation: {
    enCount: number;
    frCount: number;
    completePairs: number;
    totalGroups: number;
    coveragePercent: number;
  };
  contentHealth: {
    withCoverImages: number;
    withCoverPercent: number;
    withSeo: number;
    withSeoPercent: number;
    avgContentLength: number;
  };
  tracking: {
    totalViews: number;
    totalClicks: number;
  };
  sponsored: {
    submissions: number;
    paid: number;
    pendingPayment: number;
    pendingReview: number;
    approvedPublished: number;
    rejected: number;
    views: number;
    clicks: number;
    revenueCad: number;
  };
}

interface TimelineEntry {
  month: string;
  en: number;
  fr: number;
}

interface Distribution {
  en: { draft: number; published: number };
  fr: { draft: number; published: number };
}

interface RecentArticle {
  id: string;
  title: string;
  locale: string;
  status: string;
  slug: string;
  published_at: string | null;
  created_at: string;
}

interface TopArticle {
  id: string;
  title: string;
  locale: string;
  slug: string;
  view_count: number;
  click_count: number;
}

interface StatsData {
  kpis: StatsKpis;
  timeline: TimelineEntry[];
  distribution: Distribution;
  recentArticles: RecentArticle[];
  topArticles: TopArticle[];
}

function HealthRow({
  label,
  value,
  total,
  percent,
}: {
  label: string;
  value: number;
  total: number;
  percent: number;
}) {
  const barColor =
    percent >= 80 ? 'bg-kode01-green' : percent >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-kode01-noir/60">{label}</span>
        <span className="text-sm font-black text-kode01-noir">
          {value}/{total} ({percent}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-kode01-sauge/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function CmsStatsPanel({ locale }: { locale: string }) {
  const t = useTranslations('dashboard.admin.cms.stats');
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(false);

    try {
      const response = await fetch('/api/admin/editorial/stats', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setData(result);
    } catch {
      console.error('Failed to fetch editorial stats');
      setError(true);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-[32px] bg-black/5" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-[400px] rounded-[32px] bg-black/5" />
          <Skeleton className="h-[400px] rounded-[32px] bg-black/5" />
        </div>
      </div>
    );
  }

  const kpis = data?.kpis;

  const statCards = [
    {
      label: t('total_articles'),
      value: String(kpis?.totalArticles.current ?? 0),
      subtitle: `${kpis?.totalArticles.published ?? 0} ${t('published')}, ${kpis?.totalArticles.drafts ?? 0} ${t('drafts')}`,
      change: kpis?.totalArticles.change ?? '0.0%',
      icon: FileText,
      color: 'text-kode01-noir',
      iconBg: 'bg-kode01-sauge/10',
    },
    {
      label: t('publishing_velocity'),
      value: String(kpis?.publishingVelocity.thisMonth ?? 0),
      subtitle: `${kpis?.publishingVelocity.lastMonth ?? 0} ${t('last_month')}`,
      change: kpis?.publishingVelocity.change ?? '0.0%',
      icon: TrendingUp,
      color: 'text-kode01-green',
      iconBg: 'bg-kode01-green/10',
    },
    {
      label: t('translation_coverage'),
      value: `${kpis?.translation.coveragePercent ?? 0}%`,
      subtitle: `${kpis?.translation.enCount ?? 0} EN, ${kpis?.translation.frCount ?? 0} FR`,
      change: `${kpis?.translation.completePairs ?? 0} ${t('complete_pairs')}`,
      icon: Globe2,
      color: 'text-kode01-blue',
      iconBg: 'bg-kode01-blue/10',
    },
    {
      label: t('content_health'),
      value: `${kpis?.contentHealth.withCoverPercent ?? 0}%`,
      subtitle: `${kpis?.contentHealth.withSeo ?? 0}/${kpis?.totalArticles.current ?? 0} ${t('with_seo')}`,
      change: `${kpis?.contentHealth.withCoverImages ?? 0} ${t('with_cover')}`,
      icon: Heart,
      color: 'text-kode01-pink',
      iconBg: 'bg-kode01-pink/10',
    },
    {
      label: t('total_views'),
      value: (kpis?.tracking.totalViews ?? 0).toLocaleString(locale),
      subtitle: t('views_subtitle'),
      change: '',
      icon: Eye,
      color: 'text-amber-600',
      iconBg: 'bg-amber-100',
    },
    {
      label: t('total_clicks'),
      value: (kpis?.tracking.totalClicks ?? 0).toLocaleString(locale),
      subtitle: t('clicks_subtitle'),
      change: '',
      icon: MousePointerClick,
      color: 'text-indigo-600',
      iconBg: 'bg-indigo-100',
    },
    {
      label: t('sponsored_submissions'),
      value: (kpis?.sponsored.submissions ?? 0).toLocaleString(locale),
      subtitle: `${kpis?.sponsored.paid ?? 0} ${t('sponsored_paid')} | ${kpis?.sponsored.pendingReview ?? 0} ${t('sponsored_pending_review')}`,
      change: `${kpis?.sponsored.approvedPublished ?? 0} ${t('sponsored_approved')}`,
      icon: FileText,
      color: 'text-amber-700',
      iconBg: 'bg-amber-100',
    },
    {
      label: t('sponsored_revenue'),
      value: `${(kpis?.sponsored.revenueCad ?? 0).toLocaleString(locale)} CAD`,
      subtitle: `${(kpis?.sponsored.views ?? 0).toLocaleString(locale)} ${t('sponsored_views')}`,
      change: `${(kpis?.sponsored.clicks ?? 0).toLocaleString(locale)} ${t('sponsored_clicks')}`,
      icon: TrendingUp,
      color: 'text-kode01-pink',
      iconBg: 'bg-kode01-pink/10',
    },
  ];

  const changeIsPositive = (change: string) => change.startsWith('+');

  const formattedTimeline = (data?.timeline ?? []).map((entry) => {
    const [year, month] = entry.month.split('-');
    const d = new Date(Number(year), Number(month) - 1, 1);
    return {
      ...entry,
      label: d.toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
    };
  });

  const distributionData = data
    ? [
        {
          locale: 'EN',
          [t('published')]: data.distribution.en.published,
          [t('drafts')]: data.distribution.en.draft,
        },
        {
          locale: 'FR',
          [t('published')]: data.distribution.fr.published,
          [t('drafts')]: data.distribution.fr.draft,
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Status Bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/45">
          {error ? t('error') : t('ready')}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void fetchStats(true)}
          disabled={isRefreshing}
          className="rounded-full border-black/15 text-kode01-noir/75 hover:text-kode01-noir hover:bg-black/5"
        >
          {isRefreshing ? (
            <Loader2 size={14} className="mr-2 animate-spin" />
          ) : (
            <RefreshCw size={14} className="mr-2" />
          )}
          {t('refresh')}
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{t('error_message')}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const isPositive = changeIsPositive(stat.change);
          return (
            <Card
              key={stat.label}
              className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-shadow"
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.iconBg}`}
                >
                  <Icon size={24} className={stat.color} />
                </div>
                <div>
                  <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {stat.label}
                  </CardTitle>
                  <div className="text-3xl font-serif font-black text-kode01-noir mt-1 leading-none">
                    {stat.value}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-xs font-bold text-kode01-noir/30">{stat.subtitle}</p>
                <p
                  className={`text-xs font-bold mt-1 ${isPositive ? 'text-kode01-green' : 'text-kode01-noir/40'}`}
                >
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Timeline Area Chart */}
          <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
            <CardHeader className="border-b border-black/5 pb-6">
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                {t('timeline_title')}
              </CardTitle>
              <CardDescription>{t('timeline_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="h-[250px] sm:h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
                  <AreaChart data={formattedTimeline}>
                    <defs>
                      <linearGradient id="colorEn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2B463C" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2B463C" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorFr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E8739E" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#E8739E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '16px',
                        border: 'none',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontFamily: 'var(--font-dm-sans)',
                        fontWeight: 700,
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="en"
                      name="EN"
                      stroke="#2B463C"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorEn)"
                    />
                    <Area
                      type="monotone"
                      dataKey="fr"
                      name="FR"
                      stroke="#E8739E"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorFr)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Distribution Bar Chart */}
          <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
            <CardHeader className="border-b border-black/5 pb-6">
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                {t('distribution_title')}
              </CardTitle>
              <CardDescription>{t('distribution_desc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="h-[250px] sm:h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
                  <BarChart data={distributionData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                      dataKey="locale"
                      tick={{ fontSize: 12, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '16px',
                        border: 'none',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                        fontFamily: 'var(--font-dm-sans)',
                        fontWeight: 700,
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey={t('published')}
                      fill="#2B463C"
                      radius={[8, 8, 0, 0]}
                      barSize={40}
                    />
                    <Bar
                      dataKey={t('drafts')}
                      fill="#D1D5DB"
                      radius={[8, 8, 0, 0]}
                      barSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom row: Content Health + Top Articles + Recent Articles */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Content Health */}
          <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
            <CardHeader className="border-b border-black/5 pb-4">
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                {t('health_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <HealthRow
                label={t('with_cover_label')}
                value={kpis?.contentHealth.withCoverImages ?? 0}
                total={kpis?.totalArticles.current ?? 0}
                percent={kpis?.contentHealth.withCoverPercent ?? 0}
              />
              <HealthRow
                label={t('with_seo_label')}
                value={kpis?.contentHealth.withSeo ?? 0}
                total={kpis?.totalArticles.current ?? 0}
                percent={kpis?.contentHealth.withSeoPercent ?? 0}
              />
              <div className="flex items-center justify-between pt-2 border-t border-black/5">
                <span className="text-sm font-bold text-kode01-noir/60">{t('avg_length')}</span>
                <span className="text-sm font-black text-kode01-noir">
                  {(kpis?.contentHealth.avgContentLength ?? 0).toLocaleString(locale)} {t('chars')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Top Articles by Views */}
          <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
            <CardHeader className="border-b border-black/5 pb-4">
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                {t('top_articles_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {(data.topArticles ?? []).length === 0 ? (
                <p className="text-sm text-kode01-noir/50 py-4 text-center">{t('no_views_yet')}</p>
              ) : (
                <div className="space-y-3">
                  {data.topArticles.map((article, idx) => (
                    <div
                      key={article.id}
                      className="flex items-center gap-3 rounded-2xl border border-kode01-sauge/10 px-4 py-3"
                    >
                      <span className="text-lg font-serif font-black text-kode01-noir/20 w-6 text-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-kode01-noir truncate">
                          {article.title}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 mt-0.5">
                          {article.locale.toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="flex items-center gap-1 text-xs font-black text-kode01-noir/50">
                          <Eye size={12} /> {article.view_count.toLocaleString(locale)}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-black text-kode01-noir/50">
                          <MousePointerClick size={12} /> {article.click_count.toLocaleString(locale)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Articles */}
          <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
            <CardHeader className="border-b border-black/5 pb-4">
              <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                {t('recent_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {data.recentArticles.length === 0 ? (
                <p className="text-sm text-kode01-noir/50 py-4 text-center">{t('no_articles')}</p>
              ) : (
                <div className="space-y-3">
                  {data.recentArticles.map((article) => (
                    <div
                      key={article.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-kode01-sauge/10 px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-kode01-noir truncate">
                          {article.title}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 mt-0.5">
                          {article.locale.toUpperCase()} ·{' '}
                          {new Date(article.created_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                          article.status === 'published'
                            ? 'bg-kode01-green/10 text-kode01-green'
                            : 'bg-kode01-noir/5 text-kode01-noir/40'
                        }`}
                      >
                        {article.status === 'published' ? t('published') : t('drafts')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

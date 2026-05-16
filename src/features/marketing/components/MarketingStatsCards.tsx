'use client';

import { useTranslations } from 'next-intl';
import { TrendingUp, Eye, MousePointer, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarketingStatsCardsProps {
  activeCampaigns: number;
  totalViews: number;
  totalClicks: number;
  avgCTR: string;
}

export function MarketingStatsCards({
  activeCampaigns,
  totalViews,
  totalClicks,
  avgCTR,
}: MarketingStatsCardsProps) {
  const t = useTranslations('dashboard.admin.marketing.stats');

  const stats = [
    {
      label: t('active_campaigns'),
      value: activeCampaigns.toString(),
      icon: TrendingUp,
      color: 'bg-blue-500/10 text-blue-600',
    },
    {
      label: t('total_views'),
      value: totalViews.toLocaleString(),
      icon: Eye,
      color: 'bg-green-500/10 text-green-600',
    },
    {
      label: t('total_clicks'),
      value: totalClicks.toLocaleString(),
      icon: MousePointer,
      color: 'bg-kode01-pink/10 text-kode01-pink',
    },
    {
      label: t('avg_ctr'),
      value: `${avgCTR}%`,
      icon: Zap,
      color: 'bg-purple-500/10 text-purple-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="border-black/5 bg-white rounded-[24px] shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold text-black/60">
                {stat.label}
              </CardTitle>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                <Icon size={20} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-serif font-black text-black">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

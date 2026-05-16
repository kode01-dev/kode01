'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DollarSign, Package, Eye, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/Skeleton';

interface QuickStats {
  totalRevenue: string;
  totalSales: string;
  totalViews: string;
  conversionRate: string;
}

export function VendorQuickStats() {
  const t = useTranslations('dashboard.analytics');
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/seller/analytics');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setStats(result.stats ?? null);
    } catch {
      // Silently fail - the full analytics section below will show the error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const statCards = [
    { label: t('total_revenue'), value: stats?.totalRevenue || '$0', icon: DollarSign, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
    { label: t('total_sales'), value: stats?.totalSales || '0', icon: Package, color: 'text-kode01-blue', iconBg: 'bg-kode01-blue/10' },
    { label: t('total_views'), value: stats?.totalViews || '0', icon: Eye, color: 'text-kode01-pink', iconBg: 'bg-kode01-pink/10' },
    { label: t('conversion'), value: stats?.conversionRate || '0%', icon: TrendingUp, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl bg-black/5" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="border-black/5 bg-kode01-white rounded-2xl shadow-sm">
            <CardHeader className="flex flex-row items-center gap-3 pb-1 pt-4 px-4">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                <Icon size={18} className={stat.color} />
              </div>
              <CardTitle className="text-[9px] font-bold uppercase tracking-widest text-kode01-noir/40 leading-tight">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-1">
              <div className="text-2xl font-serif font-black text-kode01-noir leading-none">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

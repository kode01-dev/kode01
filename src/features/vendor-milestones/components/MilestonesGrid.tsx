'use client';

import { useCallback, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { MILESTONES, computeMilestoneProgress } from '../milestones';
import type { MilestoneProgress } from '../types';
import { MilestoneCard } from './MilestoneCard';

interface AnalyticsStats {
  totalSales: number;
  productCount: number;
  followerCount: number;
  totalRevenue: number;
}

export function MilestonesGrid() {
  const [progress, setProgress] = useState<MilestoneProgress[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAndCompute = useCallback(async () => {
    try {
      const response = await fetch('/api/seller/analytics');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      const stats: AnalyticsStats = {
        totalSales: Number(result.stats?.totalSales) || 0,
        productCount: Number(result.stats?.productCount) || 0,
        followerCount: Number(result.stats?.followerCount) || 0,
        totalRevenue: Number(String(result.stats?.totalRevenue).replace(/[^0-9.]/g, '')) || 0,
      };

      setProgress(computeMilestoneProgress(stats));
    } catch {
      // Fall back to empty stats so cards still render at zero
      setProgress(
        computeMilestoneProgress({
          totalSales: 0,
          productCount: 0,
          followerCount: 0,
          totalRevenue: 0,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAndCompute();
  }, [fetchAndCompute]);

  // --- Loading skeleton ---
  if (loading) {
    return (
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton variant="chip" className="h-5 w-16" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const achievedCount = progress?.filter((p) => p.achieved).length ?? 0;
  const totalCount = MILESTONES.length;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-kode01-noir">
          Milestones &amp; Celebrations
        </h2>
        <span className="inline-flex items-center rounded-full bg-kode01-green/10 px-2.5 py-0.5 text-xs font-bold text-kode01-green">
          {achievedCount} / {totalCount}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MILESTONES.map((milestone) => {
          const mp = progress?.find((p) => p.key === milestone.key) ?? {
            key: milestone.key,
            achieved: false,
            current: 0,
            target: milestone.threshold,
          };

          return (
            <MilestoneCard
              key={milestone.key}
              milestone={milestone}
              progress={mp}
            />
          );
        })}
      </div>
    </section>
  );
}

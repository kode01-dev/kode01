'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Milestone, MilestoneProgress } from '../types';

interface MilestoneCardProps {
  milestone: Milestone;
  progress: MilestoneProgress;
}

export function MilestoneCard({ milestone, progress }: MilestoneCardProps) {
  const percent = progress.target > 0
    ? Math.round((progress.current / progress.target) * 100)
    : 0;

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-shadow',
        progress.achieved
          ? 'border-kode01-green/30 bg-kode01-green/5 shadow-md'
          : 'border-black/5 bg-kode01-cream/60 shadow-sm',
      )}
    >
      <CardContent className="flex flex-col gap-3 p-5">
        {/* Header row: icon + badge */}
        <div className="flex items-start justify-between">
          <span className="text-3xl leading-none" role="img" aria-label={milestone.label}>
            {milestone.icon}
          </span>

          {progress.achieved ? (
            <Badge className="bg-kode01-green text-white text-[10px] font-bold uppercase tracking-wider border-0">
              Achieved
            </Badge>
          ) : (
            <Badge className="bg-kode01-pink/10 text-kode01-pink text-[10px] font-bold uppercase tracking-wider border-0">
              In Progress
            </Badge>
          )}
        </div>

        {/* Label & description */}
        <div>
          <h3 className="text-sm font-bold text-kode01-noir leading-tight">
            {milestone.label}
          </h3>
          <p className="mt-0.5 text-xs text-kode01-noir/50 leading-snug">
            {milestone.description}
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-kode01-noir/40">
            <span>Progress</span>
            <span>
              {progress.current} / {progress.target}
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                progress.achieved ? 'bg-kode01-green' : 'bg-kode01-pink',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

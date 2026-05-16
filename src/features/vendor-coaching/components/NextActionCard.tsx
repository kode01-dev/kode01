'use client';

import Link from 'next/link';
import { Wrench, Lightbulb, Rocket, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { NextAction } from '../getNextActions';

const typeConfig: Record<
  NextAction['type'],
  { icon: LucideIcon; label: string; badgeClass: string }
> = {
  setup: {
    icon: Wrench,
    label: 'Setup',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  optimize: {
    icon: Lightbulb,
    label: 'Optimize',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  grow: {
    icon: Rocket,
    label: 'Grow',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
};

interface NextActionCardProps {
  actions: NextAction[];
}

export function NextActionCard({ actions }: NextActionCardProps) {
  if (actions.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="flex items-center gap-3 py-4">
          <span className="text-green-700 font-medium">
            You&apos;re all set! No pending actions right now.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {actions.map((action) => {
        const config = typeConfig[action.type];
        const Icon = config.icon;

        return (
          <Card
            key={action.id}
            className={cn(
              'border border-orange-100 bg-orange-50/50 transition-shadow hover:shadow-md'
            )}
          >
            <CardContent className="flex items-start gap-4 py-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                <Icon className="h-5 w-5 text-pink-600" />
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {action.title}
                  </h3>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', config.badgeClass)}
                  >
                    {config.label}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600">{action.description}</p>

                <div className="mt-1">
                  <Button
                    asChild
                    size="sm"
                    className="bg-pink-600 text-white hover:bg-pink-700"
                  >
                    <Link href={action.href}>Get started</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

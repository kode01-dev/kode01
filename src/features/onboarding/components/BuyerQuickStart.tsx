'use client';

import { useTranslations } from 'next-intl';
import { ShoppingBag, Package, ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/card';

const QUICK_START_ITEMS = [
  {
    key: 'market',
    href: '/market',
    icon: ShoppingBag,
    color: 'bg-kode01-pink/10',
    iconColor: 'text-kode01-pink',
  },
  {
    key: 'bundles',
    href: '/market?view=bundles',
    icon: Package,
    color: 'bg-kode01-blue/10',
    iconColor: 'text-kode01-blue',
  },
] as const;

export function BuyerQuickStart() {
  const t = useTranslations('onboarding.quick_start');

  return (
    <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-sauge/15 bg-gradient-to-br from-kode01-white to-kode01-cream/40 shadow-sm">
      <CardContent className="px-6 py-6 sm:px-8 sm:py-7">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-kode01-noir/40">
          {t('title')}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUICK_START_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="group flex items-start gap-3.5 rounded-2xl border border-black/5 bg-white p-4 transition-all hover:border-kode01-pink/30 hover:shadow-sm"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.color}`}
                >
                  <Icon size={18} className={item.iconColor} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-kode01-noir">
                    {t(`${item.key}_title`)}
                  </p>
                  <p className="mt-0.5 text-xs text-kode01-noir/50">
                    {t(`${item.key}_desc`)}
                  </p>
                </div>
                <ArrowRight
                  size={14}
                  className="mt-1 shrink-0 text-kode01-noir/20 transition-colors group-hover:text-kode01-pink"
                />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, CreditCard, Package, User, X, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Link } from '@/i18n/routing';
import { useOnboardingStore } from '../store/useOnboardingStore';

interface SellerChecklistCardProps {
  stripeReady: boolean;
  hasProducts: boolean;
  profileComplete: boolean;
  locale: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function SellerChecklistCard({
  stripeReady,
  hasProducts,
  profileComplete,
  locale,
}: SellerChecklistCardProps) {
  const t = useTranslations('dashboard.vendor.onboarding_progress');
  const tOnboarding = useTranslations('onboarding.checklist');
  const { checklistDismissed, checklistDismissedAt, dismissChecklist } =
    useOnboardingStore();

  const steps = [
    {
      key: 'stripe',
      icon: CreditCard,
      completed: stripeReady,
      href: `/${locale}/vendor`,
    },
    {
      key: 'product',
      icon: Package,
      completed: hasProducts,
      href: `/${locale}/vendor/products/new`,
    },
    {
      key: 'profile',
      icon: User,
      completed: profileComplete,
      href: `/${locale}/vendor/settings`,
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;


  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);

  const isRecentlyDismissed = useMemo(() => {
    if (!now || !checklistDismissed || !checklistDismissedAt) return false;
    return now - checklistDismissedAt < SEVEN_DAYS_MS;
  }, [now, checklistDismissed, checklistDismissedAt]);

  // Early returns
  if (allDone) return null;
  if (isRecentlyDismissed) return null;

  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <Card className="relative mb-8 overflow-hidden rounded-[32px] border-kode01-green/15 bg-gradient-to-br from-kode01-white to-kode01-cream/40 shadow-sm">
      <button
        type="button"
        onClick={dismissChecklist}
        className="absolute top-4 right-4 z-10 rounded-full p-1.5 text-kode01-noir/25 transition-colors hover:bg-black/5 hover:text-kode01-noir/50"
        aria-label={tOnboarding('dismiss_sr')}
      >
        <X size={16} />
      </button>

      <CardHeader className="pb-3 pr-12">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif text-lg font-black text-kode01-noir">
              {t('title')}
            </CardTitle>
            <CardDescription className="text-xs text-kode01-noir/50 mt-0.5">
              {t('description')}
            </CardDescription>
          </div>
          <span className="text-xs font-bold text-kode01-noir/40">
            {t('progress', { count: completedCount, total: steps.length })}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 w-full rounded-full bg-black/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPercent}%`,
              background: 'linear-gradient(90deg, #F291C8, #2B463C)',
            }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-1 pb-5">
        <ul className="space-y-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.key} className="flex items-start gap-3">
                {step.completed ? (
                  <CheckCircle2
                    size={20}
                    className="shrink-0 text-kode01-green mt-0.5"
                  />
                ) : (
                  <Circle
                    size={20}
                    className="shrink-0 text-kode01-noir/15 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${
                      step.completed
                        ? 'text-kode01-noir/40 line-through'
                        : 'text-kode01-noir'
                    }`}
                  >
                    {t(`step_${step.key}`)}
                  </p>
                  <p className="text-xs text-kode01-noir/45 mt-0.5">
                    {t(`step_${step.key}_desc`)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!step.completed && (
                    <Link
                      href={step.href}
                      className="flex items-center gap-1 rounded-full bg-kode01-cream px-3 py-1 text-xs font-bold text-kode01-noir/60 transition-colors hover:bg-kode01-pink/15 hover:text-kode01-noir"
                    >
                      <ArrowRight size={12} />
                    </Link>
                  )}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.completed ? 'bg-kode01-green/10' : 'bg-black/5'
                    }`}
                  >
                    <Icon
                      size={14}
                      className={
                        step.completed
                          ? 'text-kode01-green'
                          : 'text-kode01-noir/30'
                      }
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

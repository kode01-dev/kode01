'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, CreditCard, Package, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface OnboardingStep {
  key: string;
  icon: typeof CreditCard;
  completed: boolean;
}

interface VendorOnboardingProgressProps {
  stripeReady: boolean;
  hasProducts: boolean;
  profileComplete: boolean;
}

export function VendorOnboardingProgress({
  stripeReady,
  hasProducts,
  profileComplete,
}: VendorOnboardingProgressProps) {
  const t = useTranslations('dashboard.vendor.onboarding_progress');

  const steps: OnboardingStep[] = [
    { key: 'stripe', icon: CreditCard, completed: stripeReady },
    { key: 'product', icon: Package, completed: hasProducts },
    { key: 'profile', icon: User, completed: profileComplete },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;

  // Don't render if all steps are completed
  if (allDone) return null;

  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-green/15 bg-gradient-to-br from-kode01-white to-kode01-cream/40 shadow-sm">
      <CardHeader className="pb-3">
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
                  <CheckCircle2 size={20} className="shrink-0 text-kode01-green mt-0.5" />
                ) : (
                  <Circle size={20} className="shrink-0 text-kode01-noir/15 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${step.completed ? 'text-kode01-noir/40 line-through' : 'text-kode01-noir'}`}>
                    {t(`step_${step.key}`)}
                  </p>
                  <p className="text-xs text-kode01-noir/45 mt-0.5">
                    {t(`step_${step.key}_desc`)}
                  </p>
                </div>
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${step.completed ? 'bg-kode01-green/10' : 'bg-black/5'}`}>
                  <Icon size={14} className={step.completed ? 'text-kode01-green' : 'text-kode01-noir/30'} />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

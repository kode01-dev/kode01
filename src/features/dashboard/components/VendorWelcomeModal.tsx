'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Circle, CreditCard, Package, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface VendorWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  { key: 'stripe' as const, icon: CreditCard },
  { key: 'product' as const, icon: Package },
  { key: 'sale' as const, icon: ShoppingBag },
] as const;

export function VendorWelcomeModal({ isOpen, onClose }: VendorWelcomeModalProps) {
  const t = useTranslations('dashboard.buyer.become_vendor');
  const locale = useLocale();

  function handleGoToDashboard() {
    window.location.href = `/${locale}/vendor`;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-black/10 bg-kode01-white p-0 rounded-[28px] overflow-hidden">
        {/* Header with success gradient */}
        <div className="border-b border-black/5 bg-gradient-to-r from-kode01-green/10 via-white to-kode01-pink/10 px-6 py-6 sm:px-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-kode01-green/10">
            <CheckCircle2 size={28} className="text-kode01-green" />
          </div>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-black text-kode01-noir">
              {t('welcome_title')}
            </DialogTitle>
            <DialogDescription className="text-kode01-noir/60 mt-1">
              {t('welcome_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Steps checklist */}
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <ol className="space-y-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.key} className="flex items-start gap-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kode01-cream">
                    <Icon size={16} className="text-kode01-noir/50" />
                  </span>
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-kode01-noir/40 uppercase tracking-wider">
                        {index + 1}.
                      </span>
                      <Circle size={14} className="text-kode01-noir/20" />
                    </div>
                    <p className="text-sm font-semibold text-kode01-noir mt-0.5">
                      {t(`welcome_step_${step.key}`)}
                    </p>
                    <p className="text-xs text-kode01-noir/50 mt-0.5">
                      {t(`welcome_step_${step.key}_desc`)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <Button
            type="button"
            onClick={handleGoToDashboard}
            className="mt-6 w-full rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold h-11"
          >
            {t('welcome_cta')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

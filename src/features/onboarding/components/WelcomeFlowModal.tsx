'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Rocket, ShoppingBag, BarChart3, CreditCard, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { markOnboardingCompleted } from '../actions/onboarding-actions';

type Intent = 'buyer' | 'seller';

interface WelcomeFlowModalProps {
  isOpen: boolean;
  onClose: (openVendorApplication: boolean) => void;
  currentRole: 'buyer' | 'seller';
}

export function WelcomeFlowModal({ isOpen, onClose, currentRole }: WelcomeFlowModalProps) {
  const t = useTranslations('onboarding');
  const [step, setStep] = useState<0 | 1>(0);
  const [selectedIntent, setSelectedIntent] = useState<Intent>(
    currentRole === 'seller' ? 'seller' : 'buyer'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleComplete(openVendorApplication: boolean) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await markOnboardingCompleted();
    } catch {
      // Non-blocking — if it fails, the modal won't reappear after page refresh
      // because the user already saw it. It will show again next session, which is fine.
    }

    onClose(openVendorApplication);
  }

  function handleDismiss(open: boolean) {
    if (!open) {
      void handleComplete(false);
    }
  }

  function handleSelectIntent(intent: Intent) {
    setSelectedIntent(intent);
    setStep(1);
  }

  const BUYER_FEATURES = [
    { key: 'feature_market', icon: ShoppingBag },
    { key: 'feature_bundles', icon: Package },
  ] as const;

  const SELLER_FEATURES = [
    { key: 'feature_products', icon: Package },
    { key: 'feature_stripe', icon: CreditCard },
    { key: 'feature_analytics', icon: BarChart3 },
  ] as const;

  return (
    <Dialog open={isOpen} onOpenChange={handleDismiss}>
      <DialogContent
        className="max-w-lg border-black/10 bg-kode01-white p-0 rounded-[28px] overflow-hidden"
        showCloseButton
      >
        {step === 0 ? (
          <>
            {/* Step 0 — Role selection */}
            <div className="border-b border-black/5 bg-gradient-to-r from-kode01-pink/10 via-white to-kode01-blue/10 px-6 py-8 sm:px-8 text-center">
              <DialogHeader>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-kode01-noir/50">
                  {t('welcome.eyebrow')}
                </p>
                <DialogTitle className="font-serif text-3xl font-black text-kode01-noir mt-3">
                  {t('welcome.title')}
                </DialogTitle>
                <DialogDescription className="text-kode01-noir/60 mt-2 text-base">
                  {t('welcome.subtitle')}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-6 py-6 sm:px-8 sm:py-7">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectIntent('buyer')}
                  className={`group relative rounded-2xl border-2 p-5 text-left transition-all hover:shadow-md ${
                    selectedIntent === 'buyer'
                      ? 'border-kode01-pink bg-kode01-pink/5'
                      : 'border-black/10 hover:border-kode01-pink/40'
                  }`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-kode01-blue/10">
                    <ShoppingBag size={20} className="text-kode01-blue" />
                  </div>
                  <p className="text-sm font-bold text-kode01-noir">
                    {t('welcome.buyer_label')}
                  </p>
                  <p className="mt-1 text-xs text-kode01-noir/50 leading-relaxed">
                    {t('welcome.buyer_desc')}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectIntent('seller')}
                  className={`group relative rounded-2xl border-2 p-5 text-left transition-all hover:shadow-md ${
                    selectedIntent === 'seller'
                      ? 'border-kode01-pink bg-kode01-pink/5'
                      : 'border-black/10 hover:border-kode01-pink/40'
                  }`}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-kode01-green/10">
                    <Rocket size={20} className="text-kode01-green" />
                  </div>
                  <p className="text-sm font-bold text-kode01-noir">
                    {t('welcome.seller_label')}
                  </p>
                  <p className="mt-1 text-xs text-kode01-noir/50 leading-relaxed">
                    {t('welcome.seller_desc')}
                  </p>
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Step 1 — Role-specific orientation */}
            <div className="border-b border-black/5 bg-gradient-to-r from-kode01-pink/10 via-white to-kode01-blue/10 px-6 py-6 sm:px-8 text-center">
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl font-black text-kode01-noir">
                  {selectedIntent === 'buyer'
                    ? t('orientation_buyer.title')
                    : t('orientation_seller.title')}
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="px-6 py-6 sm:px-8 sm:py-7">
              <ul className="space-y-4">
                {(selectedIntent === 'buyer' ? BUYER_FEATURES : SELLER_FEATURES).map(
                  (feature) => {
                    const Icon = feature.icon;
                    const namespace =
                      selectedIntent === 'buyer'
                        ? 'orientation_buyer'
                        : 'orientation_seller';
                    return (
                      <li key={feature.key} className="flex items-start gap-3.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kode01-cream">
                          <Icon size={16} className="text-kode01-noir/50" />
                        </span>
                        <p className="text-sm text-kode01-noir/80 leading-relaxed pt-1">
                          {t(`${namespace}.${feature.key}`)}
                        </p>
                      </li>
                    );
                  }
                )}
              </ul>

              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() =>
                  handleComplete(selectedIntent === 'seller' && currentRole === 'buyer')
                }
                className="mt-6 w-full rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold h-11"
              >
                {selectedIntent === 'buyer'
                  ? t('orientation_buyer.cta')
                  : t('orientation_seller.cta')}
                <ArrowRight size={16} />
              </Button>

              <button
                type="button"
                onClick={() => setStep(0)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-kode01-noir/40 hover:text-kode01-noir/70 transition-colors"
              >
                <ArrowLeft size={14} />
                {t('back')}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

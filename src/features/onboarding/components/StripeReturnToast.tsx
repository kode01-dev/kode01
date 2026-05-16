'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface StripeReturnToastProps {
  onboardingComplete: boolean;
  stripeConnectReturned?: boolean;
  stripeConnectError?: string;
}

export function StripeReturnToast({
  onboardingComplete,
  stripeConnectReturned = false,
  stripeConnectError,
}: StripeReturnToastProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!onboardingComplete && !stripeConnectReturned && !stripeConnectError) return;
    firedRef.current = true;

    if (stripeConnectError) {
      toast.error(t('stripe_return_error_toast'));
    } else if (onboardingComplete || stripeConnectReturned) {
      toast.success(t('stripe_return_toast'));
    }

    // Clean the URL by removing query params
    router.replace('/vendor', { scroll: false });
  }, [onboardingComplete, stripeConnectError, stripeConnectReturned, t, router]);

  return null;
}

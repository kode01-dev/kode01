'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ManageStripeButton() {
  const t = useTranslations('dashboard.vendor');
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);

  const handleManageStripe = async () => {
    setIsLoading(true);

    try {
      const res = await fetch('/api/stripe/connect/login-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && typeof data.url === 'string') {
        window.location.href = data.url;
        return;
      }

      console.error('Failed to get Stripe Express login link:', data.error);
      toast.error(typeof data.error === 'string' ? data.error : t('manage_stripe_error'));
    } catch (error) {
      console.error('Stripe Express login-link error:', error);
      toast.error(t('manage_stripe_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleManageStripe}
      disabled={isLoading}
      className="rounded-full border border-kode01-noir/20 bg-kode01-white text-kode01-noir font-bold hover:bg-kode01-noir hover:text-white transition-colors"
    >
      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {isLoading ? t('manage_stripe_loading') : t('manage_stripe')}
    </Button>
  );
}

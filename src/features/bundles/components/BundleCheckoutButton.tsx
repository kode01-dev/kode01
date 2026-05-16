'use client';

import { useState } from 'react';
import { toast } from 'sonner';

type BundleCheckoutButtonProps = {
  bundleId: string;
  label: string;
  loadingLabel: string;
  className?: string;
};

export function BundleCheckoutButton({
  bundleId,
  label,
  loadingLabel,
  className,
}: BundleCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: bundleId }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to initialize checkout');
      }

      if (!payload?.url) {
        throw new Error('Missing Stripe checkout URL');
      }

      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to start checkout');
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => {
        void handleClick();
      }}
      className={className}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

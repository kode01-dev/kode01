'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type VendorLicenseToggleProps = {
  productId: string;
  initialEnabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  savingLabel: string;
  errorLabel: string;
};

export function VendorLicenseToggle({
  productId,
  initialEnabled,
  enabledLabel,
  disabledLabel,
  savingLabel,
  errorLabel,
}: VendorLicenseToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async () => {
    if (isSaving) return;
    const previous = enabled;
    const next = !enabled;

    setEnabled(next);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/vendor/products/${productId}/license`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          generatesLicenseKey: next,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? errorLabel);
      }

      setEnabled(Boolean(payload?.generatesLicenseKey));
    } catch (error) {
      setEnabled(previous);
      toast.error(error instanceof Error ? error.message : errorLabel);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={enabled ? 'default' : 'outline'}
      disabled={isSaving}
      onClick={handleToggle}
      aria-pressed={enabled}
      className={enabled
        ? 'rounded-full border-0 bg-kode01-green/15 text-kode01-green hover:bg-kode01-green/20 font-bold'
        : 'rounded-full border-black/10 text-kode01-noir/70 hover:bg-black/5 font-bold'}
    >
      <span
        className={enabled
          ? 'mr-2 inline-block h-2.5 w-2.5 rounded-full bg-kode01-green'
          : 'mr-2 inline-block h-2.5 w-2.5 rounded-full bg-kode01-noir/30'}
      />
      {isSaving ? savingLabel : enabled ? enabledLabel : disabledLabel}
    </Button>
  );
}

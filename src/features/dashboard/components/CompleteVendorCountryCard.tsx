'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { completeVendorCountry } from '@/features/dashboard/actions/vendor-actions';
import { STRIPE_CONNECT_COUNTRY_OPTIONS } from '@/lib/stripe/connect-countries';

export function CompleteVendorCountryCard() {
  const t = useTranslations('dashboard.vendor.country_completion');
  const [country, setCountry] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<'validation' | 'unauthorized' | 'forbidden' | 'country_locked' | 'database' | 'unknown' | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setIsSubmitting(true);

    try {
      const result = await completeVendorCountry({ country });
      if (!result.success) {
        setErrorKey(result.error);
        return;
      }

      window.location.reload();
    } catch {
      setErrorKey('unknown');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-sauge/30 bg-kode01-sauge/5 shadow-sm">
      <CardContent className="px-4 py-6 sm:px-8 sm:py-7">
        <h2 className="font-serif text-2xl font-black text-kode01-noir">{t('title')}</h2>
        <p className="mt-2 text-sm text-kode01-noir/70">{t('description')}</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-country" className="text-kode01-noir/70">
              {t('country_label')}
            </Label>
            <select
              id="vendor-country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm"
            >
              <option value="">{t('country_placeholder')}</option>
              {STRIPE_CONNECT_COUNTRY_OPTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {errorKey ? (
            <div className="rounded-2xl bg-kode01-pink/5 px-3 py-2 text-sm text-kode01-pink">
              {t(`errors.${errorKey}`)}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-kode01-noir text-white hover:bg-kode01-noir/90"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSubmitting ? t('saving') : t('save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { becomeVendor } from '@/features/dashboard/actions/vendor-actions';
import { STRIPE_CONNECT_COUNTRY_OPTIONS } from '@/lib/stripe/connect-countries';
import { VendorWelcomeModal } from './VendorWelcomeModal';

interface VendorApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VendorApplicationModal({ isOpen, onClose }: VendorApplicationModalProps) {
  const t = useTranslations('dashboard.buyer.become_vendor');
  const [shopName, setShopName] = useState('');
  const [country, setCountry] = useState('');
  const [shopNameError, setShopNameError] = useState(false);
  const [countryError, setCountryError] = useState(false);
  const [errorKey, setErrorKey] = useState<'validation' | 'unauthorized' | 'already_seller' | 'database' | 'country_unsupported' | 'shop_name_restricted' | 'unknown' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShopName('');
    setCountry('');
    setShopNameError(false);
    setCountryError(false);
    setErrorKey(null);
    setIsSubmitting(false);
    setIsRedirecting(false);
    setShowWelcome(false);
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    setShopNameError(false);
    setCountryError(false);

    try {
      const result = await becomeVendor({ shopName, country });

      if (!result.success) {
        setErrorKey(result.error);
        if (result.fieldErrors?.shopName) setShopNameError(true);
        if (result.fieldErrors?.country) setCountryError(true);
        return;
      }

      setIsRedirecting(true);
      setShowWelcome(true);
    } catch {
      setErrorKey('unknown');
    } finally {
      if (!isRedirecting) setIsSubmitting(false);
    }
  }

  if (showWelcome) {
    return (
      <VendorWelcomeModal
        isOpen={showWelcome}
        onClose={() => {
          setShowWelcome(false);
          onClose();
        }}
      />
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isRedirecting && onClose()}>
      <DialogContent className="max-w-lg border-black/10 bg-kode01-white p-0 rounded-[28px] overflow-hidden">
        <div className="border-b border-black/5 bg-gradient-to-r from-kode01-pink/10 via-white to-kode01-blue/10 px-6 py-5 sm:px-8">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-black text-kode01-noir">
              {t('modal_title')}
            </DialogTitle>
            <DialogDescription className="text-kode01-noir/60">
              {t('modal_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-7">
          {isRedirecting ? (
            <div className="text-center py-6">
              <Loader2 size={24} className="animate-spin mx-auto text-kode01-pink" />
              <p className="mt-4 text-sm text-kode01-noir/65">{t('redirecting')}</p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="shop-name" className="text-kode01-noir/70">
                  {t('shop_name_label')}
                </Label>
                <Input
                  id="shop-name"
                  value={shopName}
                  onChange={(event) => {
                    setShopName(event.target.value);
                    if (shopNameError) setShopNameError(false);
                  }}
                  placeholder={t('shop_name_placeholder')}
                  className="rounded-2xl border-black/10 h-11"
                  aria-invalid={shopNameError ? true : undefined}
                  autoFocus
                />
                {shopNameError ? <p className="text-xs text-kode01-pink">{t('errors.shop_name')}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-country" className="text-kode01-noir/70">
                  {t('country_label')}
                </Label>
                <select
                  id="shop-country"
                  value={country}
                  onChange={(event) => {
                    setCountry(event.target.value);
                    if (countryError) setCountryError(false);
                  }}
                  className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm"
                  aria-invalid={countryError ? true : undefined}
                >
                  <option value="">{t('country_placeholder')}</option>
                  {STRIPE_CONNECT_COUNTRY_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {countryError ? <p className="text-xs text-kode01-pink">{t('errors.country')}</p> : null}
                <p className="flex items-start gap-1.5 text-xs text-kode01-sauge mt-1">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  {t('country_warning')}
                </p>
              </div>

              {errorKey ? (
                <div className="rounded-2xl bg-kode01-pink/5 px-3 py-2 text-sm text-kode01-pink">
                  {t(`errors.${errorKey}`)}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="rounded-full border-black/15 text-kode01-noir hover:bg-black/5"
                  disabled={isSubmitting}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  className="rounded-full bg-kode01-pink text-kode01-noir hover:bg-kode01-pink/90 font-bold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isSubmitting ? t('activating') : t('activate')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

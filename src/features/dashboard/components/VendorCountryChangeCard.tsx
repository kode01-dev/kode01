'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { STRIPE_CONNECT_COUNTRY_OPTIONS, getConnectCountryLabel } from '@/lib/stripe/connect-countries';

const CONFIRMATION_PHRASE = 'CHANGER MON PAYS';

type CheckErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'country_required'
  | 'country_unsupported'
  | 'country_locked'
  | 'country_same'
  | 'balance_not_zero'
  | 'missing_connected_account'
  | 'database'
  | 'unknown';

type StartErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'country_required'
  | 'country_unsupported'
  | 'country_locked'
  | 'country_same'
  | 'balance_not_zero'
  | 'confirmation_phrase_mismatch'
  | 'missing_connected_account'
  | 'database'
  | 'unknown';

type VendorCountryChangeCardProps = {
  currentCountry: string;
};

export function VendorCountryChangeCard({ currentCountry }: VendorCountryChangeCardProps) {
  const t = useTranslations('dashboard.vendor.country_change');
  const locale = useLocale();
  const [targetCountry, setTargetCountry] = useState('');
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [checkPassed, setCheckPassed] = useState(false);
  const [checkError, setCheckError] = useState<CheckErrorCode | null>(null);
  const [startError, setStartError] = useState<StartErrorCode | null>(null);

  const countryOptions = useMemo(
    () => STRIPE_CONNECT_COUNTRY_OPTIONS.filter((item) => item.code !== currentCountry),
    [currentCountry],
  );

  async function handleCheck() {
    setCheckError(null);
    setStartError(null);
    setCheckPassed(false);
    setIsChecking(true);

    try {
      const response = await fetch('/api/stripe/connect/country-change/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCountry }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCheckError((payload.error as CheckErrorCode | undefined) ?? 'unknown');
        return;
      }

      setCheckPassed(true);
    } catch {
      setCheckError('unknown');
    } finally {
      setIsChecking(false);
    }
  }

  async function handleStart() {
    setStartError(null);
    setIsStarting(true);

    try {
      const response = await fetch('/api/stripe/connect/country-change/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCountry,
          confirmationPhrase,
          locale,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        setStartError((payload.error as StartErrorCode | undefined) ?? 'unknown');
        return;
      }

      window.location.href = payload.url;
    } catch {
      setStartError('unknown');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-pink/30 bg-kode01-pink/5 shadow-sm">
      <CardContent className="px-4 py-6 sm:px-8 sm:py-7">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 text-kode01-pink" size={18} />
          <div>
            <h2 className="font-serif text-2xl font-black text-kode01-noir">{t('title')}</h2>
            <p className="mt-2 text-sm text-kode01-noir/70">{t('description', { country: getConnectCountryLabel(currentCountry) })}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-kode01-pink/20 bg-kode01-white p-4 text-sm text-kode01-noir/80">
          <p className="font-semibold text-kode01-pink">{t('warning_title')}</p>
          <p className="mt-2">{t('warning_body')}</p>
        </div>

        <div className="mt-6 space-y-1.5">
          <Label htmlFor="target-country" className="text-kode01-noir/70">
            {t('new_country_label')}
          </Label>
          <select
            id="target-country"
            value={targetCountry}
            onChange={(event) => {
              setTargetCountry(event.target.value);
              setCheckPassed(false);
              setCheckError(null);
              setStartError(null);
              setConfirmationPhrase('');
            }}
            className="h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm"
          >
            <option value="">{t('new_country_placeholder')}</option>
            {countryOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        {checkError ? (
          <div className="mt-4 rounded-2xl bg-kode01-pink/10 px-3 py-2 text-sm text-kode01-pink">{t(`errors.${checkError}`)}</div>
        ) : null}

        <div className="mt-4">
          <Button
            type="button"
            onClick={handleCheck}
            disabled={isChecking || !targetCountry}
            className="rounded-full bg-kode01-noir text-white hover:bg-kode01-noir/90"
          >
            {isChecking ? <Loader2 size={16} className="animate-spin" /> : null}
            {isChecking ? t('checking') : t('check_button')}
          </Button>
        </div>

        {checkPassed ? (
          <div className="mt-5 rounded-2xl border border-kode01-sauge/20 bg-kode01-sauge/5 p-4">
            <p className="text-sm font-semibold text-kode01-sauge">{t('confirmation_title')}</p>
            <p className="mt-1 text-sm text-kode01-noir/80">{t('confirmation_instruction', { phrase: CONFIRMATION_PHRASE })}</p>
            <input
              value={confirmationPhrase}
              onChange={(event) => setConfirmationPhrase(event.target.value)}
              className="mt-3 h-11 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm"
              placeholder={CONFIRMATION_PHRASE}
            />

            {startError ? (
              <div className="mt-3 rounded-2xl bg-kode01-pink/10 px-3 py-2 text-sm text-kode01-pink">{t(`errors.${startError}`)}</div>
            ) : null}

            <div className="mt-4">
              <Button
                type="button"
                onClick={handleStart}
                disabled={isStarting || confirmationPhrase !== CONFIRMATION_PHRASE}
                className="rounded-full bg-kode01-pink text-kode01-white hover:bg-kode01-pink/90"
              >
                {isStarting ? <Loader2 size={16} className="animate-spin" /> : null}
                {isStarting ? t('starting') : t('start_button')}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

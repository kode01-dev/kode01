'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type VendorCountryChangeFinalizeProps = {
  eventId?: string;
  accountId?: string;
  onboardingComplete?: string;
};

export function VendorCountryChangeFinalize(props: VendorCountryChangeFinalizeProps) {
  const t = useTranslations('dashboard.vendor.country_change_finalize');
  const [messageKey, setMessageKey] = useState<'pending' | 'success' | 'error' | null>(
    props.eventId && props.accountId && props.onboardingComplete === 'true' ? 'pending' : null,
  );

  useEffect(() => {
    if (!props.eventId || !props.accountId || props.onboardingComplete !== 'true') {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/stripe/connect/country-change/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: props.eventId,
            accountId: props.accountId,
          }),
        });

        if (cancelled) return;
        setMessageKey(response.ok ? 'success' : 'error');
      } catch {
        if (!cancelled) {
          setMessageKey('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.accountId, props.eventId, props.onboardingComplete]);

  if (!messageKey) return null;

  const className =
    messageKey === 'success'
      ? 'mb-6 rounded-2xl bg-kode01-green/5 px-4 py-3 text-sm text-kode01-green'
      : messageKey === 'pending'
        ? 'mb-6 rounded-2xl bg-kode01-blue/10 px-4 py-3 text-sm text-kode01-blue'
        : 'mb-6 rounded-2xl bg-kode01-pink/5 px-4 py-3 text-sm text-kode01-pink';

  return <div className={className}>{t(messageKey)}</div>;
}

'use client';

import { useTranslations } from 'next-intl';
import { Cookie } from 'lucide-react';

type CookieConsentWindow = Window & {
  CookieConsent?: {
    showPreferences?: () => void;
    show?: (showModal?: boolean) => void;
  };
};

type Props = {
  variant?: 'floating' | 'inline' | 'cta';
};

export function ManageCookiePreferencesButton({ variant = 'floating' }: Props) {
  const t = useTranslations('cookie_consent.manage');
  const label = t('button');

  function handleClick() {
    const api = (window as CookieConsentWindow).CookieConsent;
    if (api?.showPreferences) {
      api.showPreferences();
      return;
    }
    if (api?.show) {
      api.show(true);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={
        variant === 'inline'
          ? 'h-9 w-9 rounded-full bg-white/5 text-white/40 border-2 border-white/10 hover:border-kode01-pink hover:text-kode01-pink transition-all flex items-center justify-center shrink-0'
          : variant === 'cta'
            ? 'inline-flex items-center gap-2 rounded-2xl border-2 border-kode01-noir/10 bg-kode01-noir px-4 py-2.5 text-sm font-bold text-white shadow-[4px_4px_0_0_rgba(26,26,26,0.15)] transition-all hover:-translate-y-0.5 hover:border-kode01-pink hover:text-kode01-pink'
            : 'fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[70] h-12 w-12 md:h-14 md:w-14 rounded-full bg-kode01-noir text-white border-2 border-white/20 shadow-[4px_4px_0_0_rgba(0,0,0,0.35)] hover:border-kode01-pink hover:text-kode01-pink transition-all flex items-center justify-center'
      }
    >
      <Cookie size={variant === 'inline' ? 16 : 20} strokeWidth={2.2} />
      {variant === 'cta' ? <span>{label}</span> : null}
    </button>
  );
}

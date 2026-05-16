import { AlertTriangle } from 'lucide-react';

import type { MarketTranslationFn } from './market-utils';

interface MarketSafetyBannerProps {
  t: MarketTranslationFn;
  isDegradedMode: boolean;
  loading: boolean;
  onRefreshNow: () => Promise<void>;
}

export function MarketSafetyBanner({
  t,
  isDegradedMode,
  loading,
  onRefreshNow,
}: MarketSafetyBannerProps): React.JSX.Element {
  return (
    <div className="mb-8 rounded-3xl border border-kode01-pink/40 bg-white p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-kode01-pink mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-base font-black text-kode01-noir">
              {isDegradedMode
                ? t('resilience.degraded_title')
                : t('resilience.refresh_required_title')}
            </h3>
            <p className="mt-1 text-sm text-kode01-noir/70">
              {isDegradedMode
                ? t('resilience.degraded_description')
                : t('resilience.refresh_required_description')}
            </p>
            {isDegradedMode ? (
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/60">
                {t('resilience.measure_active')}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void onRefreshNow();
          }}
          disabled={loading}
          className="self-start md:self-auto px-6 py-3 bg-kode01-noir text-white font-bold text-xs rounded-full transition-all duration-200 hover:bg-kode01-pink hover:text-kode01-noir uppercase tracking-widest border-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t('resilience.refresh_cta')}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function RecommendationPersonalizationToggle() {
  const t = useTranslations('settings');
  const { profile, refreshAuth } = useAuth();
  const [enabled, setEnabled] = useState(profile?.recommendation_personalization_enabled ?? false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEnabled(profile?.recommendation_personalization_enabled ?? false);
  }, [profile?.recommendation_personalization_enabled]);

  const updatePreference = async (nextEnabled: boolean) => {
    const previous = enabled;
    setEnabled(nextEnabled);
    setPending(true);

    try {
      const response = await fetch('/api/recommendations/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationPersonalizationEnabled: nextEnabled }),
      });

      if (!response.ok) {
        throw new Error('Preference update failed');
      }

      await refreshAuth();
      toast.success(t('personalization_success'));
    } catch {
      setEnabled(previous);
      toast.error(t('personalization_error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-kode01-noir/10 bg-kode01-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-kode01-pink/10 text-kode01-pink">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-kode01-noir">{t('personalization_title')}</p>
            <p className="mt-1 text-sm leading-6 text-kode01-noir/55">{t('personalization_description')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void updatePreference(!enabled)}
          disabled={pending}
          className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition disabled:cursor-wait disabled:opacity-70 ${
            enabled
              ? 'bg-kode01-noir text-white hover:bg-kode01-pink hover:text-kode01-noir'
              : 'border border-kode01-noir/15 text-kode01-noir hover:border-kode01-noir'
          }`}
          aria-pressed={enabled}
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : null}
          {enabled ? t('personalization_enabled') : t('personalization_disabled')}
        </button>
      </div>
    </div>
  );
}

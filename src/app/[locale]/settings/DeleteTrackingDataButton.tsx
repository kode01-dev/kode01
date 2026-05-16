'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function DeleteTrackingDataButton() {
  const t = useTranslations('settings');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleDelete = async () => {
    setStatus('loading');

    try {
      const response = await fetch('/api/recommendations/data', {
        method: 'DELETE',
      });

      if (!response.ok) {
        setStatus('error');
        return;
      }

      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleDelete}
        disabled={status === 'loading'}
        className="inline-flex items-center gap-2 rounded-full bg-kode01-noir px-6 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-kode01-pink hover:text-kode01-noir transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        {t('delete_button')}
      </button>

      {status === 'success' && (
        <p className="text-sm font-medium text-kode01-green">{t('delete_success')}</p>
      )}
      {status === 'error' && (
        <p className="text-sm font-medium text-red-500">{t('delete_error')}</p>
      )}
    </div>
  );
}


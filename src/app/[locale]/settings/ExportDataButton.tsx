'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ExportDataButton() {
  const t = useTranslations('settings');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const handleExport = async () => {
    setStatus('loading');

    try {
      const response = await fetch('/api/account/export');

      if (!response.ok) {
        setStatus('error');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kode01-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleExport}
        disabled={status === 'loading'}
        className="inline-flex items-center gap-2 rounded-full border border-kode01-noir/20 px-6 py-3 text-xs font-bold uppercase tracking-widest text-kode01-noir hover:border-kode01-noir hover:bg-kode01-noir hover:text-white transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {t('export_button')}
      </button>

      {status === 'error' && (
        <p className="text-sm font-medium text-red-500">{t('export_error')}</p>
      )}
    </div>
  );
}

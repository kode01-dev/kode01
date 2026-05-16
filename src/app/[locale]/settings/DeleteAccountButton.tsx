'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function DeleteAccountButton({ email }: { email: string }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const handleDelete = async () => {
    if (confirmEmail.toLowerCase() !== email.toLowerCase()) return;

    setStatus('loading');

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail }),
      });

      if (!response.ok) {
        setStatus('error');
        return;
      }

      router.push('/');
    } catch {
      setStatus('error');
    }
  };

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="inline-flex items-center gap-2 rounded-full border border-red-300 px-6 py-3 text-xs font-bold uppercase tracking-widest text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
      >
        <AlertTriangle size={14} />
        {t('delete_account_button')}
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-500" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-red-700">{t('delete_account_warning_title')}</p>
          <p className="text-sm text-red-600/80">{t('delete_account_warning_text')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm-email" className="block text-sm font-semibold text-red-700">
          {t('delete_account_confirm_label')}
        </label>
        <input
          id="confirm-email"
          type="email"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={email}
          className="h-11 w-full rounded-xl border border-red-200 px-4 text-sm text-kode01-noir outline-none transition focus:border-red-400"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={status === 'loading' || confirmEmail.toLowerCase() !== email.toLowerCase()}
          className="inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
          {t('delete_account_confirm_button')}
        </button>
        <button
          type="button"
          onClick={() => { setShowConfirm(false); setConfirmEmail(''); setStatus('idle'); }}
          className="inline-flex items-center rounded-full border border-kode01-noir/20 px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-kode01-noir transition-colors hover:bg-kode01-noir hover:text-white"
        >
          {t('cancel')}
        </button>
      </div>

      {status === 'error' && (
        <p className="text-sm font-medium text-red-500">{t('delete_account_error')}</p>
      )}
    </div>
  );
}

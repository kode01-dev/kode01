'use client';

import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function AiNewsNewsletterCta() {
  const t = useTranslations('artifacts_home.news');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || isSubmitting) return;

    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const body = await parseJsonSafe(response);

      if (!response.ok) {
        const message =
          typeof body?.error === 'string' && body.error.trim().length > 0
            ? body.error
            : t('newsletter_cta_error');
        setStatus({ type: 'error', message: response.status >= 500 ? t('newsletter_cta_error') : message });
        return;
      }

      setEmail('');
      setStatus({ type: 'success', message: t('newsletter_cta_success') });
    } catch {
      setStatus({ type: 'error', message: t('newsletter_cta_error') });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-7 sm:mt-10 rounded-2xl border border-kode01-pink/20 bg-kode01-pink/5 p-4 sm:p-6" aria-labelledby="ai-news-newsletter-cta-title">
      <div className="max-w-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kode01-pink/80">
          {t('newsletter_cta_label')}
        </p>
        <h2 id="ai-news-newsletter-cta-title" className="mt-2 text-lg sm:text-2xl font-serif font-black">
          {t('newsletter_cta_title')}
        </h2>
        <p className="mt-2 text-sm sm:text-base leading-relaxed text-kode01-noir/70">
          {t('newsletter_cta_subtitle')}
        </p>
      </div>
      <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label htmlFor="ai-news-newsletter-email" className="sr-only">
          {t('newsletter_cta_email_label')}
        </label>
        <input
          id="ai-news-newsletter-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('newsletter_cta_email_placeholder')}
          className="min-h-12 flex-1 rounded-xl border border-black/10 bg-white px-4 text-sm font-bold text-kode01-noir outline-none transition-colors placeholder:text-kode01-noir/35 focus:border-kode01-pink"
          autoComplete="email"
          disabled={isSubmitting}
          required
        />
        <button
          type="submit"
          className="min-h-12 rounded-xl bg-kode01-noir px-5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? t('newsletter_cta_loading') : t('newsletter_cta_button')}
        </button>
      </form>
      {status ? (
        <p
          className={`mt-3 text-sm font-bold ${status.type === 'success' ? 'text-green-700' : 'text-red-700'}`}
          aria-live="polite"
        >
          {status.message}
        </p>
      ) : null}
    </section>
  );
}

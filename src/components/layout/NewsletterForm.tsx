'use client';

import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';

async function parseJsonSafe(response: Response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export function NewsletterForm() {
    const t = useTranslations('layout.footer');
    const [newsletterEmail, setNewsletterEmail] = useState('');
    const [isSubmittingNewsletter, setIsSubmittingNewsletter] = useState(false);
    const [newsletterStatus, setNewsletterStatus] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    async function handleNewsletterSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const email = newsletterEmail.trim().toLowerCase();
        if (!email || isSubmittingNewsletter) {
            return;
        }

        setIsSubmittingNewsletter(true);
        setNewsletterStatus(null);

        try {
            const response = await fetch('/api/newsletter/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });

            const body = await parseJsonSafe(response);
            if (!response.ok) {
                const errorMessage =
                    typeof body?.error === 'string' && body.error.trim().length > 0
                        ? body.error
                        : t('newsletter.error');
                setNewsletterStatus({
                    type: 'error',
                    message: response.status >= 500 ? t('newsletter.error') : errorMessage,
                });
                return;
            }

            setNewsletterEmail('');
            setNewsletterStatus({
                type: 'success',
                message: t('newsletter.success'),
            });
        } catch {
            setNewsletterStatus({
                type: 'error',
                message: t('newsletter.error'),
            });
        } finally {
            setIsSubmittingNewsletter(false);
        }
    }

    return (
        <form className="w-full max-w-sm flex flex-col gap-4" onSubmit={handleNewsletterSubmit}>
            <div className="relative group">
                <input
                    type="email"
                    id="newsletter-email"
                    name="email"
                    value={newsletterEmail}
                    onChange={(event) => setNewsletterEmail(event.target.value)}
                    placeholder={t('newsletter.placeholder')}
                    className="w-full bg-white/5 border-2 border-white/10 px-6 py-4 text-white font-bold focus:outline-none focus:border-kode01-pink transition-all placeholder:text-white/20 relative z-10"
                    autoComplete="email"
                    disabled={isSubmittingNewsletter}
                    suppressHydrationWarning
                    required
                />
                <div className="absolute inset-x-0 inset-y-0 border-2 border-kode01-pink translate-x-2 translate-y-2 z-0 group-focus-within:translate-x-0 group-focus-within:translate-y-0 transition-transform" />
            </div>
            <button
                type="submit"
                id="newsletter-submit"
                className="bg-kode01-pink text-kode01-noir font-black uppercase tracking-widest px-8 py-5 hover:bg-white transition-colors border-2 border-kode01-pink mt-2 active:translate-y-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isSubmittingNewsletter}
                suppressHydrationWarning
            >
                {isSubmittingNewsletter ? t('newsletter.loading') : t('newsletter.button')}
            </button>
            {newsletterStatus ? (
                <p
                    className={`text-sm font-semibold ${newsletterStatus.type === 'success' ? 'text-green-300' : 'text-red-300'
                        }`}
                    aria-live="polite"
                >
                    {newsletterStatus.message}
                </p>
            ) : null}
        </form>
    );
}

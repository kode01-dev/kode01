'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Lock, Mail } from 'lucide-react';
import Image from 'next/image';
import type { LockscreenConfig } from '../types';
import { useBodyScrollLock } from '@/lib/ui/useBodyScrollLock';

interface SiteLockscreenOverlayProps {
  config: LockscreenConfig;
  locale: string;
}

export function SiteLockscreenOverlay({ config, locale }: SiteLockscreenOverlayProps) {
  const t = useTranslations('lockscreen');
  useBodyScrollLock(true);

  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [newsletterSuccess, setNewsletterSuccess] = useState(false);

  const isFrench = (locale || 'en').toLowerCase().startsWith('fr');
  const title = isFrench ? config.title_fr : config.title_en;
  const message = isFrench ? config.message_fr : config.message_en;
  const newsletterTitle = isFrench ? config.newsletter_title_fr : config.newsletter_title_en;
  const newsletterCta = isFrench ? config.newsletter_cta_fr : config.newsletter_cta_en;

  async function handleUnlock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUnlocking(true);
    setError(null);

    try {
      const response = await fetch('/api/lockscreen/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // Reload page to refresh server state
        window.location.reload();
      } else {
        setError(t('invalid_password'));
        setUnlocking(false);
      }
    } catch (err) {
      console.error('Unlock error:', err);
      setError(t('invalid_password'));
      setUnlocking(false);
    }
  }

  async function handleNewsletterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNewsletterSubmitting(true);

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsletterEmail }),
      });

      if (response.ok) {
        setNewsletterSuccess(true);
        setNewsletterEmail('');
      }
    } catch (err) {
      console.error('Newsletter subscription error:', err);
    } finally {
      setNewsletterSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-kode01-noir flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <Image
            src="/logo_v2.png"
            alt="KODE01"
            width={112}
            height={28}
            className="mx-auto"
            priority
          />
        </div>

        {/* Title & Message */}
        <div className="text-center space-y-4">
          <h1 className="font-serif text-4xl font-black text-white">
            {title}
          </h1>
          <p className="text-white/70 text-lg leading-relaxed">
            {message}
          </p>
        </div>

        {/* Password Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password_placeholder')}
              className="w-full bg-white/10 border-2 border-white/20 pl-12 pr-4 py-4 text-white rounded-lg focus:outline-none focus:border-kode01-pink placeholder:text-white/40"
              disabled={unlocking}
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={unlocking}
            className="w-full bg-kode01-pink text-kode01-noir font-bold py-4 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {unlocking ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin" />
                {t('unlocking')}
              </span>
            ) : (
              t('unlock_button')
            )}
          </button>
        </form>

        {/* Newsletter Section */}
        {config.newsletter_enabled && (
          <div className="pt-8 border-t-2 border-white/10 space-y-4">
            <div className="flex items-center gap-2 justify-center text-white">
              <Mail size={20} />
              <h2 className="font-bold text-lg">{newsletterTitle}</h2>
            </div>

            {newsletterSuccess ? (
              <div className="text-center">
                <p className="text-kode01-pink font-medium">
                  {t('newsletter_success')}
                </p>
              </div>
            ) : (
              <form onSubmit={handleNewsletterSubmit} className="space-y-3">
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  placeholder={t('newsletter_email_placeholder')}
                  className="w-full bg-white/10 border-2 border-white/20 px-4 py-3 text-white rounded-lg focus:outline-none focus:border-kode01-pink placeholder:text-white/40"
                  required
                  disabled={newsletterSubmitting}
                />
                <button
                  type="submit"
                  disabled={newsletterSubmitting}
                  className="w-full bg-white/10 border-2 border-white/20 px-6 py-3 text-white rounded-lg hover:bg-white/20 transition-colors font-medium disabled:opacity-50"
                >
                  {newsletterSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      {isFrench ? 'Envoi...' : 'Subscribing...'}
                    </span>
                  ) : (
                    newsletterCta
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

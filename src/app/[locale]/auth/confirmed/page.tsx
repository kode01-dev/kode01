import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { Link } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type ConfirmStatus = 'success' | 'error';

function getStatus(value: string | undefined): ConfirmStatus {
  return value === 'success' ? 'success' : 'error';
}

export default async function AuthConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const status = getStatus(resolvedSearchParams.status);
  const isSuccess = status === 'success';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = Boolean(user);

  const t = await getTranslations({ locale, namespace: 'auth.confirm_page' });

  return (
    <div className="min-h-screen bg-kode01-cream text-kode01-noir antialiased font-sans flex flex-col">
      <BaseHeader />

      <main className="flex-1 pt-32 pb-24">
        <div className="mx-auto w-full max-w-5xl px-6 md:px-12">
          <section className="relative overflow-hidden rounded-[36px] border border-black/10 bg-white p-8 md:p-14 shadow-sm">
            <div className="pointer-events-none absolute -top-20 -right-16 h-64 w-64 rounded-full bg-kode01-pink/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-kode01-blue/20 blur-3xl" />

            <div className="relative max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-kode01-noir/50">
                {isSuccess ? t('eyebrow_success') : t('eyebrow_error')}
              </p>

              <div
                className={`mt-5 inline-flex h-16 w-16 items-center justify-center rounded-full ${isSuccess ? 'bg-kode01-green/10' : 'bg-kode01-pink/10'
                  }`}
              >
                {isSuccess ? (
                  <CheckCircle2 className="h-8 w-8 text-kode01-green" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-kode01-pink" />
                )}
              </div>

              <h1 className="mt-6 text-4xl font-serif font-black tracking-tight md:text-6xl">
                {isSuccess ? t('title_success') : t('title_error')}
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kode01-noir/70">
                {isSuccess ? t('description_success') : t('description_error')}
              </p>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href={isSuccess ? (isLoggedIn ? '/dashboard' : '/') : '/'}
                  className="inline-flex items-center gap-2 rounded-full bg-kode01-noir px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
                >
                  {isSuccess ? (isLoggedIn ? t('cta_success') : t('cta_login')) : t('cta_error')}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/news"
                  className="rounded-full border border-black/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-kode01-noir transition-colors hover:border-kode01-noir/40"
                >
                  {t('cta_news')}
                </Link>
              </div>

              <p className="mt-8 text-sm font-medium text-kode01-noir/55">
                {t('support_hint')}
              </p>
            </div>
          </section>
        </div>
      </main>

      <BaseFooter />
    </div>
  );
}

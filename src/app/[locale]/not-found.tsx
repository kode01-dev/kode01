import { Link } from '@/i18n/routing';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { getTranslations } from 'next-intl/server';

export default async function LocaleNotFoundPage() {
    const t = await getTranslations('not_found_page');

    return (
        <div className="min-h-screen bg-kode01-cream text-kode01-noir antialiased font-sans flex flex-col">
            <BaseHeader />

            <main className="flex-1 mx-auto w-full max-w-3xl px-6 pt-40 pb-24 md:px-12">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-kode01-noir/50">404</p>
                <h1 className="mt-4 font-serif text-4xl font-black tracking-tight md:text-6xl">
                    {t('title')}
                </h1>
                <p className="mt-6 max-w-2xl text-lg text-kode01-noir/70">
                    {t('description')}
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                        href="/market"
                        className="rounded-full bg-kode01-noir px-6 py-3 text-sm font-bold uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-90"
                    >
                        {t('browse_market')}
                    </Link>
                    <Link
                        href="/"
                        className="rounded-full border border-kode01-noir/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.15em] text-kode01-noir transition-colors hover:border-kode01-noir/40"
                    >
                        {t('go_home')}
                    </Link>
                </div>
            </main>

            <BaseFooter />
        </div>
    );
}

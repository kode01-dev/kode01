import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Metadata } from 'next';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'market' });
    const metadata = await applySeoMetadata({
        title: t('coming_soon.meta_title'),
        description: t('coming_soon.meta_description'),
        robots: 'noindex, nofollow',
    }, '/market', { locale });

    return {
        ...metadata,
        robots: 'noindex, nofollow',
    };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'market' });
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: t('coming_soon.title'),
        description: t('coming_soon.description'),
        url: `https://kode01.com/${locale}/market`,
        inLanguage: locale,
    };

    return (
        <div className="min-h-screen bg-kode01-cream text-kode01-noir antialiased font-sans flex flex-col">
            <SeoAppJsonLd pathname="/market" fallbackData={jsonLd} />
            <BaseHeader />
            <main className="flex-1 pt-36 pb-24">
                <section className="mx-auto flex min-h-[58vh] w-full max-w-5xl flex-col items-center justify-center px-6 text-center md:px-12">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-kode01-pink">
                        {t('coming_soon.eyebrow')}
                    </p>
                    <h1 className="mt-5 max-w-4xl font-serif text-[clamp(3rem,9vw,6.5rem)] font-black leading-[0.9] tracking-tight">
                        {t('coming_soon.title')}
                    </h1>
                    <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-kode01-noir/65 md:text-lg">
                        {t('coming_soon.description')}
                    </p>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href={`/${locale}/news`}
                            className="rounded-full bg-kode01-noir px-6 py-3 text-sm font-bold uppercase tracking-[0.15em] text-white no-underline transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
                        >
                            {t('coming_soon.cta_news')}
                        </Link>
                        <Link
                            href={`/${locale}/blog`}
                            className="rounded-full border border-kode01-noir/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.15em] text-kode01-noir no-underline transition-colors hover:border-kode01-noir/40"
                        >
                            {t('coming_soon.cta_blog')}
                        </Link>
                    </div>
                </section>
            </main>
            <BaseFooter />
        </div>
    );
}

import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { OpenZipchatCard } from '@/components/zipchat/OpenZipchatCard';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.contact' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/contact', { locale });
}

export default async function ContactPage() {
    const t = await getTranslations('layout.footer');
    return (
        <div className="min-h-screen bg-kode01-cream flex flex-col">
            <SeoAppJsonLd pathname="/contact" />
            <BaseHeader />
            <main className="flex-1 pt-48 pb-24">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h1 className="text-[clamp(3rem,8vw,5rem)] font-serif font-black text-kode01-noir mb-6 tracking-tight leading-none">
                        {t('contact')}
                    </h1>
                    <p className="text-kode01-noir/60 text-xl font-medium max-w-lg mx-auto mb-16 leading-relaxed">
                        Have a question or need help? We&apos;re here for you. Reach out through any of these channels.
                    </p>

                    <div className="max-w-xl mx-auto text-left">
                        <OpenZipchatCard />
                    </div>
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}

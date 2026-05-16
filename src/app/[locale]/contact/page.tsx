import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { OpenZipchatCard } from '@/components/zipchat/OpenZipchatCard';
import { MessageSquare } from 'lucide-react';
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                        <OpenZipchatCard />

                        <div className="bg-kode01-noir rounded-[32px] p-10 shadow-xl text-white">
                            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-kode01-pink">
                                <MessageSquare size={28} />
                            </div>
                            <h2 className="text-2xl font-serif font-black mb-2">Creator Community</h2>
                            <p className="text-white/60">Join our network of elite creators to share tips, tricks, and collaborate.</p>
                            <div className="mt-6">
                                <span className="bg-kode01-pink text-kode01-noir px-6 py-2 rounded-full font-bold text-sm">Coming Soon</span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}

import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { Link } from '@/i18n/routing';
import { Shield, Scale, Cookie, MapPin, Globe } from 'lucide-react';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.legal' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/legal', { locale });
}

export default async function LegalLandingPage() {
    const t = await getTranslations('layout.footer');
    const l = await getTranslations('legal');

    const legalLinks = [
        { href: '/privacy', title: t('privacy'), icon: Shield, desc: 'How we handle your personal data.' },
        { href: '/terms', title: t('terms'), icon: Scale, desc: 'Rules for using our platform.' },
        { href: '/cookies', title: l('cookies.title'), icon: Cookie, desc: 'How we use cookies to improve experience.' },
        { href: '/canada-privacy', title: l('canada.title'), icon: MapPin, desc: 'Compliance with Law 25 & PIPEDA.' },
        { href: '/gdpr-ccpa', title: l('gdpr_ccpa.title'), icon: Globe, desc: 'EU and California data rights.' }
    ];

    return (
        <div className="min-h-screen bg-kode01-cream flex flex-col">
            <SeoAppJsonLd pathname="/legal" />
            <BaseHeader />
            <main className="flex-1 pt-36 pb-20 sm:pt-40">
                <div className="max-w-5xl mx-auto px-5 sm:px-6">
                    <h1 className="text-[clamp(2.5rem,6vw,4.25rem)] font-serif font-black text-kode01-noir mb-5 tracking-tight leading-[1.02]">
                        {t('legal')}
                    </h1>
                    <p className="text-kode01-noir/70 text-lg sm:text-xl max-w-2xl mb-12 leading-relaxed">
                        Transparency and privacy are central to KODE01. Review our legal policies and your rights in one place.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {legalLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="bg-white rounded-3xl p-7 sm:p-8 shadow-[0_10px_24px_rgba(0,0,0,0.05)] border border-kode01-noir/10 hover:border-kode01-noir/25 transition-colors no-underline group flex flex-col justify-between min-h-[220px]"
                            >
                                <div>
                                    <div className="w-11 h-11 bg-kode01-cream rounded-2xl flex items-center justify-center mb-5 text-kode01-noir border border-kode01-noir/10 transition-colors group-hover:bg-white">
                                        <link.icon size={24} />
                                    </div>
                                    <h2 className="text-xl font-serif font-black text-kode01-noir mb-2">{link.title}</h2>
                                    <p className="text-kode01-noir/70 text-[15px] leading-relaxed">{link.desc}</p>
                                </div>
                                <div className="mt-6 font-semibold text-xs uppercase tracking-[0.16em] text-kode01-noir/45 group-hover:text-kode01-noir/70 transition-colors">
                                    &rsaquo;
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}

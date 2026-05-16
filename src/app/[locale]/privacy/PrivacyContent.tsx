'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LegalPageLayout } from '@/features/legal/components/LegalPageLayout';
import { LegalContent } from '@/features/legal/components/LegalContent';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-kode01-noir/10 bg-white p-5 md:p-6">
            <h3 className="font-serif text-xl md:text-[1.45rem] font-black tracking-tight text-kode01-noir mb-4">{title}</h3>
            <div className="text-kode01-noir/80 leading-relaxed space-y-4">{children}</div>
        </section>
    );
}

function BulletList({ items }: { items: string[] }) {
    return (
        <ul className="list-disc pl-5 space-y-2 text-kode01-noir/80">
            {items.map((item, index) => (
                <li key={index}>{item}</li>
            ))}
        </ul>
    );
}

export default function PrivacyContent() {
    const t = useTranslations('legal.privacy');

    const collectList = t.raw('collect_list') as string[];
    const methodsList = t.raw('methods_list') as string[];
    const useList = t.raw('use_list') as string[];
    const shareList = t.raw('share_list') as string[];

    return (
        <LegalPageLayout title={t('title')}>
            <LegalContent className="max-w-none">
                <div className="not-prose space-y-5">
                    <section className="rounded-2xl border border-kode01-noir/10 bg-kode01-cream/60 p-6 md:p-7">
                        <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-kode01-noir/15 bg-white px-3 py-1 text-xs font-semibold text-kode01-noir/70">{t('effective_date')}</span>
                            <span className="rounded-full border border-kode01-noir/15 bg-white px-3 py-1 text-xs font-semibold text-kode01-noir/70">{t('last_updated')}</span>
                        </div>
                        <p className="mt-4 text-kode01-noir/85 leading-relaxed">{t('intro')}</p>
                        <p className="mt-2 text-kode01-noir/70 leading-relaxed">{t('update_notice')}</p>
                    </section>

                    <div className="grid gap-4 md:grid-cols-2">
                        <section className="rounded-2xl border border-kode01-noir/10 bg-white p-5">
                            <p className="text-xs uppercase tracking-[0.14em] text-kode01-noir/50 mb-2">{t('contact_title')}</p>
                            <p className="text-kode01-noir/80">{t('email')}</p>
                        </section>
                        <section className="rounded-2xl border border-kode01-noir/10 bg-white p-5">
                            <p className="text-kode01-noir/80">{t('website')}</p>
                        </section>
                    </div>

                    <Section title={t('collect_title')}>
                        <BulletList items={collectList} />
                    </Section>

                    <Section title={t('methods_title')}>
                        <BulletList items={methodsList} />
                    </Section>

                    <Section title={t('use_title')}>
                        <BulletList items={useList} />
                    </Section>

                    <Section title={t('share_title')}>
                        <BulletList items={shareList} />
                        <p>{t('share_text')}</p>
                    </Section>

                    <Section title={t('retention_title')}>
                        <p>{t('retention_text')}</p>
                    </Section>

                    <Section title={t('rights_title')}>
                        <p>{t('rights_text')}</p>
                        <p>{t('rights_optout_text')}</p>
                    </Section>

                    <Section title={t('cookies_title')}>
                        <p>{t('cookies_text')}</p>
                    </Section>

                    <Section title={t('stripe_payments_title')}>
                        <p>{t('stripe_payments_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir pt-1">{t('stripe_connect_title')}</h4>
                        <p>{t('stripe_connect_text')}</p>
                    </Section>

                    <Section title={t('security_title')}>
                        <p>{t('security_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir pt-1">{t('monitoring_title')}</h4>
                        <p>{t('monitoring_text')}</p>
                    </Section>

                    <Section title={t('third_party_title')}>
                        <p>{t('third_party_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir pt-1">{t('contact_title')}</h4>
                        <p>{t('contact_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir pt-1">{t('personalization_title')}</h4>
                        <p>{t('tracking_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir pt-1">{t('fingerprinting_title')}</h4>
                        <p>{t('fingerprinting_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir pt-1">{t('dnt_title')}</h4>
                        <p>{t('dnt_text')}</p>
                    </Section>
                </div>
            </LegalContent>
        </LegalPageLayout>
    );
}

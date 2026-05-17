'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LegalPageLayout } from '@/features/legal/components/LegalPageLayout';
import { LegalContent } from '@/features/legal/components/LegalContent';

function Section({ title, children, tone = 'default' }: { title: string; children: React.ReactNode; tone?: 'default' | 'muted' }) {
    const sectionClass = tone === 'muted'
        ? 'rounded-2xl border border-kode01-noir/12 bg-kode01-cream/50 p-5 md:p-6'
        : 'rounded-2xl border border-kode01-noir/10 bg-white p-5 md:p-6';

    return (
        <section className={sectionClass}>
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

export default function CanadaPrivacyContent() {
    const t = useTranslations('legal.canada');
    const frameworksList = t.raw('frameworks_list') as string[];
    const rightsList = t.raw('rights_list') as string[];
    const requestList = t.raw('request_list') as string[];

    return (
        <LegalPageLayout title={t('title')}>
            <LegalContent className="max-w-none">
                <div className="not-prose space-y-5">
                    <section className="rounded-2xl border border-kode01-noir/10 bg-kode01-cream/60 p-6 md:p-7">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kode01-noir/55">{t('title')}</p>
                        <p className="mt-2 text-xs font-semibold text-kode01-noir/55">{t('last_updated')}</p>
                        <p className="mt-3 text-kode01-noir/85 leading-relaxed">{t('intro')}</p>
                    </section>

                    <Section title={t('frameworks_title')}>
                        <BulletList items={frameworksList} />
                    </Section>

                    <Section title={t('scope_title')}>
                        <p>{t('scope_text')}</p>
                    </Section>

                    <Section title={t('rights_title')}>
                        <p>{t('rights_intro')}</p>
                        <BulletList items={rightsList} />
                    </Section>

                    <Section title={t('request_title')}>
                        <BulletList items={requestList} />
                    </Section>

                    <Section title={t('cross_border_title')}>
                        <p>{t('cross_border_text')}</p>
                    </Section>

                    <Section title={t('contact_title')} tone="muted">
                        <p>{t('contact_email')}</p>
                        <p>{t('contact_address')}</p>
                    </Section>

                    <p className="text-sm text-kode01-noir/60">{t('disclaimer')}</p>
                </div>
            </LegalContent>
        </LegalPageLayout>
    );
}

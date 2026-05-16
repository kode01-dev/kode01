'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LegalPageLayout } from '@/features/legal/components/LegalPageLayout';
import { LegalContent } from '@/features/legal/components/LegalContent';

interface SectionCardProps {
    title: string;
    children: React.ReactNode;
    tone?: 'default' | 'highlight';
}

function SectionCard({ title, children, tone = 'default' }: SectionCardProps) {
    const classes =
        tone === 'highlight'
            ? 'border-kode01-noir/15 bg-kode01-cream/45'
            : 'border-kode01-noir/10 bg-white';

    return (
        <section className={`rounded-2xl border p-5 md:p-6 ${classes}`}>
            <h3 className="font-serif text-xl md:text-[1.55rem] font-black tracking-tight text-kode01-noir mb-4">{title}</h3>
            <div className="text-kode01-noir/80 leading-relaxed space-y-4">{children}</div>
        </section>
    );
}

function BulletList({ items }: { items: string[] }) {
    return (
        <ul className="space-y-2">
            {items.map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-kode01-noir/45 shrink-0" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

export default function GdprCcpaContent() {
    const t = useTranslations('legal.gdpr_ccpa');
    const legalBasisList = t.raw('legal_basis_list') as string[];
    const rightsList = t.raw('rights_list') as string[];
    const transfersList = t.raw('transfers_list') as string[];
    const ccpaCategoriesList = t.raw('ccpa_categories_list') as string[];
    const ccpaRightsList = t.raw('ccpa_rights_list') as string[];
    const ccpaExerciseList = t.raw('ccpa_exercise_list') as string[];
    const contactLines = t.raw('contact_lines') as string[];

    return (
        <LegalPageLayout title={t('title')}>
            <LegalContent className="max-w-none">
                <div className="not-prose space-y-8">
                    <section className="rounded-2xl border border-kode01-noir/10 bg-kode01-cream/60 p-6 md:p-8">
                        <p className="text-xs font-bold tracking-[0.14em] uppercase text-kode01-noir/55 mb-3">{t('title')}</p>
                        <p className="text-base md:text-lg leading-relaxed text-kode01-noir/85">{t('intro')}</p>
                    </section>

                    <div className="grid gap-4">
                        <SectionCard title={t('controller_title')} tone="highlight">
                            <p>{t('controller_text')}</p>
                        </SectionCard>

                        <SectionCard title={t('age_title')}>
                            <p>{t('age_text')}</p>
                        </SectionCard>
                    </div>

                    <SectionCard title={t('legal_basis_title')}>
                        <BulletList items={legalBasisList} />
                    </SectionCard>

                    <SectionCard title={t('gdpr_rights_title')}>
                        <BulletList items={rightsList} />
                    </SectionCard>

                    <div className="grid gap-4">
                        <SectionCard title={t('transfers_title')}>
                            <BulletList items={transfersList} />
                            <p>{t('transfers_text')}</p>
                        </SectionCard>

                        <SectionCard title={t('retention_title')}>
                            <p>{t('retention_text')}</p>
                        </SectionCard>
                    </div>

                    <div className="grid gap-4">
                        <SectionCard title={t('breach_title')}>
                            <p>{t('breach_text')}</p>
                        </SectionCard>

                        <SectionCard title={t('authority_title')}>
                            <p>{t('authority_text')}</p>
                        </SectionCard>
                    </div>

                    <SectionCard title={t('ccpa_title')} tone="highlight">
                        <p>{t('ccpa_text')}</p>
                    </SectionCard>

                    <div className="grid gap-4">
                        <SectionCard title={t('ccpa_categories_title')}>
                            <BulletList items={ccpaCategoriesList} />
                        </SectionCard>

                        <SectionCard title={t('ccpa_rights_title')}>
                            <BulletList items={ccpaRightsList} />
                        </SectionCard>
                    </div>

                    <div className="grid gap-4">
                        <SectionCard title={t('ccpa_no_sale_title')}>
                            <p>{t('ccpa_no_sale_text')}</p>
                        </SectionCard>

                        <SectionCard title={t('authorized_agent_title')}>
                            <p>{t('authorized_agent_text')}</p>
                        </SectionCard>
                    </div>

                    <SectionCard title={t('ccpa_exercise_title')}>
                        <BulletList items={ccpaExerciseList} />
                        <p>{t('ccpa_response_time')}</p>
                    </SectionCard>

                    <SectionCard title={t('contact_title')} tone="highlight">
                        <BulletList items={contactLines} />
                    </SectionCard>
                </div>
            </LegalContent>
        </LegalPageLayout>
    );
}

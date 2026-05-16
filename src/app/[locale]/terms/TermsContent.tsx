'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LegalPageLayout } from '@/features/legal/components/LegalPageLayout';
import { LegalContent } from '@/features/legal/components/LegalContent';

interface TermSection {
    id: string;
    title: string;
    text: string;
}

export default function TermsContent() {
    const t = useTranslations('legal.terms');

    const sections: TermSection[] = [
        { id: 's1', title: t('s1_title'), text: t('s1_text') },
        { id: 's2', title: t('s2_title'), text: t('s2_text') },
        { id: 's3', title: t('s3_title'), text: t('s3_text') },
        { id: 's4', title: t('s4_title'), text: t('s4_text') },
        { id: 's5', title: t('s5_title'), text: t('s5_text') },
        { id: 's6', title: t('s6_title'), text: t('s6_text') },
        { id: 's7', title: t('s7_title'), text: t('s7_text') },
        { id: 's8', title: t('s8_title'), text: t('s8_text') },
        { id: 's9', title: t('s9_title'), text: t('s9_text') },
        { id: 's10', title: t('s10_title'), text: t('s10_text') },
        { id: 's11', title: t('s11_title'), text: t('s11_text') },
        { id: 's12', title: t('s12_title'), text: t('s12_text') },
        { id: 's13', title: t('s13_title'), text: t('s13_text') },
        { id: 's14', title: t('s14_title'), text: t('s14_text') },
        { id: 's15', title: t('s15_title'), text: t('s15_text') },
        { id: 's16', title: t('s16_title'), text: t('s16_text') },
    ];

    return (
        <LegalPageLayout title={t('title')}>
            <LegalContent className="max-w-none">
                <div className="not-prose space-y-5">
                    <section className="rounded-2xl border border-kode01-noir/10 bg-kode01-cream/60 p-6 md:p-7">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kode01-noir/55">{t('last_updated')}</p>
                        <p className="mt-3 text-kode01-noir/80 leading-relaxed">{t('summary')}</p>
                    </section>

                    {sections.map((section) => (
                        <section
                            key={section.id}
                            id={section.id}
                            className="rounded-2xl border border-kode01-noir/10 bg-white p-5 md:p-6"
                        >
                            <h3 className="font-serif text-xl md:text-[1.45rem] font-black tracking-tight text-kode01-noir">
                                {section.title}
                            </h3>
                            <p className="mt-3 text-kode01-noir/80 leading-relaxed whitespace-pre-line">
                                {section.text}
                            </p>
                        </section>
                    ))}
                </div>
            </LegalContent>
        </LegalPageLayout>
    );
}

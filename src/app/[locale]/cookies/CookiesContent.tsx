'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LegalPageLayout } from '@/features/legal/components/LegalPageLayout';
import { LegalContent } from '@/features/legal/components/LegalContent';
import { ManageCookiePreferencesButton } from '@/features/cookies/ManageCookiePreferencesButton';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-kode01-noir/10 bg-white p-5 md:p-6">
            <h3 className="font-serif text-xl md:text-[1.45rem] font-black tracking-tight text-kode01-noir mb-4">{title}</h3>
            <div className="text-kode01-noir/80 leading-relaxed space-y-4">{children}</div>
        </section>
    );
}

export default function CookiesContent() {
    const t = useTranslations('legal.cookies');
    const typesList = t.raw('types_list') as string[];
    const registerRows = t.raw('register_rows') as Array<{
        name: string;
        category: string;
        purpose: string;
        duration: string;
        provider: string;
    }>;
    const browserLinks = t.raw('browser_links') as Array<{
        name: string;
        url: string;
    }>;

    return (
        <LegalPageLayout title={t('title')}>
            <LegalContent className="max-w-none">
                <div className="not-prose space-y-5">
                    <section className="rounded-2xl border border-kode01-noir/10 bg-kode01-cream/60 p-6 md:p-7">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-kode01-noir/10 bg-white px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.14em] text-kode01-noir/55">{t('effective_label')}</p>
                                <p className="mt-1 font-semibold text-kode01-noir/85">{t('effective_date')}</p>
                            </div>
                            <div className="rounded-xl border border-kode01-noir/10 bg-white px-4 py-3">
                                <p className="text-xs uppercase tracking-[0.14em] text-kode01-noir/55">{t('updated_label')}</p>
                                <p className="mt-1 font-semibold text-kode01-noir/85">{t('updated_date')}</p>
                            </div>
                        </div>
                    </section>

                    <Section title={t('what_title')}>
                        <p>{t('what_text')}</p>
                        <h4 className="font-serif text-lg font-bold tracking-tight text-kode01-noir">{t('how_title')}</h4>
                        <p>{t('how_text')}</p>
                    </Section>

                    <Section title={t('types_title')}>
                        <div className="grid gap-3 md:grid-cols-2">
                            {typesList.map((item, index) => {
                                const parts = item.split(/(<strong>.*?<\/strong>)/gi);
                                return (
                                    <div
                                        key={index}
                                        className="rounded-xl border border-kode01-noir/10 bg-kode01-cream/45 p-4 text-kode01-noir/80"
                                    >
                                        {parts.map((part, i) => {
                                            if (part.toLowerCase().startsWith('<strong>') && part.toLowerCase().endsWith('</strong>')) {
                                                return <strong key={i}>{part.substring(8, part.length - 9)}</strong>;
                                            }
                                            return <React.Fragment key={i}>{part}</React.Fragment>;
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <Section title={t('manage_title')}>
                        <p>{t('manage_text')}</p>
                        <div className="pt-1">
                            <ManageCookiePreferencesButton variant="cta" />
                        </div>
                        <ul className="list-disc pl-5 space-y-2">
                            {browserLinks.map((row) => (
                                <li key={row.name}>
                                    <a
                                        href={row.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-kode01-noir/80 underline decoration-kode01-noir/25 underline-offset-4 hover:decoration-kode01-noir/60"
                                    >
                                        {row.name}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </Section>

                    <Section title={t('register_title')}>
                        <p>{t('register_text')}</p>
                        <div className="overflow-x-auto rounded-xl border border-kode01-noir/10">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-kode01-noir/[0.03] text-kode01-noir">
                                        <th className="px-4 py-3 text-left font-semibold">{t('register_headers.name')}</th>
                                        <th className="px-4 py-3 text-left font-semibold">{t('register_headers.category')}</th>
                                        <th className="px-4 py-3 text-left font-semibold">{t('register_headers.purpose')}</th>
                                        <th className="px-4 py-3 text-left font-semibold">{t('register_headers.duration')}</th>
                                        <th className="px-4 py-3 text-left font-semibold">{t('register_headers.provider')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {registerRows.map((row) => (
                                        <tr key={row.name} className="border-t border-kode01-noir/10 align-top">
                                            <td className="px-4 py-3 font-mono text-xs text-kode01-noir">{row.name}</td>
                                            <td className="px-4 py-3 text-kode01-noir/80">{row.category}</td>
                                            <td className="px-4 py-3 text-kode01-noir/80">{row.purpose}</td>
                                            <td className="px-4 py-3 text-kode01-noir/80">{row.duration}</td>
                                            <td className="px-4 py-3 text-kode01-noir/80">{row.provider}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>
                </div>
            </LegalContent>
        </LegalPageLayout>
    );
}

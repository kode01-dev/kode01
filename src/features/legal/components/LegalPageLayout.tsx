'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ChevronRight } from 'lucide-react';

import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';

interface LegalPageLayoutProps {
    title: string;
    children: React.ReactNode;
}

export function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
    const t = useTranslations('artifacts_home.header');

    return (
        <div className="min-h-screen bg-kode01-cream flex flex-col">
            <BaseHeader />
            <div className="flex-1 py-24 sm:py-32">
                <div className="max-w-5xl mx-auto px-5 sm:px-6">
                    {/* Breadcrumbs */}
                    <nav className="inline-flex items-center gap-2 rounded-full border border-kode01-noir/10 bg-white/80 px-4 py-2 text-sm font-medium text-kode01-noir/55 mb-10">
                        <Link href="/" className="hover:text-kode01-noir transition-colors no-underline">
                            {t('logo')}
                        </Link>
                        <ChevronRight size={14} />
                        <span className="text-kode01-noir/80 truncate max-w-[14rem] sm:max-w-none">{title}</span>
                    </nav>

                    {/* Page Title */}
                    <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl font-black text-kode01-noir mb-10 sm:mb-14 tracking-tight leading-[1.05]">
                        {title}
                    </h1>

                    {/* Content Container */}
                    <div className="bg-white rounded-[28px] p-6 sm:p-8 md:p-12 lg:p-14 shadow-[0_14px_36px_rgba(0,0,0,0.06)] border border-kode01-noir/10">
                        {children}
                    </div>
                </div>
            </div>
            <BaseFooter />
        </div>
    );
}

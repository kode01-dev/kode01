'use client';

import React, { useMemo, useState } from 'react';
import { AuthModal } from '@/features/auth/components/AuthModal';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/i18n/routing';
import type { HomepageSectionConfig } from '@/features/homepage-layout/types';
import type { HomeStatsData } from '@/features/homepage/lib/homepage-data-server';
import {
    HOMEPAGE_INLINE_STYLES,
    renderHomepageSection,
} from '@/features/homepage/components/HomePageSections';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';
import type { HomepageTopDealItem } from '@/features/homepage-layout/types';
import type { HomeProductsApiItem } from '@/features/homepage/components/homepage-sections/sections/ProductsSection';

interface HomePageClientProps {
    header: React.ReactNode;
    footer: React.ReactNode;
    sections: HomepageSectionConfig[];
    initialData?: {
        stats?: HomeStatsData;
        products?: HomeProductsApiItem[];
        topDeals?: HomepageTopDealItem[];
    };
}

export default function HomePageClient({ header, footer, sections, initialData }: HomePageClientProps) {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    const [authModalOpen, setAuthModalOpen] = useState(false);

    const sortedEnabledSections = useMemo(
        () =>
            [...sections]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .filter((section) => section.enabled),
        [sections],
    );

    const handleStartSelling = () => {
        if (isAuthenticated) {
            router.push('/vendor');
        } else {
            setAuthModalOpen(true);
        }
    };

    const handleBrowseMarketplace = () => {
        router.push(PUBLIC_MARKETPLACE_ENABLED ? '/market' : '/news');
    };



    return (
        <>
            <style>{HOMEPAGE_INLINE_STYLES}</style>
            <div className="artifacts-page">
                <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
                    {header}
                </div>
                {sortedEnabledSections.map((section, index) => {
                    const sectionKey = section.id
                        ? `${section.type}-${section.id}-${index}`
                        : `${section.type}-${section.order}-${index}`;
                    const node = renderHomepageSection({
                        section,
                        onOpenShop: handleStartSelling,
                        onBrowse: handleBrowseMarketplace,
                        initialData,
                    });
                    if (!node) return null;

                    const content = node;

                    if (section.type === 'marquee') {
                        return <React.Fragment key={sectionKey}>{content}</React.Fragment>;
                    }

                    return (
                        <div key={sectionKey} style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
                            {content}
                        </div>
                    );
                })}
                {footer}

                <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
                    <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
                </div>
            </div>
        </>
    );
}

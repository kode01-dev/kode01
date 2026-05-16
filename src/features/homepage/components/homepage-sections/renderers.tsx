'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { MarketingGridSkeleton } from '@/components/skeletons';
import type { HomepageSectionConfig, HomepageTopDealItem } from '@/features/homepage-layout/types';
import type { HomeStatsData } from '@/features/homepage/lib/homepage-data-server';
import type { HomeProductsApiItem } from './sections/ProductsSection';

// Above the fold - Eager
import { HeroSection } from './sections/HeroSection';

// Below the fold or low priority - Dynamic
const CtaSection = dynamic(() => import('./sections/CtaSection').then(mod => mod.CtaSection));
const FeaturesSection = dynamic(() => import('./sections/FeaturesSection').then(mod => mod.FeaturesSection));
const MarqueeSection = dynamic(() => import('./sections/MarqueeSection').then(mod => mod.MarqueeSection));
const NewsPreviewSection = dynamic(() => import('./sections/NewsPreviewSection').then(mod => mod.NewsPreviewSection));
const ProductsSection = dynamic(() => import('./sections/ProductsSection').then(mod => mod.ProductsSection));
const StatsBarSection = dynamic(() => import('./sections/StatsBarSection').then(mod => mod.StatsBarSection));
const TopDealsSection = dynamic(() => import('./sections/TopDealsSection').then(mod => mod.TopDealsSection));

const resolveSectionLimit = (settings: Record<string, unknown> | undefined, fallback: number, max: number) => {
    const value = Number(settings?.limit);
    if (!Number.isInteger(value)) return fallback;
    return Math.min(Math.max(value, 1), max);
};

export const renderHomepageLazySectionFallback = (section: HomepageSectionConfig) => {
    switch (section.type) {
        case 'products_latest':
        case 'top_deals':
            return <MarketingGridSkeleton withHero={false} withFilters={false} showResultsHeader={false} cardVariant="product" cards={resolveSectionLimit(section.settings, 4, 12)} className="mb-24" />;
        case 'news_latest':
            return <MarketingGridSkeleton withHero={false} withFilters={false} showResultsHeader={false} cardVariant="news" cards={resolveSectionLimit(section.settings, 3, 12)} className="mb-24" />;
        case 'stats':
            return (
                <section className="bg-[#2B463C] rounded-[32px] p-8 md:p-16 grid grid-cols-1 md:grid-cols-5 gap-10 text-center mb-16 md:mb-24">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="space-y-3">
                            <div className="mx-auto h-12 w-28 rounded-2xl bg-white/15" />
                            <div className="mx-auto h-4 w-24 rounded-full bg-white/20" />
                        </div>
                    ))}
                </section>
            );
        default:
            return null;
    }
};

interface RenderHomepageSectionOptions {
    section: HomepageSectionConfig;
    onOpenShop: () => void;
    onBrowse: () => void;
    initialData?: {
        stats?: HomeStatsData;
        products?: HomeProductsApiItem[];
        topDeals?: HomepageTopDealItem[];
    };
}

export const renderHomepageSection = ({ section, onOpenShop, onBrowse, initialData }: RenderHomepageSectionOptions) => {
    switch (section.type) {
        case 'hero':
            return <HeroSection template={section.template} content={section.content} initialStats={initialData?.stats} />;
        case 'marquee':
            return <MarqueeSection template={section.template} />;
        case 'features':
            return <FeaturesSection template={section.template} onOpenShop={onOpenShop} onBrowse={onBrowse} />;
        case 'products_latest':
            return <div id="products-section"><ProductsSection template={section.template} content={section.content} settings={section.settings} initialProducts={initialData?.products} /></div>;
        case 'top_deals':
            return <TopDealsSection template={section.template} content={section.content} settings={section.settings} initialTopDeals={initialData?.topDeals} />;
        case 'news_latest':
            return <NewsPreviewSection template={section.template} content={section.content} settings={section.settings} />;
        case 'stats':
            return <StatsBarSection template={section.template} initialStats={initialData?.stats} />;
        case 'cta':
            return <CtaSection template={section.template} content={section.content} />;
        default:
            return null;
    }
};

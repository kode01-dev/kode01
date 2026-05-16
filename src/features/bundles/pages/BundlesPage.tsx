'use client';

import { useRouter } from '@/navigation';
import { LayoutGrid, PackageOpen, RectangleVertical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { MarketingGridSkeleton } from '@/components/skeletons';
import { BundleCard, BundleProduct } from '../components/BundleCard';

export function BundlesPage() {
    const [bundles, setBundles] = useState<BundleProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
    const router = useRouter();
    const locale = useLocale();

    function getErrorMessage(error: unknown): string {
        if (error instanceof Error && error.message) return error.message;
        if (typeof error === 'string' && error.trim().length > 0) return error;
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    useEffect(() => {
        let isMounted = true;
        const fetchBundles = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/bundles', { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`Failed to fetch bundles (${response.status})`);
                }

                const payload = await response.json() as { items?: BundleProduct[] };
                if (!isMounted) return;
                setBundles(payload.items ?? []);
            } catch (err: unknown) {
                console.error('Error fetching bundles:', getErrorMessage(err));
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchBundles();
        return () => { isMounted = false; };
    }, []);

    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <BaseHeader />

            <main className="flex-1 pt-32">
                <div className="max-w-[1440px] mx-auto px-6 md:px-12">
                    {/* Hero */}
                    <section className="py-20 text-center relative">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-blue rounded-full opacity-20 blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-pink rounded-full opacity-10 blur-3xl pointer-events-none" />

                        <h1 className="text-[clamp(3rem,8vw,5rem)] font-serif font-black tracking-tight leading-[0.9] text-kode01-noir mb-6">
                            curated packs <br />for creatives
                        </h1>
                        <p className="text-lg md:text-xl font-medium text-kode01-noir/60 max-w-[600px] mx-auto font-sans leading-relaxed">
                            Discover premium bundles that combine our best digital assets. Save time and money with hand-picked collections.
                        </p>
                    </section>

                    {/* Content */}
                    <div className="pb-24 max-w-5xl mx-auto">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-kode01-noir/40 font-bold text-sm uppercase tracking-widest">
                                Found <span className="text-kode01-noir">{bundles.length}</span> bundles
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-kode01-noir text-white' : 'text-kode01-noir/40 hover:bg-black/5'}`}
                                >
                                    <LayoutGrid size={18} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-kode01-noir text-white' : 'text-kode01-noir/40 hover:bg-black/5'}`}
                                >
                                    <RectangleVertical size={18} />
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <MarketingGridSkeleton
                                withHero={false}
                                withFilters={false}
                                showResultsHeader={false}
                                cardVariant="bundle"
                                cards={3}
                            />
                        ) : bundles.length > 0 ? (
                            <div className={`grid ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-8`}>
                                {bundles.map((bundle) => (
                                    <BundleCard
                                        key={bundle.id}
                                        bundle={bundle}
                                        locale={locale}
                                        onClick={() => router.push(`/bundles/${bundle.slug || bundle.id}`)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="py-24 bg-white/50 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                                    <PackageOpen size={28} className="text-kode01-blue" />
                                </div>
                                <h3 className="text-2xl font-serif font-black text-kode01-noir mb-3">
                                    No bundles available
                                </h3>
                                <p className="text-kode01-noir/40 font-medium max-w-sm mx-auto mb-10 text-base">
                                    We are curating collections right now. Check back soon for exclusive packs!
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <BaseFooter />
        </div>
    );
}

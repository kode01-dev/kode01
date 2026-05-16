'use client';

import { useEffect, useState } from 'react';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { MarketingGridSkeleton } from '@/components/skeletons';
import { CreatorCard, Creator } from '../components/CreatorCard';
import { Users } from 'lucide-react';

interface CreatorsPageProps {
    locale: string;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim().length > 0) return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export function CreatorsPage({ locale }: CreatorsPageProps) {
    const [creators, setCreators] = useState<Creator[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const fetchCreators = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/creators', { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`Failed to fetch creators (${response.status})`);
                }

                const payload = await response.json() as { items?: Creator[] };
                if (isMounted) setCreators(payload.items ?? []);
            } catch (err) {
                console.error('Error fetching creators:', getErrorMessage(err));
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchCreators();
        return () => { isMounted = false; };
    }, []);

    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <BaseHeader />

            <main className="flex-1 pt-32">
                <div className="max-w-[1440px] mx-auto px-6 md:px-12">
                    {/* Hero Section */}
                    <section className="py-20 text-center relative">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-blue rounded-full opacity-20 blur-3xl pointer-events-none" />
                        <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-pink rounded-full opacity-10 blur-3xl pointer-events-none" />

                        <h1 className="text-[clamp(3rem,8vw,5rem)] font-serif font-black tracking-tight leading-[0.9] text-kode01-noir mb-6">
                            discover talented<br />creators
                        </h1>
                        <p className="text-lg md:text-xl font-medium text-kode01-noir/60 max-w-[600px] mx-auto font-sans leading-relaxed">
                            Explore our community of creative professionals offering premium digital assets and services.
                        </p>
                    </section>

                    {/* Content */}
                    <div className="pb-24 max-w-6xl mx-auto">
                        {loading ? (
                            <MarketingGridSkeleton
                                withHero={false}
                                withFilters={false}
                                showResultsHeader={false}
                                cardVariant="creator"
                                cards={6}
                            />
                        ) : creators.length > 0 ? (
                            <>
                                <div className="mb-10">
                                    <h2 className="text-kode01-noir/40 font-bold text-sm uppercase tracking-widest">
                                        Found <span className="text-kode01-noir">{creators.length}</span> {creators.length === 1 ? 'creator' : 'creators'}
                                    </h2>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {creators.map(creator => (
                                        <CreatorCard key={creator.id} creator={creator} locale={locale} />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-24 border-2 border-dashed border-kode01-noir/10 rounded-[32px] bg-white/50">
                                <div className="w-16 h-16 bg-kode01-cream rounded-full flex items-center justify-center mb-6 mx-auto">
                                    <Users className="w-8 h-8 text-kode01-pink" />
                                </div>
                                <p className="text-xl text-kode01-noir/40 font-medium">No creators found at the moment.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <BaseFooter />
        </div>
    );
}

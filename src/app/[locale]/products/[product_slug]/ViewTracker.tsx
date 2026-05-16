'use client';

import { useEffect } from 'react';
import { extractKeywordTokens } from '@/features/recommendations/lib/keywords';
import { getAcceptedCategoriesFromBrowserCookie } from '@/features/cookies/lib/consent';

export function ViewTracker({ slug, signalKeywords = [] }: { slug: string; signalKeywords?: string[] }) {
    useEffect(() => {
        const accepted = getAcceptedCategoriesFromBrowserCookie();
        if (!accepted.includes('analytics')) return;

        const today = new Date().toISOString().slice(0, 10);
        const storageKey = `view-tracked:${slug}:${today}`;
        const recommendationViewKey = `reco-view-tracked:product:${slug}:${today}`;

        if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) {
            // Continue to recommendation event tracking if needed.
        } else {
            const trackProductView = async () => {
                try {
                    await fetch(`/api/products/${slug}/view`, { method: 'POST' });
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(storageKey, '1');
                    }
                } catch (error) {
                    console.error('Failed to track product view:', error);
                }
            };

            void trackProductView();
        }

        if (typeof window !== 'undefined' && window.localStorage.getItem(recommendationViewKey)) {
            return;
        }

        const trackRecommendationView = async () => {
            try {
                await fetch('/api/recommendations/event', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        eventType: 'product_view',
                        sourceType: 'product',
                        sourceSlug: slug,
                        signalPayload: {
                            keywords: extractKeywordTokens(signalKeywords),
                        },
                    }),
                });

                if (typeof window !== 'undefined') {
                    window.localStorage.setItem(recommendationViewKey, '1');
                }
            } catch (error) {
                console.error('Failed to track recommendation product view:', error);
            }
        };

        void trackRecommendationView();
    }, [signalKeywords, slug]);

    return null;
}

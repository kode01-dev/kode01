'use client';

import { Refine } from '@refinedev/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { AbandonedCartBanner } from '@/components/cart/AbandonedCartBanner';
import { MarketingProvider } from '@/features/marketing/components/MarketingProvider';
import { OnboardingProvider } from '@/features/onboarding/components/OnboardingProvider';
import { ZipchatController } from '@/components/zipchat/ZipchatController';
import { SiteLockscreenGate } from '@/features/site-lockscreen/components/SiteLockscreenGate';
import type { LockscreenConfig } from '@/features/site-lockscreen/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MARKET_TAXONOMY_RESOURCES, marketTaxonomyDataProvider } from '@/lib/refine/market-taxonomy-data-provider';
import { Toaster } from 'sonner';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { CartProvider } from '@/features/cart/CartProvider';

interface ProvidersProps {
    children: React.ReactNode;
    lockscreenInitialState?: {
        locked: boolean;
        config: LockscreenConfig | null;
    };
}

export default function Providers({ children, lockscreenInitialState }: ProvidersProps) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 2 * 60 * 1000, // 2 minutes
                        gcTime: 10 * 60 * 1000, // 10 minutes
                        refetchOnWindowFocus: false,
                        refetchOnReconnect: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            <Refine
                dataProvider={marketTaxonomyDataProvider}
                resources={MARKET_TAXONOMY_RESOURCES}
                options={{ disableTelemetry: true }}
            >
                <NuqsAdapter>
                    <TooltipProvider>
                        <AuthProvider>
                            <CartProvider>
                                <SiteLockscreenGate initialState={lockscreenInitialState}>
                                    {children}
                                    <OnboardingProvider />
                                    <AbandonedCartBanner />
                                    <MarketingProvider />
                                    <ZipchatController />
                                    <Toaster
                                        position="bottom-right"
                                        toastOptions={{
                                            className: 'font-sans',
                                            style: {
                                                borderRadius: '16px',
                                                fontSize: '14px',
                                            },
                                        }}
                                    />
                                </SiteLockscreenGate>
                            </CartProvider>
                        </AuthProvider>
                    </TooltipProvider>
                </NuqsAdapter>
            </Refine>
        </QueryClientProvider>
    );
}

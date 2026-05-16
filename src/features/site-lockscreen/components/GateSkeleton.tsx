'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePathname } from '@/i18n/routing';
import Image from 'next/image';

/**
 * Shared Header Skeleton - Replicates the BaseHeader structure.
 */
function HeaderSkeleton() {
    return (
        <header className="py-8 px-8 max-w-[1440px] mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-12 flex-1">
                <div className="opacity-10">
                    <Image
                        src="/logo_v2.png"
                        alt="KODE01"
                        width={130}
                        height={35}
                        priority
                    />
                </div>
                <div className="hidden md:flex gap-10">
                    <Skeleton variant="text" tone="muted" className="h-4 w-16 opacity-30" />
                    <Skeleton variant="text" tone="muted" className="h-4 w-16 opacity-30" />
                    <Skeleton variant="text" tone="muted" className="h-4 w-16 opacity-30" />
                </div>
            </div>
            <div className="flex items-center gap-4">
                <Skeleton variant="chip" tone="muted" className="h-10 w-10 border border-black/5 opacity-40 shadow-sm" />
                <Skeleton variant="chip" tone="muted" className="h-10 w-32 border border-black/5 opacity-40 shadow-sm" />
            </div>
        </header>
    );
}

/**
 * 1. Home Skeleton - Mirrors the Hero and Marquee sections.
 */
function HomeSkeleton() {
    return (
        <div className="animate-in fade-in duration-700">
            <section className="py-24 text-center px-6 relative overflow-hidden">
                <div className="max-w-[760px] mx-auto space-y-10 relative z-10">
                    <div className="space-y-4">
                        <Skeleton variant="text" tone="cream" className="h-16 w-full rounded-2xl" />
                        <Skeleton variant="text" tone="cream" className="h-16 w-3/4 mx-auto rounded-2xl" />
                    </div>
                    <Skeleton variant="text" tone="cream" className="h-6 w-2/3 mx-auto rounded-xl opacity-60" />
                    <div className="flex flex-wrap justify-center gap-4 pt-4">
                        <Skeleton variant="chip" tone="cream" className="h-[52px] w-48 rounded-full border border-black/5 shadow-sm" />
                        <Skeleton variant="chip" tone="cream" className="h-[52px] w-48 rounded-full border border-black/10 shadow-sm bg-white" />
                    </div>
                </div>
            </section>
            <section className="py-8 bg-white/50 border-y border-black/5">
                <Skeleton variant="surface" tone="cream" className="h-12 w-full rounded-none opacity-40" />
            </section>
        </div>
    );
}

/**
 * 2. Market Skeleton - Mirrors the marketplace list view.
 */
function MarketSkeleton() {
    return (
        <div className="max-w-[1280px] mx-auto w-full px-6 py-12 space-y-12 animate-in fade-in duration-700">
             <div className="space-y-4">
                <Skeleton variant="text" tone="muted" className="h-12 w-1/3 rounded-2xl" />
                <Skeleton variant="text" tone="muted" className="h-4 w-1/4 rounded-lg opacity-60" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-4">
                <Skeleton variant="surface" tone="cream" className="h-[54px] rounded-full" />
                <Skeleton variant="surface" tone="cream" className="h-[54px] rounded-full" />
                <Skeleton variant="chip" tone="cream" className="h-[50px] rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="surface" tone="white" className="h-80 rounded-[28px] border border-black/5 shadow-sm" />
                ))}
            </div>
        </div>
    );
}

/**
 * 3. Default Skeleton - Generic structure for other pages.
 */
function DefaultSkeleton() {
    return (
        <div className="max-w-[1280px] mx-auto w-full px-6 py-20 space-y-8 animate-in fade-in duration-700">
            <Skeleton variant="text" tone="muted" className="h-14 w-1/2 rounded-2xl" />
            <div className="space-y-4">
                <Skeleton variant="text" tone="muted" className="h-4 w-full rounded-lg opacity-40" />
                <Skeleton variant="text" tone="muted" className="h-4 w-11/12 rounded-lg opacity-40" />
                <Skeleton variant="text" tone="muted" className="h-4 w-4/5 rounded-lg opacity-40" />
            </div>
             <Skeleton variant="surface" tone="white" className="h-64 w-full rounded-[32px] border border-black/5" />
        </div>
    );
}

/**
 * GateSkeleton - Detects the current route and displays a mirrored skeleton.
 */
export function GateSkeleton() {
  const pathname = usePathname();
  
  // Detection logic
  const isMarket = pathname.startsWith('/market') || pathname.startsWith('/search');
  const isHome = pathname === '/' || pathname === '';

  let content;
  if (isHome) {
      content = <HomeSkeleton />;
  } else if (isMarket) {
      content = <MarketSkeleton />;
  } else {
      content = <DefaultSkeleton />;
  }

  return (
    <div className="fixed inset-0 bg-[#fcfaf7] flex flex-col z-[9999] overflow-y-auto overflow-x-hidden">
      <HeaderSkeleton />
      <main className="flex-1">
        {content}
      </main>
    </div>
  );
}

'use client';

import type React from 'react';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface BaseHeaderMobileSearchOverlayProps {
    isSearchOpen: boolean;
    useSolidHeaderStyle: boolean;
    mobileSearchRef: React.RefObject<HTMLDivElement | null>;
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    onSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function BaseHeaderMobileSearchOverlay({
    isSearchOpen,
    useSolidHeaderStyle,
    mobileSearchRef,
    searchQuery,
    setSearchQuery,
    onSearchSubmit,
}: BaseHeaderMobileSearchOverlayProps) {
    const t = useTranslations('layout');

    if (!isSearchOpen) return null;

    return (
        <div
            ref={mobileSearchRef}
            className="absolute top-full left-0 right-0 mt-4 px-4 xl:hidden animate-in fade-in slide-in-from-top-4 z-50"
        >
            <div className={cn(
                "border rounded-full p-2 flex items-center shadow-2xl",
                useSolidHeaderStyle ? "bg-kode01-noir border-white/10 text-white" : "bg-white border-black/10 text-kode01-noir",
            )}>
                <form onSubmit={onSearchSubmit} className="w-full flex items-center">
                    <Search className={cn("ml-4", useSolidHeaderStyle ? "text-white/40" : "text-kode01-noir/40")} size={20} />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('search.placeholder')}
                        className="w-full bg-transparent py-3 px-4 text-base focus:outline-none placeholder:opacity-50"
                    />
                </form>
            </div>
        </div>
    );
}

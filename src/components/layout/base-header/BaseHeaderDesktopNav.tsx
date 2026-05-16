'use client';

import type React from 'react';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { desktopLinks } from './constants';
import { buildCategoryHref, buildSubcategoryHref } from './headerNavigation';
import type {
    ProductCategoryMenuRow,
    ProductSubcategoryMenuRow,
    TaxonomyLabelItem,
} from './types';

interface BaseHeaderDesktopNavProps {
    useSolidHeaderStyle: boolean;
    isSearchOpen: boolean;
    showSearchIcon: boolean;
    isDesktopExploreOpen: boolean;
    setIsDesktopExploreOpen: React.Dispatch<React.SetStateAction<boolean>>;
    searchRef: React.RefObject<HTMLFormElement | null>;
    searchQuery: string;
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    onSearchOpen: () => void;
    onSearchClose: () => void;
    onSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    menuCategories: ProductCategoryMenuRow[];
    subcategoriesByCategoryId: Map<string, ProductSubcategoryMenuRow[]>;
    getLocalizedTaxonomyLabel: (item: TaxonomyLabelItem) => string;
    preventRedundantNavigation: (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function BaseHeaderDesktopNav({
    useSolidHeaderStyle,
    isSearchOpen,
    showSearchIcon,
    isDesktopExploreOpen,
    setIsDesktopExploreOpen,
    searchRef,
    searchQuery,
    setSearchQuery,
    onSearchOpen,
    onSearchClose,
    onSearchSubmit,
    menuCategories,
    subcategoriesByCategoryId,
    getLocalizedTaxonomyLabel,
    preventRedundantNavigation,
}: BaseHeaderDesktopNavProps) {
    const t = useTranslations('layout');

    return (
        <div className="hidden xl:flex items-center gap-10 flex-1 justify-center">
            {!isSearchOpen ? (
                <>
                    <DropdownMenu
                        modal={false}
                        open={isDesktopExploreOpen}
                        onOpenChange={setIsDesktopExploreOpen}
                    >
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    "font-bold text-sm transition-all no-underline font-sans inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer",
                                    useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                                )}
                            >
                                <span>{t('nav.explore')}</span>
                                <ChevronDown size={16} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="center"
                            className="w-[320px] max-h-[70vh] overflow-y-auto rounded-2xl border-black/10 bg-white p-2 shadow-2xl"
                        >
                            <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5">
                                <Link
                                    href="/market"
                                    prefetch={false}
                                    onClick={preventRedundantNavigation('/market')}
                                    className="w-full no-underline font-bold text-sm text-kode01-noir/90 hover:text-kode01-noir"
                                >
                                    {t('nav.explore')}
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5">
                                <Link
                                    href="/bundles"
                                    prefetch={false}
                                    onClick={preventRedundantNavigation('/bundles')}
                                    className="w-full no-underline font-bold text-sm text-kode01-noir/90 hover:text-kode01-noir"
                                >
                                    {t('nav.bundles')}
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5">
                                <Link
                                    href="/creators"
                                    prefetch={false}
                                    onClick={preventRedundantNavigation('/creators')}
                                    className="w-full no-underline font-bold text-sm text-kode01-noir/90 hover:text-kode01-noir"
                                >
                                    {t('nav.creators')}
                                </Link>
                            </DropdownMenuItem>
                            {menuCategories.map((category) => {
                                const subcategories = subcategoriesByCategoryId.get(category.id) ?? [];
                                const categoryHref = buildCategoryHref(category.slug);
                                return (
                                    <div key={category.id} className="mb-1 last:mb-0">
                                        <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5">
                                            <Link
                                                href={categoryHref}
                                                prefetch={false}
                                                onClick={preventRedundantNavigation(categoryHref)}
                                                className="w-full no-underline font-bold text-sm text-kode01-noir/90 hover:text-kode01-noir"
                                            >
                                                {getLocalizedTaxonomyLabel(category)}
                                            </Link>
                                        </DropdownMenuItem>
                                        {subcategories.map((subcategory) => {
                                            const subcategoryHref = buildSubcategoryHref(category.slug, subcategory.slug);
                                            return (
                                                <DropdownMenuItem key={subcategory.id} asChild className="rounded-xl px-3 py-2">
                                                    <Link
                                                        href={subcategoryHref}
                                                        prefetch={false}
                                                        onClick={preventRedundantNavigation(subcategoryHref)}
                                                        className="w-full no-underline text-xs font-medium text-kode01-noir/70 hover:text-kode01-noir pl-4"
                                                    >
                                                        {getLocalizedTaxonomyLabel(subcategory)}
                                                    </Link>
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {desktopLinks.map((link) => (
                        <Link
                            key={link.id}
                            href={link.href}
                            className={cn(
                                "font-bold text-sm transition-all no-underline font-sans",
                                ('accent' in link && link.accent)
                                    ? "text-kode01-pink hover:text-kode01-pink/80"
                                    : useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                            )}
                        >
                            {t(`nav.${link.id}`)}
                        </Link>
                    ))}

                    {showSearchIcon && (
                        <button
                            onClick={onSearchOpen}
                            className={cn(
                                "p-2 transition-colors cursor-pointer bg-transparent border-none",
                                useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                            )}
                            aria-label={t('search.open')}
                        >
                            <Search size={20} />
                        </button>
                    )}
                </>
            ) : (
                <form
                    ref={searchRef}
                    onSubmit={onSearchSubmit}
                    className="w-full max-w-xl animate-in fade-in slide-in-from-right-4 duration-300 flex items-center gap-3"
                >
                    <div className="relative w-full">
                        <Search className={cn(
                            "absolute left-4 top-1/2 -translate-y-1/2",
                            useSolidHeaderStyle ? "text-white/40" : "text-kode01-noir/40",
                        )} size={18} />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={t('search.placeholder')}
                            className={cn(
                                "w-full border rounded-full py-2.5 pl-12 pr-4 text-sm focus:outline-none transition-colors",
                                useSolidHeaderStyle
                                    ? "bg-white/10 border-white/20 focus:border-kode01-pink/50 text-white"
                                    : "bg-black/5 border-black/10 focus:border-kode01-pink/50 text-kode01-noir placeholder:text-kode01-noir/40",
                            )}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onSearchClose}
                        className={cn(
                            "p-2 cursor-pointer bg-transparent border-none",
                            useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                        )}
                    >
                        <X size={20} />
                    </button>
                </form>
            )}
        </div>
    );
}

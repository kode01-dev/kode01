'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { LogIn, Menu, Search, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import dynamic from 'next/dynamic';
import { logoutAction } from '@/features/auth/actions/auth-actions';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useBodyScrollLock } from '@/lib/ui/useBodyScrollLock';

const CartMenu = dynamic(() => import('@/components/cart/CartMenu').then(mod => mod.CartMenu), { ssr: false });
const LanguageSwitcher = dynamic(() => import('@/components/layout/LanguageSwitcher').then(mod => mod.LanguageSwitcher), { ssr: false });
const AuthModal = dynamic(() => import('@/features/auth/components/AuthModal').then(mod => mod.AuthModal), { ssr: false });
const UserMenu = dynamic(() => import('@/features/auth/components/UserMenu').then(mod => mod.UserMenu), { ssr: false });

import { BaseHeaderDesktopNav } from './base-header/BaseHeaderDesktopNav';
import { BaseHeaderMobileMenu } from './base-header/BaseHeaderMobileMenu';
import { BaseHeaderMobileSearchOverlay } from './base-header/BaseHeaderMobileSearchOverlay';
import { useHeaderMenuData } from './base-header/useHeaderMenuData';
import { useHeaderNavigationGuard } from './base-header/headerNavigation';
import type { TaxonomyLabelItem } from './base-header/types';
import type { LanguageSwitcherLocalePathnames } from '@/components/layout/LanguageSwitcher';

interface BaseHeaderProps {
    hideSearchOnTop?: boolean;
    localePathnames?: LanguageSwitcherLocalePathnames;
}

export function BaseHeader({ hideSearchOnTop = false, localePathnames }: BaseHeaderProps = {}) {
    const t = useTranslations('layout');
    const locale = useLocale();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamsKey = searchParams?.toString() ?? '';
    const searchParamQuery = searchParams?.get('q') ?? '';
    const { user, profile, isAuthenticated, loading, refreshAuth } = useAuth();
    const router = useRouter();

    const [isScrolled, setIsScrolled] = useState(false);
    const showSearchIcon = !hideSearchOnTop || isScrolled;

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileExploreOpen, setIsMobileExploreOpen] = useState(false);
    const [isDesktopExploreOpen, setIsDesktopExploreOpen] = useState(false);
    const [expandedMobileCategoryIds, setExpandedMobileCategoryIds] = useState<string[]>([]);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
    const [mobileLoggingOut, setMobileLoggingOut] = useState(false);
    const searchRef = useRef<HTMLFormElement>(null);
    const mobileSearchRef = useRef<HTMLDivElement>(null);
    const navRef = useRef<HTMLElement>(null);

    const { menuCategories, subcategoriesByCategoryId } = useHeaderMenuData();
    const { preventRedundantNavigation } = useHeaderNavigationGuard({ pathname, searchParams });

    useBodyScrollLock(isMobileMenuOpen);

    useEffect(() => {
        const handleScroll = () => {
            const nextIsScrolled = window.scrollY > 20;
            setIsScrolled((current) => (current === nextIsScrolled ? current : nextIsScrolled));
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const isOutsideDesktop = !searchRef.current || !searchRef.current.contains(event.target as Node);
            const isOutsideMobile = !mobileSearchRef.current || !mobileSearchRef.current.contains(event.target as Node);

            if (isOutsideDesktop && isOutsideMobile) {
                setIsSearchOpen(false);
            }
        };
        if (isSearchOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isSearchOpen]);

    useEffect(() => {
        setIsDesktopExploreOpen(false);
    }, [pathname, searchParamsKey]);

    useEffect(() => {
        setSearchQuery(searchParamQuery);
    }, [searchParamQuery]);

    const getLocalizedTaxonomyLabel = (item: TaxonomyLabelItem): string => {
        if (locale === 'fr') return item.name_fr || item.name_en || item.slug;
        return item.name_en || item.name_fr || item.slug;
    };

    const clearExpandedMobileCategories = () => {
        setExpandedMobileCategoryIds([]);
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
        setIsMobileExploreOpen(false);
        clearExpandedMobileCategories();
        setIsMobileProfileOpen(false);
    };

    const useSolidHeaderStyle = isScrolled;

    const toggleMobileCategory = (categoryId: string) => {
        setExpandedMobileCategoryIds((current) =>
            current.includes(categoryId)
                ? current.filter((id) => id !== categoryId)
                : [...current, categoryId],
        );
    };

    const handleHeaderSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;

        setIsSearchOpen(false);
        router.push(`/search?q=${encodeURIComponent(query)}`);
    };

    const handleMobileMenuToggle = () => {
        const nextOpen = !isMobileMenuOpen;
        setIsMobileMenuOpen(nextOpen);
        if (!nextOpen) {
            setIsMobileExploreOpen(false);
            clearExpandedMobileCategories();
        }
    };

    const handleMobileLogout = async () => {
        setMobileLoggingOut(true);
        await logoutAction();
        await refreshAuth();
        router.refresh();
    };

    return (
        <>
            <header className={cn(
                "fixed top-0 left-0 right-0 transition-all duration-500",
                isMobileMenuOpen ? "z-[2147483000]" : "z-50",
                useSolidHeaderStyle ? "py-4 px-3 sm:px-6" : "py-8 px-4 sm:px-8",
            )}>
                <div className="max-w-[1440px] mx-auto">
                    <nav ref={navRef} className={cn(
                        "flex justify-between items-center relative transition-all duration-300",
                        useSolidHeaderStyle
                            ? "bg-kode01-noir text-white rounded-full px-4 sm:px-8 py-3.5 sm:py-4 shadow-2xl backdrop-blur-md"
                            : "bg-transparent text-kode01-noir py-2",
                    )}>
                        <Link href="/" className={cn(
                            "no-underline group flex items-center shrink-0",
                            useSolidHeaderStyle ? "text-white" : "text-kode01-noir",
                        )}>
                            <Image
                                src="/logo_v2.png"
                                alt="KODE01"
                                width={130}
                                height={35}
                                className="px-1 transition-transform group-hover:scale-105"
                                priority
                            />
                        </Link>

                        <BaseHeaderDesktopNav
                            useSolidHeaderStyle={useSolidHeaderStyle}
                            isSearchOpen={isSearchOpen}
                            showSearchIcon={showSearchIcon}
                            isDesktopExploreOpen={isDesktopExploreOpen}
                            setIsDesktopExploreOpen={setIsDesktopExploreOpen}
                            searchRef={searchRef}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            onSearchOpen={() => setIsSearchOpen(true)}
                            onSearchClose={() => setIsSearchOpen(false)}
                            onSearchSubmit={handleHeaderSearchSubmit}
                            menuCategories={menuCategories}
                            subcategoriesByCategoryId={subcategoriesByCategoryId}
                            getLocalizedTaxonomyLabel={getLocalizedTaxonomyLabel}
                            preventRedundantNavigation={preventRedundantNavigation}
                        />

                        <div className="flex items-center gap-2 sm:gap-4 shrink-0 px-2">
                            {showSearchIcon && (
                                <button
                                    onClick={() => setIsSearchOpen(!isSearchOpen)}
                                    className={cn(
                                        "xl:hidden p-2 transition-colors cursor-pointer bg-transparent border-none",
                                        useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                                    )}
                                    aria-label={isSearchOpen ? t('search.close') : t('search.open')}
                                >
                                    {isSearchOpen ? <X size={24} /> : <Search size={24} />}
                                </button>
                            )}

                            <CartMenu iconClassName={cn(
                                "w-[24px] h-[24px] sm:w-[22px] sm:h-[22px] transition-colors",
                                useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                            )} />

                            <div className="hidden xl:block">
                                <LanguageSwitcher isScrolled={useSolidHeaderStyle} localePathnames={localePathnames} />
                            </div>

                            {!loading && (
                                isAuthenticated ? (
                                    <div className="hidden xl:block">
                                        <UserMenu />
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setAuthModalOpen(true)}
                                        className={cn(
                                            "hidden xl:flex px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-all border-none cursor-pointer font-sans items-center gap-2",
                                            useSolidHeaderStyle ? "bg-kode01-pink text-kode01-noir" : "bg-kode01-noir text-white",
                                        )}
                                    >
                                        <LogIn size={16} />
                                        <span>{t('nav.login')}</span>
                                    </button>
                                )
                            )}

                            <button
                                onClick={handleMobileMenuToggle}
                                className={cn(
                                    "xl:hidden p-2 rounded-full transition-colors z-[60] cursor-pointer bg-transparent border-none",
                                    useSolidHeaderStyle ? "text-white hover:bg-white/10" : "text-kode01-noir hover:bg-black/5",
                                )}
                                aria-label={t('nav.menu')}
                            >
                                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>

                        <BaseHeaderMobileSearchOverlay
                            isSearchOpen={isSearchOpen}
                            useSolidHeaderStyle={useSolidHeaderStyle}
                            mobileSearchRef={mobileSearchRef}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            onSearchSubmit={handleHeaderSearchSubmit}
                        />

                        <BaseHeaderMobileMenu
                            isMobileMenuOpen={isMobileMenuOpen}
                            useSolidHeaderStyle={useSolidHeaderStyle}
                            navRef={navRef}
                            isMobileExploreOpen={isMobileExploreOpen}
                            setIsMobileExploreOpen={setIsMobileExploreOpen}
                            expandedMobileCategoryIds={expandedMobileCategoryIds}
                            toggleMobileCategory={toggleMobileCategory}
                            clearExpandedMobileCategories={clearExpandedMobileCategories}
                            menuCategories={menuCategories}
                            subcategoriesByCategoryId={subcategoriesByCategoryId}
                            getLocalizedTaxonomyLabel={getLocalizedTaxonomyLabel}
                            preventRedundantNavigation={preventRedundantNavigation}
                            closeMobileMenu={closeMobileMenu}
                            isAuthenticated={isAuthenticated}
                            user={user}
                            profile={profile}
                            onOpenAuthModal={() => setAuthModalOpen(true)}
                            isMobileProfileOpen={isMobileProfileOpen}
                            setIsMobileProfileOpen={setIsMobileProfileOpen}
                            mobileLoggingOut={mobileLoggingOut}
                            onMobileLogout={handleMobileLogout}
                            localePathnames={localePathnames}
                        />
                    </nav>
                </div>
            </header>

            <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
        </>
    );
}

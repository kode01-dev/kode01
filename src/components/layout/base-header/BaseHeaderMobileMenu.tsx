'use client';

import type React from 'react';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Image from 'next/image';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
    ChevronDown,
    Cookie,
    LayoutDashboard,
    Loader2,
    LogOut,
    Settings,
} from 'lucide-react';

import { getDashboardOverviewHref } from '@/features/dashboard/lib/paths';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';
import type { LanguageSwitcherLocalePathnames } from '@/components/layout/LanguageSwitcher';

import { desktopLinks } from './constants';
import { buildCategoryHref, buildSubcategoryHref } from './headerNavigation';
import type {
    ProductCategoryMenuRow,
    ProductSubcategoryMenuRow,
    TaxonomyLabelItem,
} from './types';

type HeaderProfile = {
    role: 'buyer' | 'seller' | 'admin' | null;
    slug: string | null;
    display_name: string | null;
    shop_name: string | null;
    avatar_url: string | null;
};

interface BaseHeaderMobileMenuProps {
    isMobileMenuOpen: boolean;
    useSolidHeaderStyle: boolean;
    navRef: React.RefObject<HTMLElement | null>;
    isMobileExploreOpen: boolean;
    setIsMobileExploreOpen: React.Dispatch<React.SetStateAction<boolean>>;
    expandedMobileCategoryIds: string[];
    toggleMobileCategory: (categoryId: string) => void;
    clearExpandedMobileCategories: () => void;
    menuCategories: ProductCategoryMenuRow[];
    subcategoriesByCategoryId: Map<string, ProductSubcategoryMenuRow[]>;
    getLocalizedTaxonomyLabel: (item: TaxonomyLabelItem) => string;
    preventRedundantNavigation: (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => void;
    closeMobileMenu: () => void;
    isAuthenticated: boolean;
    user: User | null;
    profile: HeaderProfile | null;
    onOpenAuthModal: () => void;
    isMobileProfileOpen: boolean;
    setIsMobileProfileOpen: React.Dispatch<React.SetStateAction<boolean>>;
    mobileLoggingOut: boolean;
    onMobileLogout: () => Promise<void>;
    localePathnames?: LanguageSwitcherLocalePathnames;
}

function getDisplayName(profile: HeaderProfile | null, user: User | null): string {
    return profile?.display_name
        || profile?.shop_name
        || (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '')
        || user?.email?.split('@')[0]
        || 'User';
}

function getDashboardHref(profile: HeaderProfile | null): string {
    if (profile?.role === 'admin') {
        return getDashboardOverviewHref('admin', profile.slug);
    }
    if (profile?.role === 'seller') {
        return profile.slug ? getDashboardOverviewHref('vendor', profile.slug) : '/vendor';
    }
    if (profile?.role === 'buyer') {
        return profile.slug ? getDashboardOverviewHref('buyer', profile.slug) : '/buyer';
    }
    return '/dashboard';
}

export function BaseHeaderMobileMenu({
    isMobileMenuOpen,
    useSolidHeaderStyle,
    navRef,
    isMobileExploreOpen,
    setIsMobileExploreOpen,
    expandedMobileCategoryIds,
    toggleMobileCategory,
    clearExpandedMobileCategories,
    menuCategories,
    subcategoriesByCategoryId,
    getLocalizedTaxonomyLabel,
    preventRedundantNavigation,
    closeMobileMenu,
    isAuthenticated,
    user,
    profile,
    onOpenAuthModal,
    isMobileProfileOpen,
    setIsMobileProfileOpen,
    mobileLoggingOut,
    onMobileLogout,
    localePathnames,
}: BaseHeaderMobileMenuProps) {
    const t = useTranslations('layout');
    const tAuth = useTranslations('auth');
    const router = useRouter();
    const [menuStyle, setMenuStyle] = useState(() => ({
        top: useSolidHeaderStyle ? '80px' : '100px',
        maxHeight: 'calc(100dvh - 116px)',
    }));

    useEffect(() => {
        if (!isMobileMenuOpen) return;

        const updateMenuStyle = () => {
            const navElement = navRef.current;
            if (!navElement) {
                setMenuStyle({
                    top: useSolidHeaderStyle ? '80px' : '100px',
                    maxHeight: 'calc(100dvh - 116px)',
                });
                return;
            }

            const navBottom = navElement.getBoundingClientRect().bottom;
            setMenuStyle({
                top: `${navBottom + 16}px`,
                maxHeight: `calc(100dvh - ${navBottom + 32}px)`,
            });
        };

        updateMenuStyle();
        window.addEventListener('resize', updateMenuStyle);
        window.addEventListener('scroll', updateMenuStyle);
        return () => {
            window.removeEventListener('resize', updateMenuStyle);
            window.removeEventListener('scroll', updateMenuStyle);
        };
    }, [isMobileMenuOpen, navRef, useSolidHeaderStyle]);

    if (!isMobileMenuOpen) return null;

    const displayName = getDisplayName(profile, user);
    const initials = displayName.slice(0, 2).toUpperCase();
    const dashboardHref = getDashboardHref(profile);

    return (
        <div
            className={cn(
                "fixed left-4 right-4 rounded-[32px] p-6 flex flex-col gap-4 border xl:hidden animate-in fade-in slide-in-from-top-4 shadow-2xl overflow-y-auto overscroll-contain",
                useSolidHeaderStyle ? "bg-kode01-noir border-white/10 text-white" : "bg-white border-black/10 text-kode01-noir",
            )}
            style={{
                top: menuStyle.top,
                maxHeight: menuStyle.maxHeight,
            }}
        >
            {PUBLIC_MARKETPLACE_ENABLED ? (
                <button
                    onClick={() => {
                        setIsMobileExploreOpen((current) => {
                            const next = !current;
                            if (!next) {
                                clearExpandedMobileCategories();
                            }
                            return next;
                        });
                    }}
                    className={cn(
                        "font-bold text-lg py-3 px-2 rounded-xl border-b inline-flex items-center justify-between bg-transparent border-x-0 border-t-0 cursor-pointer transition-colors active:bg-kode01-pink active:text-kode01-noir",
                        useSolidHeaderStyle ? "text-white border-white/5" : "text-kode01-noir border-black/5",
                    )}
                >
                    <span>{t('nav.explore')}</span>
                    <ChevronDown className={cn("transition-transform", isMobileExploreOpen && "rotate-180")} size={18} />
                </button>
            ) : (
                <div
                    aria-disabled="true"
                    className={cn(
                        "font-bold text-lg py-3 px-2 rounded-xl border-b cursor-default",
                        useSolidHeaderStyle ? "text-white/35 border-white/5" : "text-kode01-noir/45 border-black/5",
                    )}
                >
                    {t('nav.marketplace_coming_soon')}
                </div>
            )}

            {PUBLIC_MARKETPLACE_ENABLED && isMobileExploreOpen && (
                <div className={cn(
                    "ml-2 pl-4 border-l flex flex-col gap-1",
                    useSolidHeaderStyle ? "border-white/10" : "border-black/10",
                )}>
                    <Link
                        href="/market"
                        prefetch={false}
                        onClick={(event) => {
                            preventRedundantNavigation('/market')(event);
                            if (!event.defaultPrevented) {
                                closeMobileMenu();
                            }
                        }}
                        className={cn(
                            "font-bold text-base py-2 px-2 rounded-xl no-underline block transition-colors active:bg-kode01-pink active:text-kode01-noir",
                            useSolidHeaderStyle ? "text-white hover:text-white" : "text-kode01-noir hover:text-kode01-noir",
                        )}
                    >
                        {t('nav.explore')}
                    </Link>
                    <Link
                        href="/bundles"
                        prefetch={false}
                        onClick={(event) => {
                            preventRedundantNavigation('/bundles')(event);
                            if (!event.defaultPrevented) {
                                closeMobileMenu();
                            }
                        }}
                        className={cn(
                            "font-bold text-base py-2 px-2 rounded-xl no-underline block transition-colors active:bg-kode01-pink active:text-kode01-noir",
                            useSolidHeaderStyle ? "text-white hover:text-white" : "text-kode01-noir hover:text-kode01-noir",
                        )}
                    >
                        {t('nav.bundles')}
                    </Link>
                    <Link
                        href="/creators"
                        prefetch={false}
                        onClick={(event) => {
                            preventRedundantNavigation('/creators')(event);
                            if (!event.defaultPrevented) {
                                closeMobileMenu();
                            }
                        }}
                        className={cn(
                            "font-bold text-base py-2 px-2 rounded-xl no-underline block transition-colors active:bg-kode01-pink active:text-kode01-noir",
                            useSolidHeaderStyle ? "text-white hover:text-white" : "text-kode01-noir hover:text-kode01-noir",
                        )}
                    >
                        {t('nav.creators')}
                    </Link>
                    {menuCategories.map((category) => {
                        const subcategories = subcategoriesByCategoryId.get(category.id) ?? [];
                        const categoryHref = buildCategoryHref(category.slug);
                        const isCategoryExpanded = expandedMobileCategoryIds.includes(category.id);
                        return (
                            <div key={category.id} className="py-1">
                                {subcategories.length > 0 ? (
                                    <>
                                        <button
                                            onClick={() => toggleMobileCategory(category.id)}
                                            className={cn(
                                                "w-full text-left font-bold text-base py-3 px-2 rounded-xl inline-flex items-center justify-between bg-transparent border-none cursor-pointer transition-colors active:bg-kode01-pink active:text-kode01-noir",
                                                useSolidHeaderStyle ? "text-white hover:text-white" : "text-kode01-noir hover:text-kode01-noir",
                                            )}
                                        >
                                            {getLocalizedTaxonomyLabel(category)}
                                            <ChevronDown
                                                className={cn("transition-transform", isCategoryExpanded && "rotate-180")}
                                                size={16}
                                            />
                                        </button>

                                        {isCategoryExpanded && (
                                            <div className="ml-2 pl-3 border-l border-current/15">
                                                <Link
                                                    href={categoryHref}
                                                    prefetch={false}
                                                    onClick={(event) => {
                                                        preventRedundantNavigation(categoryHref)(event);
                                                        if (!event.defaultPrevented) {
                                                            closeMobileMenu();
                                                        }
                                                    }}
                                                    className={cn(
                                                        "font-semibold text-sm py-2.5 px-3 rounded-lg no-underline block transition-colors active:bg-kode01-pink/20",
                                                        useSolidHeaderStyle ? "text-white hover:text-white" : "text-kode01-noir hover:text-kode01-noir",
                                                    )}
                                                >
                                                    {getLocalizedTaxonomyLabel(category)}
                                                </Link>
                                                {subcategories.map((subcategory) => {
                                                    const subcategoryHref = buildSubcategoryHref(category.slug, subcategory.slug);
                                                    return (
                                                        <Link
                                                            key={subcategory.id}
                                                            href={subcategoryHref}
                                                            prefetch={false}
                                                            onClick={(event) => {
                                                                preventRedundantNavigation(subcategoryHref)(event);
                                                                if (!event.defaultPrevented) {
                                                                    closeMobileMenu();
                                                                }
                                                            }}
                                                            className={cn(
                                                                "font-medium text-sm py-2.5 px-3 rounded-lg no-underline block pl-4 transition-colors active:bg-kode01-pink/10",
                                                                useSolidHeaderStyle ? "text-white/70 hover:text-white" : "text-kode01-noir/70 hover:text-kode01-noir",
                                                            )}
                                                        >
                                                            {getLocalizedTaxonomyLabel(subcategory)}
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <Link
                                        href={categoryHref}
                                        prefetch={false}
                                        onClick={(event) => {
                                            preventRedundantNavigation(categoryHref)(event);
                                            if (!event.defaultPrevented) {
                                                closeMobileMenu();
                                            }
                                        }}
                                        className={cn(
                                            "font-bold text-base py-3 px-2 rounded-xl no-underline block transition-colors active:bg-kode01-pink active:text-kode01-noir",
                                            useSolidHeaderStyle ? "text-white hover:text-white" : "text-kode01-noir hover:text-kode01-noir",
                                        )}
                                    >
                                        {getLocalizedTaxonomyLabel(category)}
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {desktopLinks.map((link) => (
                <Link
                    key={link.id}
                    href={link.href}
                    onClick={closeMobileMenu}
                    className={cn(
                        "font-bold text-lg py-3 px-2 rounded-xl no-underline border-b transition-colors active:bg-kode01-pink active:text-kode01-noir",
                        ('accent' in link && link.accent)
                            ? "text-kode01-pink border-black/5"
                            : useSolidHeaderStyle ? "text-white border-white/5" : "text-kode01-noir border-black/5",
                    )}
                >
                    {t(`nav.${link.id}`)}
                </Link>
            ))}

            {!isAuthenticated ? (
                <button
                    onClick={() => {
                        onOpenAuthModal();
                        closeMobileMenu();
                    }}
                    className={cn(
                        "py-3 rounded-2xl font-bold text-base border-none cursor-pointer mt-2",
                        useSolidHeaderStyle ? "bg-kode01-pink text-kode01-noir" : "bg-kode01-noir text-white",
                    )}
                >
                    {t('nav.login')}
                </button>
            ) : (
                <div className={cn(
                    "mt-3 pt-4 border-t flex flex-col",
                    useSolidHeaderStyle ? "border-white/10" : "border-black/5",
                )}>
                    <div className="flex items-center gap-3 px-1">
                        <button
                            onClick={() => setIsMobileProfileOpen(!isMobileProfileOpen)}
                            className="flex items-center gap-3 flex-1 min-w-0 bg-transparent border-none cursor-pointer p-0"
                        >
                            {profile?.avatar_url ? (
                                <Image
                                    src={profile.avatar_url}
                                    alt={displayName}
                                    width={40}
                                    height={40}
                                    className="w-10 h-10 rounded-full object-cover ring-2 ring-kode01-pink/30"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-kode01-pink flex items-center justify-center text-kode01-noir text-sm font-bold shrink-0">
                                    {initials}
                                </div>
                            )}
                            <div className="min-w-0 text-left">
                                <p className={cn(
                                    "font-bold text-sm truncate",
                                    useSolidHeaderStyle ? "text-white" : "text-kode01-noir",
                                )}>{displayName}</p>
                                <p className={cn(
                                    "text-xs truncate",
                                    useSolidHeaderStyle ? "text-white/40" : "text-kode01-noir/40",
                                )}>{user?.email}</p>
                            </div>
                            <ChevronDown
                                size={16}
                                className={cn(
                                    "shrink-0 transition-transform",
                                    isMobileProfileOpen && "rotate-180",
                                    useSolidHeaderStyle ? "text-white/40" : "text-kode01-noir/40",
                                )}
                            />
                        </button>
                        <button
                            onClick={async () => {
                                await onMobileLogout();
                            }}
                            disabled={mobileLoggingOut}
                            className={cn(
                                "shrink-0 p-2 rounded-full bg-transparent border-none cursor-pointer transition-colors disabled:opacity-60 disabled:pointer-events-none",
                                useSolidHeaderStyle ? "text-white/40 hover:text-red-400 hover:bg-white/5" : "text-kode01-noir/40 hover:text-red-500 hover:bg-black/5",
                            )}
                            aria-label={tAuth('logout')}
                        >
                            {mobileLoggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
                        </button>
                    </div>

                    {isMobileProfileOpen && (
                        <div className={cn(
                            "ml-2 pl-4 mt-2 border-l flex flex-col gap-1",
                            useSolidHeaderStyle ? "border-white/10" : "border-black/10",
                        )}>
                            <button
                                onClick={() => {
                                    closeMobileMenu();
                                    router.push(dashboardHref);
                                }}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-3 rounded-xl font-bold text-sm w-full text-left transition-colors bg-transparent border-none cursor-pointer active:bg-kode01-pink active:text-kode01-noir",
                                    useSolidHeaderStyle ? "text-white" : "text-kode01-noir",
                                )}
                            >
                                <LayoutDashboard size={18} />
                                {tAuth('my_space')}
                            </button>

                            <Link
                                href="/dashboard/settings"
                                onClick={() => closeMobileMenu()}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-3 rounded-xl font-bold text-sm no-underline transition-colors active:bg-kode01-pink active:text-kode01-noir",
                                    useSolidHeaderStyle ? "text-white" : "text-kode01-noir",
                                )}
                            >
                                <Settings size={18} />
                                {tAuth('settings')}
                            </Link>
                        </div>
                    )}
                </div>
            )}
            <div className={cn(
                "pt-4 mt-2 border-t flex items-center justify-between",
                useSolidHeaderStyle ? "border-white/10" : "border-black/5",
            )}>
                <LanguageSwitcher isScrolled={useSolidHeaderStyle} localePathnames={localePathnames} />
                <button
                    type="button"
                    onClick={() => {
                        closeMobileMenu();
                        requestAnimationFrame(() => {
                            const api = (window as Window & {
                                CookieConsent?: {
                                    showPreferences?: () => void;
                                    show?: (modal?: boolean) => void;
                                };
                            }).CookieConsent;
                            if (api?.showPreferences) {
                                api.showPreferences();
                            } else if (api?.show) {
                                api.show(true);
                            }
                        });
                    }}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer bg-transparent border-none",
                        useSolidHeaderStyle ? "text-white/40 hover:text-white" : "text-kode01-noir/40 hover:text-kode01-noir",
                    )}
                    aria-label={t('cookie_manage')}
                >
                    <Cookie size={16} />
                    <span>{t('cookie_manage')}</span>
                </button>
            </div>
        </div>
    );
}

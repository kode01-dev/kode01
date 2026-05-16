'use client';

import React, { useEffect, useState } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import {
    LayoutDashboard,
    FileText,
    Cookie,
    Users,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    LogOut,
    Megaphone,
    Sparkles,
    Loader2,
    Shield,
    ShieldAlert,
    SlidersHorizontal,
    Share2,
    Lock,
    Bookmark,
    ScrollText,
    Activity,
    X,
    Package,
    ShoppingCart,
    BarChart3,
    Wallet,
    KeyRound,
    Settings,
    Edit,
    UserPlus,
    Star,
    Bot,
    BadgePercent,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { logoutAction } from '@/features/auth/actions/auth-actions';
import { SpotlightHint } from '@/features/onboarding/components/SpotlightHint';
import type { SpotlightHintKey } from '@/features/onboarding/types';
import { extractDashboardSlugFromPath, getDashboardOverviewHref } from '../lib/paths';
import { API_MONITORING_ENABLED_CLIENT } from '@/features/api-monitoring/shared/feature-flag';
import {
    DASHBOARD_ROLES,
    isDashboardAdminRole,
    isDashboardVendorRole,
    type DashboardRole,
} from '../lib/roles';

interface NavItem {
    labelKey: string;
    href: string;
    icon: React.ElementType;
    spotlightHintKey?: SpotlightHintKey;
}

interface NavSection {
    id: string;
    titleKey?: string;
    items: NavItem[];
}

interface DashboardSidebarProps {
    role: DashboardRole;
    locale: string;
    mobileMenuOpen: boolean;
    onMobileMenuChange: (open: boolean) => void;
}

// Admin sections (excluding Overview which is now top-level)
const adminNavSections: NavSection[] = [
    {
        id: 'general',
        titleKey: 'sections.general',
        items: [
            { labelKey: 'admin.users', href: '/admin/users', icon: Users },
            { labelKey: 'admin.logs', href: '/admin/logs', icon: ScrollText },
            { labelKey: 'admin.coupons', href: '/admin/coupons', icon: BadgePercent },
            { labelKey: 'admin.finance', href: '/admin/finance', icon: Wallet },
            ...(API_MONITORING_ENABLED_CLIENT
                ? [{ labelKey: 'admin.api_monitoring', href: '/admin/api-monitoring', icon: Activity } as NavItem]
                : []),
        ]
    },
    {
        id: 'configuration',
        titleKey: 'sections.configuration',
        items: [
            { labelKey: 'admin.market_taxonomy', href: '/admin/market-taxonomy', icon: Package },
            { labelKey: 'admin.bundles', href: '/admin/bundles', icon: Package },
            { labelKey: 'admin.blueprints', href: '/admin/blueprints', icon: Bot },
            { labelKey: 'admin.lockscreen', href: '/admin/lockscreen', icon: Lock },
            { labelKey: 'admin.controllers', href: '/admin/controllers', icon: SlidersHorizontal },
        ]
    },
    {
        id: 'ai_ecosystem',
        titleKey: 'sections.ai_ecosystem',
        items: [
            { labelKey: 'admin.ai_recap', href: '/admin/ai-recap', icon: FileText },
            { labelKey: 'admin.seo_blog_agent', href: '/admin/seo-blog-agent', icon: Bot },
        ]
    },
    {
        id: 'cms_blogs',
        titleKey: 'sections.cms_blogs',
        items: [
            { labelKey: 'admin.cms_editor', href: '/admin/cms/editor', icon: Edit },
            { labelKey: 'admin.cms_stats', href: '/admin/cms/stats', icon: BarChart3 },
            { labelKey: 'admin.cms_publications', href: '/admin/cms/publications', icon: FileText },
            { labelKey: 'admin.cms_sponsored', href: '/admin/cms/sponsored', icon: Megaphone },
        ]
    },
    {
        id: 'marketing',
        titleKey: 'sections.marketing',
        items: [
            { labelKey: 'admin.social_links', href: '/admin/social-links', icon: Share2 },
            { labelKey: 'admin.marketing', href: '/admin/marketing', icon: Sparkles },
            { labelKey: 'admin.ads', href: '/admin/ads', icon: Megaphone },
        ]
    },
    {
        id: 'security_legal',
        titleKey: 'sections.security_legal',
        items: [
            { labelKey: 'admin.order_incidents', href: '/admin/order-incidents', icon: ShieldAlert },
            { labelKey: 'admin.privacy_cookies', href: '/admin/privacy-cookies', icon: Cookie },
            { labelKey: 'admin.security_bot_protection', href: '/admin/bot-activity', icon: Shield },
            { labelKey: 'admin.restricted_shop_names', href: '/admin/security/restricted-names', icon: ShieldAlert },
        ]
    }
];

const vendorNavSections: NavSection[] = [
    {
        id: 'store',
        titleKey: 'sections.store',
        items: [
            { labelKey: 'vendor.products', href: '/vendor/products', icon: Package, spotlightHintKey: 'vendor_products' },
            { labelKey: 'vendor.bundles', href: '/vendor/bundles', icon: Package },
            { labelKey: 'vendor.orders', href: '/vendor/orders', icon: ShoppingCart },
        ]
    },
    {
        id: 'financial',
        titleKey: 'sections.financial',
        items: [
            { labelKey: 'vendor.analytics', href: '/vendor/analytics', icon: BarChart3, spotlightHintKey: 'vendor_analytics' },
            { labelKey: 'vendor.payouts', href: '/vendor/payouts', icon: Wallet },
            { labelKey: 'vendor.coupons', href: '/vendor/coupons', icon: BadgePercent },
        ]
    },
    {
        id: 'growth',
        titleKey: 'sections.growth',
        items: [
            { labelKey: 'vendor.followers', href: '/vendor/followers', icon: Users },
            { labelKey: 'vendor.affiliates', href: '/vendor/affiliates', icon: Users },
            { labelKey: 'buyer.ads', href: '/advertise', icon: Megaphone },
            { labelKey: 'vendor.sponsored_blog', href: '/vendor/sponsored-blog', icon: Edit },
        ]
    },
    {
        id: 'account',
        titleKey: 'sections.account',
        items: [
            { labelKey: 'vendor.licenses', href: '/vendor/licenses', icon: KeyRound },
            { labelKey: 'vendor.settings', href: '/vendor/settings', icon: Settings },
            { labelKey: 'saved_items', href: '/dashboard/saved', icon: Bookmark },
        ]
    },
];

const savedMarketItem: NavItem = { labelKey: 'saved_items', href: '/dashboard/saved', icon: Bookmark };

const buyerSupplementalItems: NavItem[] = [
    savedMarketItem,
    { labelKey: 'buyer.my_reviews', href: '/buyer/reviews', icon: Star },
    { labelKey: 'buyer.following', href: '/buyer/following', icon: UserPlus },
    { labelKey: 'buyer.sponsored_blog', href: '/buyer/sponsored-blog', icon: Edit },
    { labelKey: 'buyer.ads', href: '/advertise', icon: Megaphone },
];

const vendorPurchasesSection: NavSection = {
    id: 'my_purchases',
    titleKey: 'sections.my_purchases',
    items: [
        { labelKey: 'buyer.my_purchases', href: '/buyer', icon: ShoppingCart },
        { labelKey: 'buyer.my_reviews', href: '/vendor/reviews', icon: Star },
    ],
};

export function DashboardSidebar({ role, locale, mobileMenuOpen, onMobileMenuChange }: DashboardSidebarProps) {
    const t = useTranslations('dashboard.sidebar');
    const { user, profile, refreshAuth } = useAuth();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const pathname = usePathname();

    const normalizedPathname = pathname.startsWith(`/${locale}`)
        ? pathname.slice(locale.length + 1) || '/'
        : pathname;

    useEffect(() => {
        setPendingHref(null);
        onMobileMenuChange(false);
    }, [pathname, onMobileMenuChange]);

    // Auto-expand all sections when mobile sheet opens
    useEffect(() => {
        if (mobileMenuOpen && (isDashboardAdminRole(role) || isDashboardVendorRole(role))) {
            const sections = isDashboardAdminRole(role)
                ? adminNavSections
                : [...vendorNavSections, vendorPurchasesSection];
            setExpandedSections(new Set(sections.map(s => s.id)));
        }
    }, [mobileMenuOpen, role]);

    const dashboardSlug = profile?.slug ?? extractDashboardSlugFromPath(pathname);
    const overviewHref = getDashboardOverviewHref(role, dashboardSlug);

    const adminOverview: NavItem = {
        labelKey: isDashboardAdminRole(role)
            ? 'admin.overview'
            : (isDashboardVendorRole(role) ? 'vendor.overview' : 'buyer.overview'),
        href: overviewHref,
        icon: LayoutDashboard
    };

    // Auto-expand logic for active sections
    useEffect(() => {
        const sections = isDashboardAdminRole(role)
            ? adminNavSections
            : (isDashboardVendorRole(role) ? [...vendorNavSections, vendorPurchasesSection] : []);
        if (sections.length === 0) return;
        const newExpanded = new Set(expandedSections);
        let changed = false;
        sections.forEach(section => {
            const hasActiveItem = section.items.some(item => {
                const isOverviewItem = item.labelKey.endsWith('.overview');
                return normalizedPathname === item.href || (!isOverviewItem && normalizedPathname.startsWith(`${item.href}/`));
            });
            if (hasActiveItem && !newExpanded.has(section.id)) {
                newExpanded.add(section.id);
                changed = true;
            }
        });
        if (changed) {
            setExpandedSections(newExpanded);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [normalizedPathname, role]);

    const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User';
    const initials = displayName.slice(0, 2).toUpperCase();

    async function handleLogout() {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await logoutAction();
            await refreshAuth();
            router.replace('/');
            router.refresh();
        } finally {
            setIsLoggingOut(false);
        }
    }

    const toggleSection = (sectionId: string) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(sectionId)) {
            newExpanded.delete(sectionId);
        } else {
            newExpanded.add(sectionId);
        }
        setExpandedSections(newExpanded);
    };

    function renderNavLink(item: NavItem, showLabels: boolean, isSubItem: boolean = false) {
        const isOverviewItem = item.labelKey.endsWith('.overview');
        const isLegacyVendorOverviewActive = role === DASHBOARD_ROLES.VENDOR && item.labelKey === 'vendor.overview' && normalizedPathname === '/vendor';
        const isLegacyBuyerOverviewActive = role === DASHBOARD_ROLES.BUYER && item.labelKey === 'buyer.overview' && (normalizedPathname === '/buyer' || normalizedPathname.startsWith('/buyer/'));
        const isActive = normalizedPathname === item.href || (!isOverviewItem && normalizedPathname.startsWith(`${item.href}/`)) || isLegacyVendorOverviewActive || isLegacyBuyerOverviewActive;
        const isPending = pendingHref === item.href;
        const Icon = item.icon;

        const linkContent = (
            <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                    if (!isActive) setPendingHref(item.href);
                }}
                className={cn(
                    'flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kode01-pink/40',
                    isSubItem ? 'rounded-xl pl-10 pr-4 py-2 text-[13px] font-semibold' : 'rounded-2xl px-4 py-3 text-sm font-bold',
                    isActive
                        ? 'bg-kode01-pink/10 text-kode01-pink'
                        : 'text-kode01-noir/60 hover:bg-kode01-sauge/10 hover:text-kode01-noir',
                    isPending ? 'opacity-70' : ''
                )}
            >
                {isPending ? (
                    <Loader2 size={isSubItem ? 16 : 20} className="flex-shrink-0 animate-spin" />
                ) : (
                    <Icon size={isSubItem ? 16 : 20} className="flex-shrink-0" />
                )}
                {showLabels && (
                    <span className="flex items-center gap-2">
                        <span>{t(item.labelKey)}</span>
                        {isActive && (
                            <span className={cn("rounded-full bg-kode01-pink", isSubItem ? "h-1 w-1" : "h-1.5 w-1.5")} aria-hidden />
                        )}
                    </span>
                )}
            </Link>
        );

        if (!showLabels) {
            return (
                <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
                </Tooltip>
            );
        }

        if (item.spotlightHintKey) {
            return (
                <SpotlightHint key={item.href} hintKey={item.spotlightHintKey}>
                    {linkContent}
                </SpotlightHint>
            );
        }

        return <div key={item.href}>{linkContent}</div>;
    }

    function renderSections(sections: NavSection[], showLabels: boolean) {
        return sections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const hasActiveItem = section.items.some(item => {
                const isOverviewItem = item.labelKey.endsWith('.overview');
                return normalizedPathname === item.href || (!isOverviewItem && normalizedPathname.startsWith(`${item.href}/`));
            });

            if (section.titleKey) {
                return (
                    <div key={section.id} className="flex flex-col mb-1">
                        {showLabels ? (
                            <button
                                onClick={() => toggleSection(section.id)}
                                className={cn(
                                    "flex w-full items-center justify-between px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] transition-colors rounded-xl",
                                    hasActiveItem ? "text-kode01-pink" : "text-kode01-noir/30 hover:text-kode01-noir/50 hover:bg-kode01-sauge/5"
                                )}
                            >
                                <span>{t(section.titleKey)}</span>
                                <ChevronDown
                                    size={12}
                                    className={cn(
                                        "transition-transform duration-200",
                                        isExpanded ? "rotate-0" : "-rotate-90"
                                    )}
                                />
                            </button>
                        ) : (
                            <div className="py-1">
                                <Separator className="mx-4 h-[1px] w-8 bg-kode01-sauge/20" />
                            </div>
                        )}

                        {(!showLabels || isExpanded) && (
                            <div className="flex flex-col mt-0.5">
                                {section.items.map(item => renderNavLink(item, showLabels, true))}
                            </div>
                        )}
                    </div>
                );
            }

            return (
                <React.Fragment key={section.id}>
                    {section.items.map(item => renderNavLink(item, showLabels, false))}
                </React.Fragment>
            );
        });
    }

    function renderNav() {
        const showLabels = !collapsed;

        if (role === DASHBOARD_ROLES.BUYER) {
            return (
                <div className="flex flex-col gap-1">
                    {renderNavLink({ labelKey: 'buyer.overview', href: overviewHref, icon: LayoutDashboard }, showLabels)}
                    {buyerSupplementalItems.map(item => renderNavLink(item, showLabels))}
                </div>
            );
        }

        if (role === DASHBOARD_ROLES.VENDOR) {
            return (
                <div className="flex flex-col gap-1">
                    {renderNavLink({ labelKey: 'vendor.overview', href: overviewHref, icon: LayoutDashboard }, showLabels)}
                    <Separator className="my-3 bg-kode01-sauge/10" />
                    {renderSections(vendorNavSections, showLabels)}
                    <Separator className="my-3 bg-kode01-sauge/10" />
                    {renderSections([vendorPurchasesSection], showLabels)}
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-1">
                {renderNavLink(adminOverview, showLabels)}
                <Separator className="my-3 bg-kode01-sauge/10" />
                {renderSections(adminNavSections, showLabels)}
            </div>
        );
    }

    function renderUserSection(compact?: boolean) {
        return (
            <div className="p-4">
                <div
                    className={cn(
                        'flex items-center gap-4 rounded-3xl px-3 py-3 border border-transparent transition-all',
                        compact ? 'hover:border-kode01-sauge/20 hover:bg-white/50 hover:shadow-sm' : (collapsed ? 'justify-center' : 'hover:border-kode01-sauge/20 hover:bg-white/50 hover:shadow-sm')
                    )}
                >
                    <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-kode01-white shadow-sm">
                        <AvatarFallback className="bg-kode01-pink text-white font-serif font-black">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    {(compact || !collapsed) && (
                        <div className="flex-1 overflow-hidden">
                            <p className="truncate text-sm font-black text-kode01-noir">
                                {displayName}
                            </p>
                            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-kode01-pink">
                                {t(`roles.${role}`)}
                            </p>
                        </div>
                    )}
                    {(compact || !collapsed) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={isLoggingOut}
                            className="h-8 w-8 text-kode01-noir/40 hover:text-kode01-noir hover:bg-kode01-sauge/10 rounded-full"
                            onClick={handleLogout}
                            aria-label={isLoggingOut ? t('logging_out') : t('logout')}
                        >
                            {isLoggingOut ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <LogOut size={16} />
                            )}
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    'fixed left-0 top-0 z-40 hidden lg:flex h-screen flex-col border-r border-kode01-sauge/20 bg-kode01-white transition-all duration-300',
                    collapsed ? 'w-[72px]' : 'w-[260px]'
                )}
            >
                <div className="flex h-20 items-center justify-between px-6">
                    {!collapsed && (
                        <Link href="/" className="flex items-center">
                            <Image
                                src="/logo_v2.png"
                                alt="KODE01"
                                width={88}
                                height={22}
                                className="shrink-0"
                                priority
                            />
                        </Link>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCollapsed(!collapsed)}
                        aria-label={collapsed ? t('expand_sidebar') : t('collapse_sidebar')}
                        className="ml-auto h-8 w-8 text-kode01-noir/40 hover:text-kode01-noir hover:bg-kode01-sauge/10 rounded-full"
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </Button>
                </div>

                <Separator className="bg-kode01-sauge/10" />

                <nav className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
                    {renderNav()}
                </nav>

                <Separator className="bg-black/5" />

                {renderUserSection()}
            </aside>

            <Sheet open={mobileMenuOpen} onOpenChange={onMobileMenuChange}>
                <SheetContent side="left" showCloseButton={false} className="w-full sm:w-[300px] sm:max-w-[300px] p-0 gap-0 bg-kode01-white border-r border-kode01-sauge/20">
                    <SheetHeader className="flex h-16 shrink-0 flex-row items-center justify-between px-6 border-b border-kode01-sauge/10">
                        <SheetTitle asChild>
                            <Link href="/" className="flex items-center">
                                <Image
                                    src="/logo_v2.png"
                                    alt="KODE01"
                                    width={88}
                                    height={22}
                                    className="shrink-0"
                                />
                            </Link>
                        </SheetTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onMobileMenuChange(false)}
                            className="h-9 w-9 rounded-full text-kode01-noir/40 hover:text-kode01-noir hover:bg-kode01-sauge/10"
                            aria-label={t('collapse_sidebar')}
                        >
                            <X size={20} />
                        </Button>
                    </SheetHeader>

                    <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 custom-scrollbar">
                        {renderNav()}
                    </nav>

                    <div className="shrink-0">
                        <Separator className="bg-black/5" />
                        {renderUserSection(true)}
                    </div>
                </SheetContent>
            </Sheet>
        </TooltipProvider>
    );
}

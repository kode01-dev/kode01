'use client';

import { useEffect, useState } from 'react';
import { Menu, Search, ShoppingCart, Settings, Loader2, LayoutDashboard, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutAction } from '@/features/auth/actions/auth-actions';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { extractDashboardSlugFromPath, getDashboardOverviewHref } from '../lib/paths';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { CartMenu } from '@/components/cart/CartMenu';
import { useCart } from '@/features/cart/CartProvider';
import { isDashboardAdminRole, type DashboardRole } from '../lib/roles';

interface DashboardHeaderProps {
    role: DashboardRole;
    title: string;
    subtitle?: string;
    onMobileMenuOpen: () => void;
}

export function DashboardHeader({ role, title, subtitle, onMobileMenuOpen }: DashboardHeaderProps) {
    const tLayout = useTranslations('layout');
    const tAuth = useTranslations('auth');
    const tHeader = useTranslations('dashboard.header');
    const { user, profile, refreshAuth } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [pendingHref, setPendingHref] = useState<string | null>(null);
    const { count: cartCount } = useCart();
    const normalizedPathname = pathname.replace(/^\/(en|fr)(?=\/|$)/, '') || '/';
    const dashboardSlug = profile?.slug ?? extractDashboardSlugFromPath(pathname);
    const overviewHref = getDashboardOverviewHref(role, dashboardSlug);
    const accountName = profile?.display_name
        || profile?.shop_name
        || (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '')
        || user?.email?.split('@')[0]
        || tHeader('my_account');
    useEffect(() => {
        setPendingHref(null);
    }, [pathname]);

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

    return (
        <header className="sticky top-0 z-40 border-b border-kode01-sauge/15 bg-kode01-white/80 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-4 lg:py-0">
            <div className="flex min-h-16 lg:h-24 items-start lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden h-11 w-11 shrink-0 rounded-full hover:bg-kode01-sauge/10"
                        onClick={onMobileMenuOpen}
                        aria-label="Menu"
                    >
                        <Menu size={22} />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-serif font-black tracking-tight text-kode01-noir truncate">{title}</h1>
                        {subtitle && (
                            <p className="text-[10px] sm:text-xs font-bold tracking-widest uppercase text-kode01-noir/40 mt-1 line-clamp-1">{subtitle}</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 sm:gap-3 shrink-0">
                    {!isDashboardAdminRole(role) && (
                        <div className="relative hidden xl:block">
                            <Search
                                size={16}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-kode01-noir/40"
                            />
                            <Input
                                placeholder={tHeader('search_placeholder')}
                                className="w-72 pl-10 h-10 bg-kode01-sauge/5 border-transparent text-kode01-noir placeholder:text-kode01-noir/40 focus:bg-white focus:ring-2 focus:ring-kode01-pink/20 rounded-full transition-all"
                            />
                        </div>
                    )}

                    {!isDashboardAdminRole(role) && (
                        <div className="hidden lg:flex items-center gap-6 mx-4">
                            {[
                                { id: 'explore', href: '/market' },
                                { id: 'creators', href: '/creators' },
                                { id: 'bundles', href: '/bundles' },
                                { id: 'pricing', href: '/pricing' }
                            ].map((link) => (
                                <Link
                                    key={link.id}
                                    href={link.href}
                                    className="text-sm text-kode01-noir/60 hover:text-kode01-noir font-bold transition-colors"
                                >
                                    {tLayout(`nav.${link.id}`)}
                                </Link>
                            ))}
                        </div>
                    )}

                    {!isDashboardAdminRole(role) && (
                        <CartMenu>
                            <button
                                type="button"
                                className="relative p-2.5 text-kode01-noir/60 hover:text-kode01-noir hover:bg-kode01-sauge/10 rounded-full transition-colors hidden sm:block bg-transparent border-none cursor-pointer"
                                aria-label="Cart"
                            >
                                <ShoppingCart size={20} />
                                {cartCount > 0 ? (
                                    <span className="absolute top-1 right-1 h-4 w-4 bg-kode01-pink text-white text-[10px] font-black flex items-center justify-center rounded-full shadow-sm">
                                        {cartCount}
                                    </span>
                                ) : null}
                            </button>
                        </CartMenu>
                    )}
                    <NotificationBell />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-black/5 border-transparent">
                                <Avatar className="h-9 w-9 ring-2 ring-kode01-pink/20 object-cover">
                                    <AvatarImage src={profile?.avatar_url ?? undefined} alt={profile?.display_name || user?.email || 'User'} />
                                    <AvatarFallback className="bg-kode01-pink text-white font-serif font-black text-sm">
                                        {(profile?.display_name || user?.email || 'K').slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="w-60 overflow-hidden rounded-2xl border border-white/10 bg-kode01-noir text-white shadow-2xl"
                        >
                            <DropdownMenuLabel className="border-b border-white/10 px-4 py-3">
                                <p className="truncate text-sm font-bold text-white">{accountName}</p>
                                <p className="truncate text-xs text-white/40">{user?.email ?? tHeader('connected')}</p>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                asChild
                                className="mx-2 my-1 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:bg-white/5 focus:text-white"
                            >
                                <Link href={overviewHref} className="no-underline">
                                    <LayoutDashboard size={16} className="mr-2" />
                                    {tAuth('my_space')}
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                asChild
                                className="mx-2 my-1 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:bg-white/5 focus:text-white"
                            >
                                <Link href="/dashboard/settings" className="no-underline">
                                    <Settings size={16} className="mr-2" />
                                    {tHeader('settings')}
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="mx-2 my-1 rounded-xl px-3 py-2.5 text-sm text-white/70 focus:bg-white/5 focus:text-kode01-pink"
                                disabled={isLoggingOut}
                                onClick={handleLogout}
                            >
                                {isLoggingOut ? <Loader2 size={16} className="mr-2 animate-spin" /> : <LogOut size={16} className="mr-2" />}
                                {isLoggingOut ? tHeader('logging_out') : tHeader('logout')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {!isDashboardAdminRole(role) && (
                <div className="hidden sm:flex lg:hidden items-center gap-3 mt-3 px-1">
                    {[
                        { id: 'explore', href: '/market' },
                        { id: 'creators', href: '/creators' },
                        { id: 'bundles', href: '/bundles' },
                    ].map((link) => {
                        const isActive =
                            normalizedPathname === link.href ||
                            normalizedPathname.startsWith(`${link.href}/`);
                        const isPending = pendingHref === link.href;

                        return (
                            <Link
                                key={link.id}
                                href={link.href}
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => {
                                    if (!isActive) setPendingHref(link.href);
                                }}
                                className={cn(
                                    'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest no-underline transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kode01-pink/40',
                                    isActive
                                        ? 'bg-kode01-pink/10 text-kode01-noir'
                                        : 'text-kode01-noir/60 hover:text-kode01-noir hover:bg-black/5',
                                    isPending ? 'opacity-70' : ''
                                )}
                            >
                                {isPending ? <Loader2 size={10} className="animate-spin" /> : null}
                                {tLayout(`nav.${link.id}`)}
                            </Link>
                        );
                    })}
                </div>
            )}
        </header>
    );
}

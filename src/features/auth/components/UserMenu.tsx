'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Image from 'next/image';
import { LogOut, LayoutDashboard, ChevronDown, Settings, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { logoutAction } from '../actions/auth-actions';
import { useRouter } from '@/i18n/routing';
import { getDashboardOverviewHref } from '@/features/dashboard/lib/paths';
import { isAdminRole, isBuyerRole, isSellerRole } from '@/lib/auth/roles';

export function UserMenu() {
    const t = useTranslations('auth');
    const { user, profile, refreshAuth } = useAuth();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) return null;

    const displayName = profile?.display_name
        || profile?.shop_name
        || (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '')
        || user.email?.split('@')[0]
        || 'User';
    const initials = displayName.slice(0, 2).toUpperCase();

    const dashboardHref = isAdminRole(profile?.role)
        ? getDashboardOverviewHref('admin', profile?.slug)
        : isSellerRole(profile?.role)
            ? getDashboardOverviewHref('vendor', profile?.slug)
            : isBuyerRole(profile?.role)
                ? getDashboardOverviewHref('buyer', profile?.slug)
                : '/dashboard/settings';

    async function handleLogout() {
        setLoggingOut(true);
        await logoutAction();
        await refreshAuth();
        router.refresh();
    }

    function handleMySpace() {
        setIsOpen(false);
        router.push(dashboardHref);
    }

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 cursor-pointer group"
            >
                {/* Avatar */}
                {profile?.avatar_url ? (
                    <Image
                        src={profile.avatar_url}
                        alt={displayName}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-kode01-pink/30"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-kode01-pink flex items-center justify-center text-kode01-noir text-xs font-bold">
                        {initials}
                    </div>
                )}
                <ChevronDown
                    size={14}
                    className={`text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-3 w-56 max-w-[calc(100vw-2rem)] bg-kode01-noir border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 z-50">
                    {/* User info */}
                    <div className="px-4 py-3 border-b border-white/10">
                        <p className="text-white text-sm font-bold truncate">{displayName}</p>
                        <p className="text-white/40 text-xs truncate">{user.email}</p>
                    </div>

                    {/* Links */}
                    <div className="p-2">
                        <button
                            onClick={handleMySpace}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors w-full text-left text-sm cursor-pointer"
                        >
                            <LayoutDashboard size={16} />
                            {t('my_space')}
                        </button>
                        <Link
                            href="/dashboard/settings"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors no-underline text-sm"
                        >
                            <Settings size={16} />
                            {t('settings')}
                        </Link>
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/70 hover:text-red-400 hover:bg-white/5 transition-colors w-full text-left text-sm cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
                        >
                            {loggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                            {loggingOut ? t('logging_out') : t('logout')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}


'use client';

import React, { useEffect, useState } from 'react';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { isDashboardAdminRole, type DashboardRole } from '../lib/roles';

interface DashboardShellProps {
    children: React.ReactNode;
    role: DashboardRole;
    locale: string;
    title: string;
    subtitle?: string;
}

const ZIPCHAT_HIDE_CLASS = 'zipchat-hidden';

function useHideZipchat(hide: boolean) {
    useEffect(() => {
        if (!hide) return;
        document.body.classList.add(ZIPCHAT_HIDE_CLASS);
        return () => {
            document.body.classList.remove(ZIPCHAT_HIDE_CLASS);
        };
    }, [hide]);
}

export function DashboardShell({
    children,
    role,
    locale,
    title,
    subtitle,
}: DashboardShellProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    useHideZipchat(isDashboardAdminRole(role));

    return (
        <div className="min-h-screen bg-kode01-white text-kode01-noir antialiased font-sans flex text-base selection:bg-kode01-pink/30">
            <DashboardSidebar
                role={role}
                locale={locale}
                mobileMenuOpen={mobileMenuOpen}
                onMobileMenuChange={setMobileMenuOpen}
            />

            {/* Main Content Area */}
            <div className="flex-1 ml-0 lg:ml-[260px] transition-all duration-300 min-w-0">
                <DashboardHeader
                    role={role}
                    title={title}
                    subtitle={subtitle}
                    onMobileMenuOpen={() => setMobileMenuOpen(true)}
                />

                <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}

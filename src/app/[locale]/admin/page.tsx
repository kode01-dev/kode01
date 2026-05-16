import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Package, ShoppingCart, TrendingUp, Shield, Cookie } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { getRequestHostFromHeaders } from '@/lib/http/request-host';
import { isAdminSubdomainHost } from '@/lib/routing/subdomains';
import { getUserRoleWithAdminFallback } from '@/lib/auth/admin-role';

function formatChange(currentValue: number, previousValue: number): string {
    if (previousValue <= 0) {
        return currentValue > 0 ? '+100.0%' : '0.0%';
    }

    const delta = ((currentValue - previousValue) / previousValue) * 100;
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}%`;
}

function formatRelativeTime(dateValue: string, locale: string): string {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '-';

    const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const absSeconds = Math.abs(diffInSeconds);

    if (absSeconds < 60) return rtf.format(diffInSeconds, 'second');
    const minutes = Math.round(diffInSeconds / 60);
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    const days = Math.round(hours / 24);
    return rtf.format(days, 'day');
}

export default function AdminDashboardPage(
    props: { params: Promise<{ locale: string }> }
) {
    return (
        <AdminDashboardContent paramsPromise={props.params} />
    );
}

async function AdminDashboardContent({
    paramsPromise,
}: {
    paramsPromise: Promise<{ locale: string }>;
}) {
    const { locale } = await paramsPromise;
    const headerStore = await headers();
    const host = getRequestHostFromHeaders(headerStore);
    const isAdminHost = isAdminSubdomainHost(host);
    const t = await getTranslations('dashboard.admin');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        if (isAdminHost) {
            notFound();
        }
        redirect(`/${locale}`);
    }

    const roleLookup = await getUserRoleWithAdminFallback(user.id, supabase);

    if (!roleLookup.resolved || roleLookup.role !== 'admin') {
        if (isAdminHost) {
            notFound();
        }
        return (
            <div className="min-h-screen flex items-center justify-center bg-kode01-white text-kode01-noir">
                <div className="text-center">
                    <h1 className="text-3xl font-black font-serif">403</h1>
                    <p className="mt-2 text-sm font-bold uppercase tracking-widest text-kode01-noir/50">
                        {t('forbidden')}
                    </p>
                </div>
            </div>
        );
    }

    const now = new Date();
    const startCurrentMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
    );
    const startPreviousMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
    );

    const startCurrentMonthIso = startCurrentMonth.toISOString();
    const startPreviousMonthIso = startPreviousMonth.toISOString();

    // Fetch real stats from database
    const [
        { count: totalUsers },
        { count: totalProducts },
        { count: totalTransactions },
        { data: revenueData }
    ] = await Promise.all([
        supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .neq('role', 'admin'),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('purchases').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('purchases').select('amount').eq('status', 'completed')
    ]);

    const totalRevenue = revenueData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const joinedPrefix = t('joined_prefix');
    const noRecentRegistrationsLabel = t('no_recent_registrations');
    const noRecentTransactionsLabel = t('no_recent_transactions');
    const unknownProductLabel = t('unknown_product');
    const securityTitle = t('security.title');
    const securitySubtitle = t('security.subtitle');
    const securityButtonLabel = t('security.view_logs');
    const securityUnavailableLabel = t('security.unavailable');
    const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
        { count: usersCurrentMonth },
        { count: usersPreviousMonth },
        { count: productsCurrentMonth },
        { count: productsPreviousMonth },
        { count: purchasesCurrentMonth },
        { count: purchasesPreviousMonth },
        { data: revenueCurrentMonthData },
        { data: revenuePreviousMonthData },
        { data: recentRegistrations },
        { data: recentTransactions },
        botDetectedTotalResult,
        botDetected24hResult,
        botBlockedTotalResult,
        botBlocked24hResult,
        botHoneypotTotalResult
    ] = await Promise.all([
        supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .neq('role', 'admin')
            .gte('created_at', startCurrentMonthIso),
        supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .neq('role', 'admin')
            .gte('created_at', startPreviousMonthIso)
            .lt('created_at', startCurrentMonthIso),
        supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published')
            .gte('created_at', startCurrentMonthIso),
        supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published')
            .gte('created_at', startPreviousMonthIso)
            .lt('created_at', startCurrentMonthIso),
        supabase
            .from('purchases')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed')
            .gte('created_at', startCurrentMonthIso),
        supabase
            .from('purchases')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed')
            .gte('created_at', startPreviousMonthIso)
            .lt('created_at', startCurrentMonthIso),
        supabase
            .from('purchases')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', startCurrentMonthIso),
        supabase
            .from('purchases')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', startPreviousMonthIso)
            .lt('created_at', startCurrentMonthIso),
        supabase
            .from('profiles')
            .select('id, display_name, role, created_at')
            .order('created_at', { ascending: false })
            .limit(3),
        supabase
            .from('purchases')
            .select('id, amount, created_at, status, products(title)')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(3),
        supabase
            .from('bot_activity')
            .select('id', { count: 'exact', head: true }),
        supabase
            .from('bot_activity')
            .select('id', { count: 'exact', head: true })
            .gte('detected_at', since24hIso),
        supabase
            .from('bot_activity')
            .select('id', { count: 'exact', head: true })
            .eq('blocked', true),
        supabase
            .from('bot_activity')
            .select('id', { count: 'exact', head: true })
            .eq('blocked', true)
            .gte('detected_at', since24hIso),
        supabase
            .from('bot_activity')
            .select('id', { count: 'exact', head: true })
            .eq('source', 'honeypot')
            .eq('reason', 'honeypot_trip')
    ]);
    const revenueCurrentMonth =
        revenueCurrentMonthData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const revenuePreviousMonth =
        revenuePreviousMonthData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const botDetectedTotal = botDetectedTotalResult.count || 0;
    const botDetected24h = botDetected24hResult.count || 0;
    const botBlockedTotal = botBlockedTotalResult.count || 0;
    const botBlocked24h = botBlocked24hResult.count || 0;
    const botHoneypotTotal = botHoneypotTotalResult.count || 0;
    const hasBotStatsError = Boolean(
        botDetectedTotalResult.error ||
        botDetected24hResult.error ||
        botBlockedTotalResult.error ||
        botBlocked24hResult.error ||
        botHoneypotTotalResult.error
    );
    const botBlockRatePercent =
        botDetectedTotal > 0 ? (botBlockedTotal / botDetectedTotal) * 100 : 0;
    const { data: cookieEvents } = await supabase
        .from('cookie_consent_events')
        .select('event_type, accepted_categories')
        .limit(10000);

    const cookieRows = cookieEvents ?? [];
    let firstChoices = 0;
    let firstChoicesWithOptional = 0;
    let analyticsAccepted = 0;
    let marketingAccepted = 0;
    let optOut = 0;

    for (const row of cookieRows) {
        const acceptedCategories = Array.isArray(row.accepted_categories)
            ? row.accepted_categories.filter((item): item is string => typeof item === 'string')
            : [];

        const hasAnalytics = acceptedCategories.includes('analytics');
        const hasMarketing = acceptedCategories.includes('marketing');
        const hasOptional = hasAnalytics || hasMarketing;

        if (row.event_type === 'consent_first_choice') {
            firstChoices += 1;
            if (hasOptional) firstChoicesWithOptional += 1;
        }

        if (hasAnalytics) analyticsAccepted += 1;
        if (hasMarketing) marketingAccepted += 1;
        if (row.event_type === 'consent_withdrawn' || !hasOptional) optOut += 1;
    }

    const totalCookieEvents = cookieRows.length;
    const cookieKpis = {
        consentRatePercent:
            firstChoices > 0 ? (firstChoicesWithOptional / firstChoices) * 100 : 0,
        analyticsAcceptedPercent:
            totalCookieEvents > 0 ? (analyticsAccepted / totalCookieEvents) * 100 : 0,
        marketingAcceptedPercent:
            totalCookieEvents > 0 ? (marketingAccepted / totalCookieEvents) * 100 : 0,
        optOutPercent: totalCookieEvents > 0 ? (optOut / totalCookieEvents) * 100 : 0,
        totalEvents: totalCookieEvents,
    };

    const stats = [
        {
            label: t('stats.total_users'),
            value: (totalUsers || 0).toLocaleString(locale),
            change: formatChange(usersCurrentMonth || 0, usersPreviousMonth || 0),
            icon: Users,
            color: 'text-kode01-blue',
            iconBg: 'bg-kode01-blue/10',
        },
        {
            label: t('stats.total_products'),
            value: (totalProducts || 0).toLocaleString(locale),
            change: formatChange(productsCurrentMonth || 0, productsPreviousMonth || 0),
            icon: Package,
            color: 'text-kode01-green',
            iconBg: 'bg-kode01-green/10',
        },
        {
            label: t('stats.transactions'),
            value: (totalTransactions || 0).toLocaleString(locale),
            change: formatChange(purchasesCurrentMonth || 0, purchasesPreviousMonth || 0),
            icon: ShoppingCart,
            color: 'text-kode01-pink',
            iconBg: 'bg-kode01-pink/10',
        },
        {
            label: t('stats.revenue'),
            value: `$${totalRevenue.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            change: formatChange(revenueCurrentMonth, revenuePreviousMonth),
            icon: TrendingUp,
            color: 'text-kode01-blue',
            iconBg: 'bg-kode01-blue/10',
        },
    ];

    return (
        <DashboardShell role="admin" locale={locale} title={t('title')} subtitle={t('subtitle')}>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.iconBg}`}>
                                    <Icon size={24} className={stat.color} />
                                </div>
                                <div>
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {stat.label}
                                    </CardTitle>
                                    <div className="text-3xl font-serif font-black text-kode01-noir mt-1 leading-none">{stat.value}</div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-2">
                                <p className="text-xs font-bold text-kode01-green flex items-center gap-1">
                                    <TrendingUp size={12} /> {stat.change} <span className="text-kode01-noir/30 font-normal">{t('from_last_month')}</span>
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Recent Activity */}
            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                            {t('recent_registrations')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {(recentRegistrations ?? []).map((registration) => (
                                <div key={registration.id} className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-kode01-blue/10 flex items-center justify-center">
                                        <Users size={18} className="text-kode01-blue" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-kode01-noir leading-none">
                                            {registration.display_name || registration.id.slice(0, 8)}
                                        </p>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 mt-1">
                                            {registration.role ? `${joinedPrefix} ${registration.role}` : t('joined_as_buyer')}
                                        </p>
                                    </div>
                                    <span className="ml-auto text-[10px] font-bold text-kode01-noir/30">
                                        {formatRelativeTime(registration.created_at, locale)}
                                    </span>
                                </div>
                            ))}
                            {(!recentRegistrations || recentRegistrations.length === 0) && (
                                <p className="text-sm text-kode01-noir/50">{noRecentRegistrationsLabel}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                            {t('recent_transactions')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {(recentTransactions ?? []).map((tx) => (
                                <div key={tx.id} className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-kode01-green/10 flex items-center justify-center">
                                        <ShoppingCart size={18} className="text-kode01-green" />
                                    </div>
                                    <div>
                                        {(() => {
                                            const productRelation = tx.products as
                                                | { title?: string | null }
                                                | Array<{ title?: string | null }>
                                                | null;
                                            const productTitle = Array.isArray(productRelation)
                                                ? productRelation[0]?.title
                                                : productRelation?.title;
                                            return (
                                                <p className="text-sm font-bold text-kode01-noir leading-none">
                                                    {productTitle || unknownProductLabel}
                                                </p>
                                            );
                                        })()}
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 mt-1">{t('completed')}</p>
                                    </div>
                                    <span className="ml-auto text-sm font-black text-kode01-green">
                                        ${Number(tx.amount || 0).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                            {(!recentTransactions || recentTransactions.length === 0) && (
                                <p className="text-sm text-kode01-noir/50">{noRecentTransactionsLabel}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Compliance + Security */}
            <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 shrink-0 rounded-full bg-kode01-blue/10 flex items-center justify-center">
                                <Cookie size={24} className="text-kode01-blue" />
                            </div>
                            <div className="min-w-0">
                                <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                                    {t('cookies.card_title')}
                                </CardTitle>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 mt-1">
                                    {t('cookies.card_subtitle')}
                                </p>
                            </div>
                        </div>
                        <a
                            href={`/${locale}/admin/privacy-cookies`}
                            className="w-full sm:w-auto sm:ml-auto text-center px-6 py-2 bg-kode01-noir text-kode01-white text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-kode01-noir/90 transition-colors"
                        >
                            {t('cookies.view_details')}
                        </a>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                {t('cookies.consent_rate')}
                            </p>
                            <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                {cookieKpis.consentRatePercent.toFixed(1)}%
                            </p>
                        </div>
                        <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                {t('cookies.analytics')}
                            </p>
                            <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                {cookieKpis.analyticsAcceptedPercent.toFixed(1)}%
                            </p>
                        </div>
                        <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                {t('cookies.marketing')}
                            </p>
                            <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                {cookieKpis.marketingAcceptedPercent.toFixed(1)}%
                            </p>
                        </div>
                        <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                {t('cookies.opt_out')}
                            </p>
                            <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                {cookieKpis.optOutPercent.toFixed(1)}%
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-12 h-12 shrink-0 rounded-full bg-kode01-pink/10 flex items-center justify-center">
                                <Shield size={24} className="text-kode01-pink" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                                    {securityTitle}
                                </CardTitle>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 mt-1">
                                    {securitySubtitle}
                                </p>
                            </div>
                        </div>
                        <a
                            href={`/${locale}/admin/bot-activity`}
                            className="w-full sm:w-auto sm:ml-auto text-center px-6 py-2 bg-kode01-noir text-kode01-white text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-kode01-noir/90 transition-colors"
                        >
                            {securityButtonLabel}
                        </a>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {hasBotStatsError ? (
                            <p className="col-span-full text-sm text-kode01-noir/50">{securityUnavailableLabel}</p>
                        ) : (
                            <>
                                <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {t('security.metrics.bots_24h')}
                                    </p>
                                    <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                        {botDetected24h.toLocaleString(locale)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {t('security.metrics.blocked_24h')}
                                    </p>
                                    <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                        {botBlocked24h.toLocaleString(locale)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-kode01-sauge/15 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {t('security.metrics.honeypot_caught')}
                                    </p>
                                    <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                        {botHoneypotTotal.toLocaleString(locale)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-black/10 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {t('security.metrics.block_rate')}
                                    </p>
                                    <p className="text-xl font-serif font-black text-kode01-noir mt-1">
                                        {botBlockRatePercent.toFixed(1)}%
                                    </p>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

        </DashboardShell>
    );
}

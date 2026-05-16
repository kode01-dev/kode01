import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';
import Link from 'next/link';
import { VendorOrderIncidentsPanel } from '@/features/vendor/order-incidents/components/VendorOrderIncidentsPanel';

const ITEMS_PER_PAGE = 20;
const STATUS_OPTIONS = ['all', 'completed', 'pending', 'refunded', 'failed'] as const;

export default async function VendorOrdersPage(
    props: {
        params: Promise<{ locale: string }>;
        searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }
) {
    const { locale } = await props.params;
    const searchParams = props.searchParams ? await props.searchParams : {};
    const t = await getTranslations('dashboard.vendor');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}`);
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !isSellerRole(profile.role)) {
        redirect(`/${locale}`);
    }

    // Parse filters from searchParams
    const statusFilter = typeof searchParams.status === 'string' && STATUS_OPTIONS.includes(searchParams.status as typeof STATUS_OPTIONS[number])
        ? searchParams.status
        : 'all';
    const page = Math.max(1, parseInt(typeof searchParams.page === 'string' ? searchParams.page : '1', 10));
    const sortBy = typeof searchParams.sort === 'string' ? searchParams.sort : 'date_desc';

    // Build query
    let query = supabase
        .from('purchases')
        .select(`
            id,
            amount,
            seller_payout,
            status,
            created_at,
            products(title),
            profiles!purchases_buyer_id_fkey(display_name)
        `, { count: 'exact' })
        .eq('seller_id', user.id);

    if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
    }

    // Sorting
    const ascending = sortBy.endsWith('_asc');
    const sortField = sortBy.startsWith('amount') ? 'amount'
        : sortBy.startsWith('payout') ? 'seller_payout'
        : 'created_at';
    query = query.order(sortField, { ascending });

    // Pagination
    const from = (page - 1) * ITEMS_PER_PAGE;
    query = query.range(from, from + ITEMS_PER_PAGE - 1);

    const { data: orders, count: totalCount } = await query;
    const totalPages = Math.ceil((totalCount ?? 0) / ITEMS_PER_PAGE);

    const statusMap: Record<string, string> = {
        completed: t('orders_page.status_completed'),
        pending: t('orders_page.status_pending'),
        refunded: t('orders_page.status_refunded'),
        failed: t('orders_page.status_failed'),
    };

    const statusColorMap: Record<string, string> = {
        completed: 'bg-kode01-green/10 text-kode01-green',
        pending: 'bg-kode01-sauge/10 text-kode01-sauge',
        refunded: 'bg-kode01-blue/10 text-kode01-blue',
        failed: 'bg-kode01-pink/10 text-kode01-pink',
    };

    function buildUrl(params: Record<string, string>) {
        const base = `/${locale}/vendor/orders`;
        const sp = new URLSearchParams();
        if (params.status ?? statusFilter !== 'all') sp.set('status', params.status ?? statusFilter);
        if (params.page ?? (page > 1 ? String(page) : undefined)) sp.set('page', params.page ?? String(page));
        if (params.sort ?? sortBy !== 'date_desc') sp.set('sort', params.sort ?? sortBy);
        const qs = sp.toString();
        return qs ? `${base}?${qs}` : base;
    }

    return (
        <DashboardShell role="vendor" locale={locale} title={t('orders_page.title')} subtitle={t('orders_page.subtitle')}>
            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
                {STATUS_OPTIONS.map((status) => (
                    <Link
                        key={status}
                        href={buildUrl({ status, page: '1' })}
                        className={`rounded-full px-2.5 sm:px-4 py-1.5 text-xs font-bold transition-colors border ${
                            statusFilter === status
                                ? 'border-kode01-pink bg-kode01-pink/10 text-kode01-pink'
                                : 'border-black/10 text-kode01-noir/50 hover:border-kode01-pink/30 hover:text-kode01-noir/70'
                        }`}
                    >
                        {status === 'all' ? 'All' : statusMap[status] || status}
                    </Link>
                ))}

                <span className="ml-auto text-xs text-kode01-noir/40">
                    {totalCount ?? 0} order{(totalCount ?? 0) !== 1 ? 's' : ''}
                </span>
            </div>

            <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-black/5 bg-black/[0.02]">
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden sm:table-cell">{t('orders_page.columns.buyer')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('orders_page.columns.product')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        <Link href={buildUrl({ sort: sortBy === 'amount_asc' ? 'amount_desc' : 'amount_asc', page: '1' })} className="hover:text-kode01-pink">
                                            {t('orders_page.columns.amount')} {sortField === 'amount' ? (ascending ? ' ↑' : ' ↓') : ''}
                                        </Link>
                                    </th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden sm:table-cell">
                                        <Link href={buildUrl({ sort: sortBy === 'payout_asc' ? 'payout_desc' : 'payout_asc', page: '1' })} className="hover:text-kode01-pink">
                                            {t('orders_page.columns.payout')} {sortField === 'seller_payout' ? (ascending ? ' ↑' : ' ↓') : ''}
                                        </Link>
                                    </th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('orders_page.columns.status')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden md:table-cell">
                                        <Link href={buildUrl({ sort: sortBy === 'date_asc' ? 'date_desc' : 'date_asc', page: '1' })} className="hover:text-kode01-pink">
                                            {t('orders_page.columns.date')} {sortField === 'created_at' ? (ascending ? ' ↑' : ' ↓') : ''}
                                        </Link>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {(orders ?? []).map((order) => (
                                    <tr key={order.id} className="border-t border-black/5 hover:bg-black/5 transition-colors group">
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir hidden sm:table-cell">
                                            {((order.profiles as unknown) as { display_name: string })?.display_name || t('anonymous_user')}
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir/70">
                                            {((order.products as unknown) as { title: string })?.title}
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-bold text-kode01-noir/60">
                                            ${Number(order.amount).toLocaleString(locale)}
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-black text-kode01-noir hidden sm:table-cell">
                                            ${Number(order.seller_payout).toLocaleString(locale)}
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5">
                                            <Badge
                                                variant="secondary"
                                                className={`border-0 font-bold ${statusColorMap[order.status] || 'bg-kode01-noir/5 text-kode01-noir/60'}`}
                                            >
                                                {statusMap[order.status] || order.status}
                                            </Badge>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right text-kode01-noir/60 hidden md:table-cell">
                                            {new Date(order.created_at).toLocaleDateString(locale)}
                                        </td>
                                    </tr>
                                ))}
                                {(orders?.length ?? 0) === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center">
                                            <p className="text-sm font-bold text-kode01-noir/65">{t('orders_page.empty')}</p>
                                            <p className="mt-1 text-xs text-kode01-noir/45">{t('orders_page.empty_hint')}</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 border-t border-kode01-noir/5 px-3 sm:px-6 py-3 sm:py-4">
                            {page > 1 && (
                                <Link
                                    href={buildUrl({ page: String(page - 1) })}
                                    className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold text-kode01-noir/60 hover:bg-black/5"
                                >
                                    Prev
                                </Link>
                            )}
                            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                const pageNum = i + 1;
                                return (
                                    <Link
                                        key={pageNum}
                                        href={buildUrl({ page: String(pageNum) })}
                                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                                            page === pageNum
                                                ? 'bg-kode01-pink text-kode01-noir'
                                                : 'text-kode01-noir/40 hover:bg-black/5'
                                        }`}
                                    >
                                        {pageNum}
                                    </Link>
                                );
                            })}
                            {page < totalPages && (
                                <Link
                                    href={buildUrl({ page: String(page + 1) })}
                                    className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold text-kode01-noir/60 hover:bg-black/5"
                                >
                                    Next
                                </Link>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <VendorOrderIncidentsPanel locale={locale} />
        </DashboardShell>
    );
}

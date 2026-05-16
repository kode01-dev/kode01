import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Wallet, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ManageStripeButton } from '@/features/dashboard/components/ManageStripeButton';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';

export default async function VendorPayoutsPage(
    props: { params: Promise<{ locale: string }> }
) {
    const { locale } = await props.params;
    const t = await getTranslations('dashboard.vendor');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}`);
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled')
        .eq('id', user.id)
        .single();

    if (!profile || !isSellerRole(profile.role)) {
        redirect(`/${locale}`);
    }

    const canSell = Boolean(profile.stripe_account_id)
        && profile.stripe_charges_enabled === true
        && profile.stripe_payouts_enabled === true;

    // Aggregate revenue data from completed purchases
    const { data: purchases } = await supabase
        .from('purchases')
        .select('amount, seller_payout, commission_kode01, product_id, products(title)')
        .eq('seller_id', user.id)
        .eq('status', 'completed');

    const totalRevenue = purchases?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const totalPayout = purchases?.reduce((sum, p) => sum + Number(p.seller_payout), 0) || 0;
    const totalFees = purchases?.reduce((sum, p) => sum + Number(p.commission_kode01), 0) || 0;

    // Group by product
    const productMap = new Map<string, { title: string; sales: number; revenue: number; payout: number }>();
    for (const p of purchases ?? []) {
        const productTitle = ((p.products as unknown) as { title: string })?.title || 'Unknown';
        const productId = p.product_id;
        const existing = productMap.get(productId) || { title: productTitle, sales: 0, revenue: 0, payout: 0 };
        existing.sales += 1;
        existing.revenue += Number(p.amount);
        existing.payout += Number(p.seller_payout);
        productMap.set(productId, existing);
    }
    const productBreakdown = Array.from(productMap.values()).sort((a, b) => b.payout - a.payout);

    return (
        <DashboardShell role="vendor" locale={locale} title={t('payouts_page.title')} subtitle={t('payouts_page.subtitle')}>
            {/* Summary Cards */}
            <div className="grid gap-3 sm:gap-4 md:grid-cols-3 mb-8">
                <Card className="rounded-[24px] border-kode01-noir/5 bg-kode01-white shadow-sm">
                    <CardContent className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-kode01-pink/10">
                            <DollarSign size={22} className="text-kode01-pink" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">{t('payouts_page.total_revenue')}</p>
                            <p className="text-2xl font-black text-kode01-noir">${totalRevenue.toLocaleString(locale)}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/30 mt-0.5">{t('payouts_page.all_time')}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="rounded-[24px] border-kode01-noir/5 bg-kode01-white shadow-sm">
                    <CardContent className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-kode01-green/10">
                            <Wallet size={22} className="text-kode01-green" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">{t('payouts_page.total_payout')}</p>
                            <p className="text-2xl font-black text-kode01-noir">${totalPayout.toLocaleString(locale)}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/30 mt-0.5">{t('payouts_page.all_time')}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="rounded-[24px] border-kode01-noir/5 bg-kode01-white shadow-sm">
                    <CardContent className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-kode01-blue/10">
                            <TrendingUp size={22} className="text-kode01-blue" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">{t('payouts_page.platform_fees')}</p>
                            <p className="text-2xl font-black text-kode01-noir">${totalFees.toLocaleString(locale)}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/30 mt-0.5">{t('payouts_page.all_time')}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Manage Stripe Button */}
            {canSell && (
                <div className="flex justify-end mb-6">
                    <ManageStripeButton />
                </div>
            )}

            {/* Product Breakdown */}
            <Card className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardHeader className="border-b border-kode01-noir/5 pb-6">
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                        {t('payouts_page.breakdown_title')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-kode01-noir/5 bg-kode01-noir/[0.02]">
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('payouts_page.columns.product')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('payouts_page.columns.sales')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden sm:table-cell">{t('payouts_page.columns.revenue')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('payouts_page.columns.payout')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productBreakdown.map((product, i) => (
                                    <tr key={i} className="border-t border-kode01-noir/5 hover:bg-kode01-noir/5 transition-colors group">
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir">{product.title}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-bold text-kode01-noir/60">{product.sales}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-bold text-kode01-noir/60 hidden sm:table-cell">${product.revenue.toLocaleString(locale)}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-black text-kode01-noir">${product.payout.toLocaleString(locale)}</td>
                                    </tr>
                                ))}
                                {productBreakdown.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-10 text-center">
                                            <p className="text-sm font-bold text-kode01-noir/65">{t('payouts_page.empty')}</p>
                                            <p className="mt-1 text-xs text-kode01-noir/45">{t('payouts_page.empty_hint')}</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </DashboardShell>
    );
}

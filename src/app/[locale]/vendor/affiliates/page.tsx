import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';

export default async function VendorAffiliatesPage(
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
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !isSellerRole(profile.role)) {
        redirect(`/${locale}`);
    }

    const { data: affiliates } = await supabase
        .from('affiliates')
        .select(`
            id,
            affiliate_code,
            commission_rate,
            products!inner(title),
            profiles!inner(full_name, avatar_url)
        `)
        .eq('products.seller_id', user.id);

    return (
        <DashboardShell role="vendor" locale={locale} title={t('affiliates_page.title')} subtitle={t('affiliates_page.subtitle')}>
            <Card className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardHeader className="border-b border-kode01-noir/5 pb-6">
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir flex items-center gap-2">
                        <Users className="text-kode01-blue" size={20} />
                        {t('my_affiliates')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-kode01-noir/5 bg-kode01-noir/[0.02]">
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('affiliate_columns.affiliate')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden sm:table-cell">{t('affiliate_columns.product')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('affiliate_columns.code')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('affiliate_columns.commission')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(affiliates ?? []).map((aff) => (
                                    <tr key={aff.id} className="border-t border-kode01-noir/5 hover:bg-kode01-noir/5 transition-colors group">
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir">{((aff.profiles as unknown) as { full_name: string })?.full_name || t('anonymous_user')}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir/70 hidden sm:table-cell">{((aff.products as unknown) as { title: string })?.title}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5">
                                            <code className="px-2 py-1 bg-kode01-noir/5 rounded text-xs font-mono font-bold text-kode01-blue">
                                                {aff.affiliate_code}
                                            </code>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-black text-kode01-noir">{aff.commission_rate}%</td>
                                    </tr>
                                ))}
                                {(affiliates?.length ?? 0) === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-3 sm:px-6 py-10 text-center">
                                            <p className="text-sm font-bold text-kode01-noir/65">{t('empty_affiliates')}</p>
                                            <p className="mt-1 text-xs text-kode01-noir/45">{t('empty_affiliates_hint')}</p>
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

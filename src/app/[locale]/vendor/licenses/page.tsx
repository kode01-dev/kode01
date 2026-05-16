import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VendorLicenseToggle } from '@/features/dashboard/components/VendorLicenseToggle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';
import { VendorWebhookConfig } from './VendorWebhookConfig';

export default async function VendorLicensesPage(
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

    const { data: products } = await supabase
        .from('products')
        .select('id, title, generates_license_key')
        .eq('seller_id', user.id);

    const { data: integration } = await supabase
        .from('vendor_license_integrations')
        .select('webhook_url, api_secret, webhook_secret, enabled')
        .eq('seller_id', user.id)
        .single();

    return (
        <DashboardShell role="vendor" locale={locale} title={t('licenses_page.title')} subtitle={t('licenses_page.subtitle')}>
            {/* License Toggle Per Product */}
            <Card className="border-kode01-noir/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden mb-8">
                <CardHeader className="border-b border-kode01-noir/5 pb-6">
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                        {t('licenses_page.title')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-kode01-noir/5 bg-kode01-noir/[0.02]">
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('columns.product')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('columns.license_auto')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(products ?? []).map((product) => (
                                    <tr key={product.id} className="border-t border-kode01-noir/5 hover:bg-kode01-noir/5 transition-colors group">
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir">{product.title}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5">
                                            <VendorLicenseToggle
                                                productId={product.id}
                                                initialEnabled={Boolean(product.generates_license_key)}
                                                enabledLabel={t('license_toggle.enabled')}
                                                disabledLabel={t('license_toggle.disabled')}
                                                savingLabel={t('license_toggle.saving')}
                                                errorLabel={t('license_toggle.error')}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {(products?.length ?? 0) === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-6 py-10 text-center">
                                            <p className="text-sm font-bold text-kode01-noir/65">{t('empty_products')}</p>
                                            <p className="mt-1 text-xs text-kode01-noir/45">{t('empty_products_hint')}</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Webhook Configuration */}
            <VendorWebhookConfig
                initialWebhookUrl={integration?.webhook_url || ''}
                initialApiSecret={integration?.api_secret || ''}
                initialWebhookSecret={integration?.webhook_secret || ''}
                initialEnabled={integration?.enabled || false}
            />
        </DashboardShell>
    );
}

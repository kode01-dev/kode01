import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ManageStripeButton } from '@/features/dashboard/components/ManageStripeButton';
import { VendorLicenseToggle } from '@/features/dashboard/components/VendorLicenseToggle';
import { computeProductHealth, GRADE_COLORS, type ProductHealthInput } from '@/features/dashboard/lib/productHealthScore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';

export default async function VendorProductsPage(
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
        .select('role, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_id')
        .eq('id', user.id)
        .single();

    if (!profile || !isSellerRole(profile.role)) {
        redirect(`/${locale}`);
    }

    const canSell = isSellerRole(profile.role)
        && Boolean(profile.stripe_account_id)
        && profile.stripe_charges_enabled === true
        && profile.stripe_payouts_enabled === true;

    // Select base columns (cover_url, gallery_urls, tags, file_url may not be in generated types yet)
    const { data: realProducts } = await supabase
        .from('products')
        .select(`
            id,
            title,
            description,
            status,
            generates_license_key,
            purchases(amount)
        `)
        .eq('seller_id', user.id);

    // Fetch extended columns separately to avoid Supabase type errors
    // (cover_url, gallery_urls, tags, file_url added via migration but types not regenerated)
    const productIds = (realProducts ?? []).map((p) => p.id);
    let extendedMap = new Map<string, { cover_image_url: string | null; gallery_urls: string[]; tags: string[]; file_path_vault: string | null }>();
    if (productIds.length > 0) {
        try {
            const { data: extData } = await supabase
                .from('products')
                .select('id, cover_image_url, gallery_urls, tags, file_path_vault')
                .in('id', productIds) as { data: { id: string; cover_image_url: string | null; gallery_urls: string[] | null; tags: string[] | null; file_path_vault: string | null }[] | null };
            if (extData) {
                extendedMap = new Map(extData.map((e) => [e.id, {
                    cover_image_url: e.cover_image_url,
                    gallery_urls: e.gallery_urls ?? [],
                    tags: e.tags ?? [],
                    file_path_vault: e.file_path_vault,
                }]));
            }
        } catch {
            // Columns don't exist yet — health score will use defaults
        }
    }

    const products = (realProducts ?? []).map(p => {
        const sales = (p.purchases as { amount: number }[])?.length || 0;
        const ext = extendedMap.get(p.id);
        const healthInput: ProductHealthInput = {
            title: p.title || '',
            description: p.description,
            coverUrl: ext?.cover_image_url ?? null,
            galleryCount: ext?.gallery_urls?.length ?? 0,
            tagCount: ext?.tags?.length ?? 0,
            hasFile: Boolean(ext?.file_path_vault),
            salesCount: sales,
            viewCount: 0,
            reviewCount: 0,
        };
        const health = computeProductHealth(healthInput);

        return {
            id: p.id,
            name: p.title,
            status: p.status,
            generatesLicenseKey: p.generates_license_key,
            sales,
            revenue: `$${((p.purchases as { amount: number }[])?.reduce((sum: number, sell: { amount: number }) => sum + Number(sell.amount), 0) || 0).toLocaleString(locale)}`,
            health,
        };
    });

    return (
        <DashboardShell role="vendor" locale={locale} title={t('products_page.title')} subtitle={t('products_page.subtitle')}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                <div className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                    {!canSell ? t('new_product_locked') : t('new_product_ready')}
                </div>
                <div className="flex items-center gap-3">
                    {canSell ? <ManageStripeButton /> : null}
                    <Button asChild className="bg-kode01-pink hover:bg-kode01-pink/90 text-kode01-white gap-2 font-bold shadow-sm hover:shadow-md transition-all rounded-full h-10 px-6">
                        <Link href={`/${locale}/vendor/products/new`}>
                            <Plus size={18} />
                            {t('new_product')}
                        </Link>
                    </Button>
                </div>
            </div>
            {!canSell ? (
                <p className="mb-8 text-sm text-kode01-noir/60">
                    {t('stripe_connect_description')}
                </p>
            ) : null}

            <Card className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardHeader className="border-b border-black/5 pb-6">
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                        {t('my_products')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-black/5 bg-black/[0.02]">
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('columns.product')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-center text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden sm:table-cell">Health</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('columns.status')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hidden sm:table-cell">{t('columns.license_auto')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('columns.sales')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('columns.revenue')}</th>
                                    <th className="px-3 sm:px-6 py-3 sm:py-4 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product.id} className="border-t border-black/5 hover:bg-black/5 transition-colors group">
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 font-bold text-kode01-noir">{product.name}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-center hidden sm:table-cell">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${GRADE_COLORS[product.health.grade].bg} ${GRADE_COLORS[product.health.grade].text}`}>
                                                            {product.health.grade}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-xs">
                                                        <p className="font-bold">Score: {product.health.score}/100</p>
                                                        {product.health.tips.length > 0 && (
                                                            <ul className="mt-1 text-xs space-y-0.5">
                                                                {product.health.tips.map((tip, i) => (
                                                                    <li key={i}>- {tip}</li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5">
                                            <Badge
                                                variant={product.status === 'published' ? 'default' : 'secondary'}
                                                className={
                                                    product.status === 'published'
                                                        ? 'bg-kode01-green/10 text-kode01-green border-0 font-bold'
                                                        : 'bg-black/5 text-kode01-noir/60 border-0 font-bold'
                                                }
                                            >
                                                {product.status === 'published'
                                                    ? t('status_published')
                                                    : product.status === 'draft'
                                                        ? t('status_draft')
                                                    : product.status}
                                            </Badge>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 hidden sm:table-cell">
                                            <VendorLicenseToggle
                                                productId={product.id}
                                                initialEnabled={Boolean(product.generatesLicenseKey)}
                                                enabledLabel={t('license_toggle.enabled')}
                                                disabledLabel={t('license_toggle.disabled')}
                                                savingLabel={t('license_toggle.saving')}
                                                errorLabel={t('license_toggle.error')}
                                            />
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-bold text-kode01-noir/60">{product.sales}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right font-black text-kode01-noir">{product.revenue}</td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-5 text-right">
                                            <Button asChild variant="outline" size="sm" className="gap-2 rounded-full font-bold">
                                                <Link href={`/${locale}/vendor/products/${product.id}/edit`}>
                                                    <Pencil size={14} />
                                                    Edit
                                                </Link>
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {products.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-10 text-center">
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
        </DashboardShell>
    );
}

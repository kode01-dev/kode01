import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { MarketTaxonomyManager } from '@/features/admin/market-taxonomy/components/MarketTaxonomyManager';
import { loadAdminMarketTaxonomyPageData } from '@/features/admin/market-taxonomy/server/admin-market-taxonomy-page-data';

export default async function AdminMarketTaxonomyPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.admin.market_taxonomy');
  const pageDataResult = await loadAdminMarketTaxonomyPageData(locale);
  if (pageDataResult.kind === 'redirect') {
    redirect(pageDataResult.destination);
  }
  const { categories, subcategories } = pageDataResult.data;

  return (
    <DashboardShell role="admin" locale={locale} title={t('title')} subtitle={t('subtitle')}>
      <MarketTaxonomyManager initialCategories={categories} initialSubcategories={subcategories} />
    </DashboardShell>
  );
}

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/features/dashboard';
import { loadReviewHubData } from '@/features/reviews-hub/server/load-review-hub-data';
import { ReviewsHubPanel } from '@/features/reviews-hub/components/ReviewsHubPanel';

type BuyerReviewsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ product?: string }>;
};

export default async function BuyerReviewsPage({ params, searchParams }: BuyerReviewsPageProps) {
  const { locale } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialProductSlug = typeof resolvedSearchParams.product === 'string'
    ? resolvedSearchParams.product
    : null;
  const t = await getTranslations('dashboard.reviews');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const entries = await loadReviewHubData(supabase, user.id);

  return (
    <DashboardShell role="buyer" locale={locale} title={t('title')} subtitle={t('subtitle')}>
      <ReviewsHubPanel entries={entries} initialProductSlug={initialProductSlug} />
    </DashboardShell>
  );
}


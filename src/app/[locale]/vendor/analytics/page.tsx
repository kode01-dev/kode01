import { DashboardShell } from '@/features/dashboard';
import { DashboardAnalytics } from '@/features/dashboard/components/DashboardAnalytics';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';

export default async function VendorAnalyticsPage(
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

    return (
        <DashboardShell role="vendor" locale={locale} title={t('analytics_page.title')} subtitle={t('analytics_page.subtitle')}>
            <DashboardAnalytics />
        </DashboardShell>
    );
}

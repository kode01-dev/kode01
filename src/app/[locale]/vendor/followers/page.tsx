import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';
import { getCreatorFollowers } from '@/features/creators/actions/follow-actions';
import { FollowersPageContent } from '@/features/creators/components/FollowersPageContent';

export default async function VendorFollowersPage(
    props: { params: Promise<{ locale: string }> }
) {
    const { locale } = await props.params;
    const t = await getTranslations('dashboard.followers');
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

    const { followers, stats, error } = await getCreatorFollowers();

    return (
        <DashboardShell role="vendor" locale={locale} title={t('title')} subtitle={t('subtitle')}>
            <FollowersPageContent
                followers={followers}
                stats={stats}
                error={error}
                locale={locale}
            />
        </DashboardShell>
    );
}

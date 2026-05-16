import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getFollowedCreators, getFollowedCreatorsActivity } from '@/features/creators/actions/follow-actions';
import { FollowingPageContent } from '@/features/creators/components/FollowingPageContent';

export default async function FollowingPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('dashboard.following');

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

    const role = (profile?.role === 'admin' ? 'admin' : profile?.role === 'seller' ? 'vendor' : 'buyer') as 'admin' | 'vendor' | 'buyer';

    const { creators, error: creatorsError } = await getFollowedCreators();
    const { activity, error: activityError } = await getFollowedCreatorsActivity();

    return (
        <DashboardShell role={role} locale={locale} title={t('title')} subtitle={t('subtitle')}>
            <FollowingPageContent
                creators={creators}
                activity={activity}
                creatorsError={creatorsError}
                activityError={activityError}
                locale={locale}
            />
        </DashboardShell>
    );
}

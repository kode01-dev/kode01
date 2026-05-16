import { BotActivityList } from '@/features/admin/bot-activity/components/BotActivityList';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function AdminBotActivityPage(
    props: { params: Promise<{ locale: string }> }
) {
    const { locale } = await props.params;
    const t = await getTranslations('dashboard.admin.bot_activity_page');
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

    if (profile?.role !== 'admin') {
        redirect(`/${locale}`);
    }

    return (
        <DashboardShell
            role="admin"
            locale={locale}
            title={t('title')}
            subtitle={t('subtitle')}
        >
            <div className="mt-8">
                <BotActivityList locale={locale} />
            </div>
        </DashboardShell>
    );
}

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard';
import { SeoBlogAgentAdminPanel } from '@/features/seo-blog-agent/components/SeoBlogAgentAdminPanel';
import { createClient } from '@/lib/supabase/server';

export default async function AdminSeoBlogAgentPage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.admin');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    redirect(`/${locale}/admin`);
  }

  return (
    <DashboardShell
      role="admin"
      locale={locale}
      title={t('seo_blog_agent_title')}
      subtitle={t('seo_blog_agent_subtitle')}
    >
      <SeoBlogAgentAdminPanel locale={locale} />
    </DashboardShell>
  );
}

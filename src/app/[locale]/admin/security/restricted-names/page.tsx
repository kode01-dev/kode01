import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getRestrictedNames } from '@/features/admin/security/server/restricted-names-repository';
import { RestrictedNamesList } from '@/features/admin/security/components/RestrictedNamesList';
import { RestrictedNameForm } from '@/features/admin/security/components/RestrictedNameForm';
import { getTranslations } from 'next-intl/server';

export default async function RestrictedNamesPage(
  props: { params: Promise<{ locale: string }> }
) {
  const { locale } = await props.params;
  const t = await getTranslations('dashboard.admin.restricted_shop_names');
  
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

  const restrictedNames = await getRestrictedNames();
  const tableTitle = t('table.title');

  return (
    <DashboardShell
      role="admin"
      locale={locale}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      <div className="mt-8 space-y-8 max-w-5xl">
        <RestrictedNameForm />
        
        <div className="space-y-4">
          <h2 className="text-xl font-serif font-black text-kode01-noir">
            {tableTitle}
          </h2>
          <RestrictedNamesList initialData={restrictedNames} locale={locale} />
        </div>
      </div>
    </DashboardShell>
  );
}

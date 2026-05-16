import { getTranslations } from 'next-intl/server';
import { Bookmark } from 'lucide-react';
import { DashboardShell } from '@/features/dashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function SavedItemsPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('dashboard.saved');

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

    return (
        <DashboardShell role={role} locale={locale} title={t('title')} subtitle={t('subtitle')}>
            <div className="max-w-[1440px] mx-auto w-full">
                <div className="py-24 bg-white/50 rounded-[40px] border border-black/5 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <Bookmark size={28} className="text-kode01-noir/20" />
                    </div>
                    <h3 className="text-xl font-bold text-kode01-noir mb-2">{t('empty_title')}</h3>
                    <p className="text-kode01-noir/60 mb-8 max-w-sm">{t('empty_description')}</p>
                </div>
            </div>
        </DashboardShell>
    );
}

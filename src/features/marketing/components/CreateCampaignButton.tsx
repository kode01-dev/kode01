'use client';

import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

export function CreateCampaignButton() {
  const router = useRouter();
  const t = useTranslations('dashboard.admin.marketing');

  return (
    <button
      onClick={() => router.push('/admin/marketing/create')}
      className="flex items-center gap-2 px-6 py-3 bg-kode01-noir text-kode01-white rounded-full font-bold text-[10px] uppercase tracking-widest hover:bg-kode01-noir/90 transition-all active:scale-95 shadow-sm"
    >
      <Plus size={14} />
      {t('create_campaign')}
    </button>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Calendar } from 'lucide-react';
import { type RestrictedName } from '../server/restricted-names-repository';
import { deleteRestrictedNameAction } from '../actions/restricted-names-actions';
import { toast } from 'sonner';

interface RestrictedNamesListProps {
  initialData: RestrictedName[];
  locale: string;
}

export function RestrictedNamesList({ initialData, locale }: RestrictedNamesListProps) {
  const t = useTranslations('dashboard.admin.restricted_shop_names');

  async function handleDelete(id: string, keyword: string) {
    if (!confirm(t('delete_confirm'))) return;

    try {
      const res = await deleteRestrictedNameAction(id, keyword);
      if (res.success) {
        toast.success(t('messages.delete_success'));
      } else {
        toast.error(res.error || t('messages.error'));
      }
    } catch {
      toast.error(t('messages.error'));
    }
  }

  return (
    <Card className="border-black/5 bg-kode01-white rounded-[24px] shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black/5 bg-kode01-noir/[0.02]">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.keyword')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.type')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.reason')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.created_at')}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {initialData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-kode01-noir/40">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                initialData.map((item) => (
                  <tr key={item.id} className="hover:bg-kode01-noir/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-kode01-noir">{item.keyword}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={`rounded-full uppercase tracking-tighter text-[9px] px-2 py-0 ${item.is_regex ? 'bg-kode01-blue/10 text-kode01-blue border-kode01-blue/20' : 'bg-kode01-noir/5 text-kode01-noir/60 border-black/5'}`}>
                        {item.is_regex ? t('types.regex') : t('types.literal')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-kode01-noir/60">{item.reason || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-kode01-noir/40">
                        <Calendar size={12} />
                        <span>{new Date(item.created_at).toLocaleDateString(locale)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id, item.keyword)}
                        className="text-kode01-noir/30 hover:text-kode01-pink hover:bg-kode01-pink/10 rounded-full h-8 w-8"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

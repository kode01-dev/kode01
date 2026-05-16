'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Plus, Loader2 } from 'lucide-react';
import { addRestrictedNameAction } from '../actions/restricted-names-actions';
import { toast } from 'sonner';

export function RestrictedNameForm() {
  const t = useTranslations('dashboard.admin.restricted_shop_names');
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [reason, setReason] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    try {
      const res = await addRestrictedNameAction({
        keyword: keyword.trim(),
        is_regex: isRegex,
        reason: reason.trim() || undefined,
      });

      if (res.success) {
        toast.success(t('messages.add_success'));
        setKeyword('');
        setReason('');
        setIsRegex(false);
      } else {
        toast.error(res.error || t('messages.error'));
      }
    } catch {
      toast.error(t('messages.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-black/5 bg-kode01-white rounded-[24px] shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="text-kode01-pink" size={20} />
          {t('add_keyword')}
        </CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="keyword">{t('table.keyword')}</Label>
              <Input
                id="keyword"
                placeholder={t('keyword_placeholder')}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                required
                className="rounded-xl border-black/10 focus:ring-kode01-blue"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">{t('table.reason')}</Label>
              <Input
                id="reason"
                placeholder={t('reason_placeholder')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-xl border-black/10 focus:ring-kode01-blue"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="is-regex"
              type="checkbox"
              checked={isRegex}
              onChange={(event) => setIsRegex(event.target.checked)}
              className="h-4 w-4 rounded border-black/20 text-kode01-noir focus:ring-kode01-blue"
            />
            <Label htmlFor="is-regex" className="cursor-pointer">{t('is_regex')}</Label>
          </div>

          <Button 
            type="submit" 
            disabled={loading || !keyword.trim()}
            className="w-full md:w-auto bg-kode01-noir hover:bg-kode01-noir/90 text-white rounded-xl px-8"
          >
            {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Plus className="mr-2" size={16} />}
            {loading ? t('adding') : t('submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

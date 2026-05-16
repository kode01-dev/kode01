'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';

type AdminBundleRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  status: 'draft' | 'published' | 'archived' | string;
  sellerId: string;
  sellerName: string;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
};

type AdminBundlesResponse = {
  data?: AdminBundleRow[];
  error?: string;
};

function statusBadgeClass(status: string): string {
  if (status === 'published') return 'border-0 bg-kode01-green/15 text-kode01-green';
  if (status === 'archived') return 'border-0 bg-black/10 text-kode01-noir/65';
  return 'border-0 bg-kode01-blue/15 text-kode01-blue';
}

function EditableRow({
  row,
  onUpdated,
}: {
  row: AdminBundleRow;
  onUpdated: () => Promise<void>;
}) {
  const t = useTranslations('dashboard.admin.bundles_panel');
  const [price, setPrice] = useState(String(row.price));
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>(
    row.status === 'published' || row.status === 'archived' ? row.status : 'draft',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrice(String(row.price));
    setStatus(row.status === 'published' || row.status === 'archived' ? row.status : 'draft');
    setError(null);
  }, [row.id, row.price, row.status]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/bundles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          price: Number(price || '0'),
          status,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t('errors.update_failed_with_status', { status: response.status }));
      }
      await onUpdated();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('errors.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-black/5 align-top">
      <td className="px-4 py-4">
        <p className="font-bold text-kode01-noir">{row.title}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-kode01-noir/45">/{row.slug}</p>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-kode01-noir/70">{row.sellerName}</td>
      <td className="px-4 py-4">
        <Badge variant="secondary" className={statusBadgeClass(row.status)}>
          {row.status}
        </Badge>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-kode01-noir/70">{row.itemsCount}</td>
      <td className="px-4 py-4">
        <div className="flex min-w-[220px] flex-col gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="h-9"
          />
          <select
            value={status}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'draft' || value === 'published' || value === 'archived') {
                setStatus(value);
              }
            }}
            className="h-9 rounded-md border border-black/10 px-3 text-sm"
          >
            <option value="draft">{t('status.draft')}</option>
            <option value="published">{t('status.published')}</option>
            <option value="archived">{t('status.archived')}</option>
          </select>
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              void save();
            }}
            className="h-9 rounded-full bg-kode01-noir text-xs font-bold uppercase tracking-widest text-white hover:bg-kode01-noir/90"
          >
            {saving ? t('actions.saving') : t('actions.save')}
          </Button>
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
        </div>
      </td>
    </tr>
  );
}

export function AdminBundlesPanel({ locale }: { locale: string }) {
  void locale;
  const t = useTranslations('dashboard.admin.bundles_panel');
  const [rows, setRows] = useState<AdminBundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/bundles', { method: 'GET' });
      const payload = await response.json().catch(() => null) as AdminBundlesResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? t('errors.load_failed_with_status', { status: response.status }));
      }
      setRows(payload?.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('errors.load_failed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  return (
    <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl font-serif font-black text-kode01-noir">
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-kode01-noir/60">{t('states.loading')}</p>
        ) : error ? (
          <p className="text-sm font-semibold text-red-700">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-kode01-noir/60">{t('states.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 bg-black/[0.02]">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {t('table.bundle')}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {t('table.seller')}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {t('table.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {t('table.items')}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {t('table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <EditableRow
                    key={row.id}
                    row={row}
                    onUpdated={fetchRows}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

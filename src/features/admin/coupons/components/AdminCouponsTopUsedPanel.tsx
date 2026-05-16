'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type CouponStatsRow = {
  id: string;
  code: string;
  vendorId: string | null;
  vendorName: string;
  type: 'percentage' | 'fixed';
  value: number;
  currentUses: number;
  maxUses: number | null;
  isActive: boolean;
  createdAt: string;
  amountSaved: number;
};

type ApiResponse = {
  data?: {
    generatedAt: string;
    totals: {
      coupons: number;
      redemptions: number;
      amountSaved: number;
    };
    rows: CouponStatsRow[];
  };
  error?: string;
};

export function AdminCouponsTopUsedPanel({ locale }: { locale: string }) {
  const isFr = locale === 'fr';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CouponStatsRow[]>([]);
  const [totals, setTotals] = useState<{ coupons: number; redemptions: number; amountSaved: number }>({
    coupons: 0,
    redemptions: 0,
    amountSaved: 0,
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/coupons/top-used', { method: 'GET' });
      const payload = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `Failed to load coupon stats (${response.status})`);
      }
      setRows(payload?.data?.rows ?? []);
      setTotals(payload?.data?.totals ?? { coupons: 0, redemptions: 0, amountSaved: 0 });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : (isFr ? 'Chargement impossible.' : 'Failed to load.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [isFr]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const topRows = useMemo(() => rows.slice(0, 25), [rows]);

  return (
    <Card className="rounded-[28px] border-black/10 bg-kode01-white shadow-sm">
      <CardHeader className="space-y-3">
        <CardTitle className="text-2xl font-serif font-black text-kode01-noir">
          {isFr ? 'Coupons les plus utilisés' : 'Most used coupons'}
        </CardTitle>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-kode01-noir/65">
          <span className="rounded-full bg-kode01-sauge/15 px-3 py-1">
            {isFr ? 'Coupons' : 'Coupons'}: {totals.coupons}
          </span>
          <span className="rounded-full bg-kode01-sauge/15 px-3 py-1">
            {isFr ? 'Utilisations' : 'Redemptions'}: {totals.redemptions}
          </span>
          <span className="rounded-full bg-kode01-sauge/15 px-3 py-1">
            {isFr ? 'Économies totales' : 'Total saved'}: ${totals.amountSaved.toFixed(2)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-kode01-noir/60">{isFr ? 'Chargement...' : 'Loading...'}</p>
        ) : error ? (
          <p className="text-sm font-semibold text-red-700">{error}</p>
        ) : topRows.length === 0 ? (
          <p className="text-sm text-kode01-noir/60">{isFr ? 'Aucun coupon pour le moment.' : 'No coupons yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 bg-black/[0.02]">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {isFr ? 'Code' : 'Code'}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {isFr ? 'Vendeur' : 'Vendor'}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {isFr ? 'Réduction' : 'Discount'}
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {isFr ? 'Utilisations' : 'Uses'}
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {isFr ? 'Économies' : 'Saved'}
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                    {isFr ? 'Statut' : 'Status'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((row) => (
                  <tr key={row.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-bold text-kode01-noir">{row.code}</td>
                    <td className="px-4 py-3 text-kode01-noir/75">{row.vendorName}</td>
                    <td className="px-4 py-3 text-kode01-noir/75">
                      {row.type === 'percentage' ? `${row.value}%` : `$${row.value.toFixed(2)} CAD`}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-kode01-noir/75">
                      {row.currentUses}
                      {row.maxUses != null ? ` / ${row.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-kode01-noir/75">
                      ${row.amountSaved.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={row.isActive ? 'border-0 bg-kode01-green/15 text-kode01-green' : 'border-0 bg-black/10 text-kode01-noir/65'}
                      >
                        {row.isActive ? (isFr ? 'Actif' : 'Active') : (isFr ? 'Inactif' : 'Inactive')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

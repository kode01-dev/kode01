'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, Loader2 } from 'lucide-react';

interface BlueprintRow {
  id: string;
  product_id: string;
  is_vetted: boolean;
  license_type: string;
  created_at: string;
  manifest: { name?: string } | null;
  product_title?: string;
  seller_name?: string;
}

interface BlueprintVettingPanelProps {
  locale: string;
}

export function BlueprintVettingPanel({
  locale,
}: BlueprintVettingPanelProps): React.JSX.Element {
  const [blueprints, setBlueprints] = useState<BlueprintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);

  useEffect(() => {
    loadBlueprints();
  }, []);

  async function loadBlueprints() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/agent-blueprints/vet');
      if (res.ok) {
        const data = await res.json();
        setBlueprints(data.blueprints ?? []);
      }
    } catch (err) {
      console.error('Failed to load blueprints:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleVet(blueprintId: string, isVetted: boolean) {
    setActionLoading(blueprintId);
    try {
      const res = await fetch('/api/admin/agent-blueprints/vet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprint_id: blueprintId, is_vetted: isVetted }),
      });
      if (res.ok) {
        setBlueprints((prev) =>
          prev.map((bp) =>
            bp.id === blueprintId ? { ...bp, is_vetted: isVetted } : bp,
          ),
        );
      }
    } catch (err) {
      console.error('Vet action failed:', err);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-kode01-noir/40">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (blueprints.length === 0) {
    return (
      <p className="text-sm text-kode01-noir/50 py-8 text-center">
        {t('No blueprints to review.', 'Aucun blueprint a examiner.')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {blueprints.map((bp) => (
        <div
          key={bp.id}
          className="flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-white p-5"
        >
          <div className="space-y-1 min-w-0">
            <p className="font-serif font-bold text-kode01-noir truncate">
              {(bp.manifest as { name?: string })?.name ?? bp.product_title ?? bp.product_id}
            </p>
            <p className="text-xs text-kode01-noir/40">
              {bp.license_type} &middot;{' '}
              {new Date(bp.created_at).toLocaleDateString(
                locale === 'fr' ? 'fr-CA' : 'en-US',
                { month: 'short', day: 'numeric', year: 'numeric' },
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {bp.is_vetted ? (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <ShieldCheck size={14} />
                  {t('Verified', 'Verifie')}
                </span>
                <button
                  onClick={() => handleVet(bp.id, false)}
                  disabled={actionLoading === bp.id}
                  className="px-4 py-2 rounded-full text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('Revoke', 'Revoquer')}
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                  <ShieldX size={14} />
                  {t('Pending', 'En attente')}
                </span>
                <button
                  onClick={() => handleVet(bp.id, true)}
                  disabled={actionLoading === bp.id}
                  className="px-4 py-2 rounded-full text-xs font-bold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('Approve', 'Approuver')}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

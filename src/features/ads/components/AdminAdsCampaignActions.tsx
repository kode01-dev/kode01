'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdCampaignStatus } from '@/features/ads/types';

type Action = 'approve' | 'reject' | 'pause' | 'resume' | 'cancel';

interface AdminAdsCampaignActionsProps {
  campaignId: string;
  status: AdCampaignStatus;
}

const actionOrderByStatus: Record<AdCampaignStatus, Action[]> = {
  draft: ['cancel'],
  pending_payment: ['cancel'],
  pending_review: ['approve', 'reject', 'cancel'],
  approved: ['cancel'],
  rejected: [],
  active: ['pause', 'cancel'],
  paused: ['resume', 'cancel'],
  completed: [],
};

function buildEndpoint(campaignId: string, action: Action): string {
  return `/api/admin/ads/campaigns/${campaignId}/${action}`;
}

export function AdminAdsCampaignActions({ campaignId, status }: AdminAdsCampaignActionsProps) {
  const t = useTranslations('dashboard.admin.ads.actions');
  const [busyAction, setBusyAction] = useState<Action | null>(null);
  const actions = actionOrderByStatus[status];

  async function runAction(action: Action) {
    if (busyAction) return;

    let payload: { reason: string } | undefined;

    if (action === 'reject') {
      const reason = window.prompt(t('prompts.reject_reason'), '');
      if (!reason) return;
      payload = { reason };
    }

    if (action === 'cancel') {
      const reason = window.prompt(t('prompts.cancel_reason'), '');
      if (!reason) return;
      const confirmed = window.confirm(t('prompts.cancel_confirm'));
      if (!confirmed) return;
      payload = { reason };
    }

    setBusyAction(action);
    try {
      const response = await fetch(buildEndpoint(campaignId, action), {
        method: 'POST',
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || t('errors.failed_action'));
      }

      window.location.reload();
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : t('errors.unable_action'));
    } finally {
      setBusyAction(null);
    }
  }

  if (actions.length === 0) return <span className="text-[10px] text-kode01-noir/30">{t('no_actions')}</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      {actions.includes('approve') && (
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => void runAction('approve')}
          className="inline-flex items-center rounded-full border border-kode01-green/30 bg-kode01-green/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-green disabled:opacity-60"
        >
          {busyAction === 'approve' ? t('pending.approve') : t('labels.approve')}
        </button>
      )}
      {actions.includes('reject') && (
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => void runAction('reject')}
          className="inline-flex items-center rounded-full border border-kode01-pink/30 bg-kode01-pink/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-pink disabled:opacity-60"
        >
          {busyAction === 'reject' ? t('pending.reject') : t('labels.reject')}
        </button>
      )}
      {actions.includes('pause') && (
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => void runAction('pause')}
          className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 disabled:opacity-60"
        >
          {busyAction === 'pause' ? t('pending.pause') : t('labels.pause')}
        </button>
      )}
      {actions.includes('resume') && (
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => void runAction('resume')}
          className="inline-flex items-center rounded-full border border-kode01-blue/30 bg-kode01-blue/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-blue disabled:opacity-60"
        >
          {busyAction === 'resume' ? t('pending.resume') : t('labels.resume')}
        </button>
      )}
      {actions.includes('cancel') && (
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={() => void runAction('cancel')}
          className="inline-flex items-center rounded-full border border-red-300 bg-red-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-700 disabled:opacity-60"
          title={t('titles.cancel_without_refund')}
        >
          {busyAction === 'cancel' ? t('pending.cancel') : t('labels.cancel_without_refund')}
        </button>
      )}
    </div>
  );
}

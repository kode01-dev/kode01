'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Edit, Trash2, Pause, Play } from 'lucide-react';
import type { MarketingCampaign } from '../types';

interface MarketingCampaignsTableProps {
  campaigns: MarketingCampaign[];
  locale: string;
}

export function MarketingCampaignsTable({
  campaigns,
  locale,
}: MarketingCampaignsTableProps) {
  const t = useTranslations('dashboard.admin.marketing');
  const router = useRouter();
  const statusLabels: Record<MarketingCampaign['status'], string> = {
    draft: t('status.draft'),
    scheduled: t('status.scheduled'),
    active: t('status.active'),
    paused: t('status.paused'),
    completed: t('status.completed'),
    archived: t('status.archived'),
  };

  const getStatusColor = (status: MarketingCampaign['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'scheduled':
        return 'bg-blue-100 text-blue-700';
      case 'paused':
        return 'bg-yellow-100 text-yellow-700';
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'archived':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: MarketingCampaign['status']) => {
    return statusLabels[status];
  };

  const calculateCTR = (views: number, clicks: number) => {
    if (views === 0) return '0.00';
    return ((clicks / views) * 100).toFixed(2);
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm(t('table.confirmDelete'))) return;

    try {
      const response = await fetch(`/api/admin/marketing/campaigns/${campaignId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete campaign');
      }

      // Reload page
      window.location.reload();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert(t('table.deleteError'));
    }
  };

  const handleToggleStatus = async (
    campaignId: string,
    newStatus: MarketingCampaign['status']
  ) => {
    try {
      const response = await fetch(`/api/admin/marketing/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update campaign');
      }

      // Reload page
      window.location.reload();
    } catch (error) {
      console.error('Error updating campaign:', error);
      alert(t('table.updateError'));
    }
  };

  if (campaigns.length === 0) {
    return (
      <div className="bg-white rounded-[24px] border border-black/5 p-8 text-center">
        <p className="text-black/60 text-sm">No campaigns yet. Create your first one!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[24px] border border-black/5 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/5 bg-black/2">
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.name')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.template')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.status')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.views')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.clicks')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.ctr')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-widest text-black/60">
                {t('table.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr
                key={campaign.id}
                className="border-b border-black/5 hover:bg-black/2 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="font-bold text-black text-sm">{campaign.name}</div>
                  <div className="text-xs text-black/50">
                    {new Date(campaign.created_at).toLocaleDateString(locale)}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-black/70">
                  {campaign.template?.name_en || 'N/A'}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(
                      campaign.status
                    )}`}
                  >
                    {getStatusLabel(campaign.status)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-sm font-bold text-black">
                  {campaign.view_count.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-sm font-bold text-black">
                  {campaign.click_count.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right text-sm font-bold text-black">
                  {calculateCTR(campaign.view_count, campaign.click_count)}%
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() =>
                        router.push(`/admin/marketing/${campaign.id}/edit`)
                      }
                      className="p-2 hover:bg-blue-100 rounded-lg transition-colors text-blue-600"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(campaign.id)}
                      className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                    {campaign.status === 'active' && (
                      <button
                        onClick={() => handleToggleStatus(campaign.id, 'paused')}
                        className="p-2 hover:bg-yellow-100 rounded-lg transition-colors text-yellow-600"
                        title="Pause"
                      >
                        <Pause size={16} />
                      </button>
                    )}
                    {campaign.status === 'paused' && (
                      <button
                        onClick={() => handleToggleStatus(campaign.id, 'active')}
                        className="p-2 hover:bg-green-100 rounded-lg transition-colors text-green-600"
                        title="Resume"
                      >
                        <Play size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */

import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Eye, TrendingUp } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AdminAdsCampaignActions } from '@/features/ads/components/AdminAdsCampaignActions';
import type { AdCampaignStatus } from '@/features/ads/types';
import {
    loadAdminAdsPageData,
    type CampaignRow,
} from '@/features/ads/server/admin-ads-page-data';

function formatMoney(value: number, locale: string, currency: string) {
    return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value.toFixed(2)));
}

export default function AdminAdsPage(
    props: { params: Promise<{ locale: string }> }
) {
    return (
        <AdminAdsContent paramsPromise={props.params} />
    );
}

async function AdminAdsContent({
    paramsPromise,
}: {
    paramsPromise: Promise<{ locale: string }>;
}) {
    const { locale } = await paramsPromise;
    const t = await getTranslations('dashboard.admin.ads');
    const pageDataResult = await loadAdminAdsPageData(locale);
    if (pageDataResult.kind === 'redirect') {
        redirect(pageDataResult.destination);
    }
    const {
        totalActive,
        pendingReview,
        totalImpressions,
        revenueSummary,
        campaignRows,
        ongoingCampaigns,
        pendingCampaigns,
        hasQueryErrors,
    } = pageDataResult.data;

    const copy = {
        campaignsInProgress: t('sections.campaigns_in_progress'),
        pendingReviewTitle: t('sections.pending_review'),
        recentCampaigns: t('sections.recent_campaigns'),
        visual: t('columns.visual'),
        info: t('columns.info'),
        manage: t('columns.manage'),
        placements: t('fields.placements'),
        format: t('fields.format'),
        duration: t('fields.duration'),
        paid: t('fields.paid'),
        destination: t('fields.destination'),
        creativeMissing: t('states.creative_missing'),
        paymentNo: t('states.no'),
        paymentYes: t('states.yes'),
        window: t('columns.window'),
        review: t('columns.review'),
        notScheduled: t('states.not_scheduled'),
        noActiveCampaigns: t('states.no_active_campaigns'),
        noPendingCampaigns: t('states.no_pending_campaigns'),
        noCampaignsFound: t('states.no_campaigns_found'),
        queryIssue: t('states.query_issue'),
        notAvailable: t('states.not_available'),
    };

    const resolveOwnerLabel = (ownerUserId: string | null): string => {
        if (!ownerUserId) return copy.notAvailable;
        return t('fields.user_short', { id: ownerUserId.slice(0, 8) });
    };

    const getPrimaryCreative = (campaign: CampaignRow) => (campaign.ad_creatives ?? [])[0] ?? null;
    const getPlacementsLabel = (campaign: CampaignRow) =>
        (campaign.ad_campaign_placements ?? [])
            .map((row) => row.ad_placements?.slug)
            .filter((slug): slug is string => Boolean(slug))
            .join(', ');

    const stats = [
        { label: t('active_campaigns'), value: totalActive || 0, icon: CheckCircle2, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
        { label: t('pending_review'), value: pendingReview || 0, icon: AlertCircle, color: 'text-kode01-pink', iconBg: 'bg-kode01-pink/10' },
        { label: t('total_revenue'), value: revenueSummary, icon: TrendingUp, color: 'text-kode01-blue', iconBg: 'bg-kode01-blue/10' },
        { label: t('total_impressions'), value: (totalImpressions || 0).toLocaleString(locale), icon: Eye, color: 'text-kode01-blue', iconBg: 'bg-kode01-blue/10' },
    ];

    return (
        <DashboardShell role="admin" locale={locale} title={t('title')} subtitle={t('subtitle')}>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm">
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.iconBg}`}>
                                    <Icon size={24} className={stat.color} />
                                </div>
                                <div>
                                    <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">
                                        {stat.label}
                                    </CardTitle>
                                    <div className="text-3xl font-serif font-black text-kode01-noir mt-1 leading-none">{stat.value}</div>
                                </div>
                            </CardHeader>
                        </Card>
                    );
                })}
            </div>

            {hasQueryErrors && (
                <Card className="mt-8 border-red-200 bg-red-50 rounded-[24px]">
                    <CardContent className="py-4 text-sm text-red-700">
                        {copy.queryIssue}
                    </CardContent>
                </Card>
            )}

            <Card className="mt-8 border-black/5 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">{copy.campaignsInProgress}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-black/5">
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.campaign')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.owner')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{copy.visual}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{copy.info}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.status')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.budget')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{copy.window}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 text-right">{copy.manage}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ongoingCampaigns.map((campaign) => (
                                    <tr key={campaign.id} className="border-b border-kode01-sauge/10 hover:bg-kode01-sauge/10 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-kode01-noir">{campaign.name}</div>
                                            <div className="text-[10px] text-kode01-noir/40">{new Date(campaign.created_at).toLocaleDateString(locale)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-kode01-noir">
                                                {resolveOwnerLabel(campaign.owner_user_id)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getPrimaryCreative(campaign) ? (
                                                <img
                                                    src={getPrimaryCreative(campaign)!.image_url}
                                                    alt={getPrimaryCreative(campaign)!.title}
                                                    className="h-16 w-28 rounded-xl object-cover border border-black/10 bg-black/5"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="text-xs text-kode01-noir/40">{copy.creativeMissing}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-kode01-noir/70 space-y-1">
                                                <div><span className="font-bold">{copy.placements}:</span> {getPlacementsLabel(campaign) || copy.notAvailable}</div>
                                                <div><span className="font-bold">{copy.format}:</span> {campaign.news_format || copy.notAvailable}</div>
                                                <div><span className="font-bold">{copy.duration}:</span> {campaign.duration_days ?? 0}d</div>
                                                <div><span className="font-bold">{copy.paid}:</span> {campaign.is_paid ? copy.paymentYes : copy.paymentNo}</div>
                                                <div className="truncate max-w-[260px]">
                                                    <span className="font-bold">{copy.destination}:</span> {getPrimaryCreative(campaign)?.destination_url || copy.notAvailable}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-kode01-green/10 text-kode01-green border-kode01-green/20">
                                                {campaign.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black text-kode01-noir">
                                            {formatMoney(
                                                Number(campaign.total_price ?? campaign.total_price_usd ?? 0),
                                                locale,
                                                campaign.currency ?? 'usd',
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-kode01-noir/60">
                                            {(campaign.start_at && campaign.end_at)
                                                ? `${new Date(campaign.start_at).toLocaleDateString(locale)} - ${new Date(campaign.end_at).toLocaleDateString(locale)}`
                                                : copy.notScheduled}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <AdminAdsCampaignActions campaignId={campaign.id} status={campaign.status as AdCampaignStatus} />
                                        </td>
                                    </tr>
                                ))}
                                {ongoingCampaigns.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-sm font-bold text-kode01-noir/30">
                                            {copy.noActiveCampaigns}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card className="mt-8 border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">{copy.pendingReviewTitle}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-black/5">
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.campaign')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.owner')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{copy.visual}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{copy.info}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.budget')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 text-right">{copy.review}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingCampaigns.map((campaign) => (
                                    <tr key={campaign.id} className="border-b border-kode01-sauge/10 hover:bg-kode01-sauge/10 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-kode01-noir">{campaign.name}</div>
                                            <div className="text-[10px] text-kode01-noir/40">{new Date(campaign.created_at).toLocaleDateString(locale)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-kode01-noir">
                                                {resolveOwnerLabel(campaign.owner_user_id)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getPrimaryCreative(campaign) ? (
                                                <img
                                                    src={getPrimaryCreative(campaign)!.image_url}
                                                    alt={getPrimaryCreative(campaign)!.title}
                                                    className="h-16 w-28 rounded-xl object-cover border border-black/10 bg-black/5"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="text-xs text-kode01-noir/40">{copy.creativeMissing}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-kode01-noir/70 space-y-1">
                                                <div><span className="font-bold">{copy.placements}:</span> {getPlacementsLabel(campaign) || copy.notAvailable}</div>
                                                <div><span className="font-bold">{copy.format}:</span> {campaign.news_format || copy.notAvailable}</div>
                                                <div><span className="font-bold">{copy.duration}:</span> {campaign.duration_days ?? 0}d</div>
                                                <div><span className="font-bold">{copy.paid}:</span> {campaign.is_paid ? copy.paymentYes : copy.paymentNo}</div>
                                                <div className="truncate max-w-[260px]">
                                                    <span className="font-bold">{copy.destination}:</span> {getPrimaryCreative(campaign)?.destination_url || copy.notAvailable}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black text-kode01-noir">
                                            {formatMoney(
                                                Number(campaign.total_price ?? campaign.total_price_usd ?? 0),
                                                locale,
                                                campaign.currency ?? 'usd',
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <AdminAdsCampaignActions campaignId={campaign.id} status={campaign.status as AdCampaignStatus} />
                                        </td>
                                    </tr>
                                ))}
                                {pendingCampaigns.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-kode01-noir/30">
                                            {copy.noPendingCampaigns}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card className="mt-8 border-kode01-sauge/10 bg-kode01-white rounded-[32px] shadow-sm overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">{copy.recentCampaigns}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-black/5">
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.campaign')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.owner')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{copy.visual}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.status')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('table.budget')}</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 text-right">{copy.manage}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaignRows.map((campaign) => (
                                    <tr key={campaign.id} className="border-b border-black/5 hover:bg-black/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-kode01-noir">{campaign.name}</div>
                                            <div className="text-[10px] text-kode01-noir/40">{new Date(campaign.created_at).toLocaleDateString(locale)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-kode01-noir">
                                                {resolveOwnerLabel(campaign.owner_user_id)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getPrimaryCreative(campaign) ? (
                                                <img
                                                    src={getPrimaryCreative(campaign)!.image_url}
                                                    alt={getPrimaryCreative(campaign)!.title}
                                                    className="h-12 w-20 rounded-lg object-cover border border-black/10 bg-black/5"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="text-xs text-kode01-noir/40">{copy.creativeMissing}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge className={cn(
                                                "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                                campaign.status === 'active' ? "bg-kode01-green/10 text-kode01-green border-kode01-green/20" :
                                                    campaign.status === 'pending_review' ? "bg-kode01-pink/10 text-kode01-pink border-kode01-pink/20" :
                                                        campaign.status === 'paused' ? "bg-amber-100 text-amber-700 border-amber-300" :
                                                            "bg-kode01-noir/10 text-kode01-noir/50 border-black/10"
                                            )}>
                                                {campaign.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-black text-kode01-noir">
                                            {formatMoney(
                                                Number(campaign.total_price ?? campaign.total_price_usd ?? 0),
                                                locale,
                                                campaign.currency ?? 'usd',
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <AdminAdsCampaignActions campaignId={campaign.id} status={campaign.status as AdCampaignStatus} />
                                        </td>
                                    </tr>
                                ))}
                                {(campaignRows.length === 0) && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-kode01-noir/30">
                                            {copy.noCampaignsFound}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </DashboardShell>
    );
}


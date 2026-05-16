import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Megaphone, BookOpen, Eye, MousePointer2, BarChart3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isAdsMemberRole } from '@/features/ads/server/access';
import { getActivePlacements, getActivePricingPlans } from '@/features/ads/server/repository';
import { AdsCampaignLauncher } from '@/features/ads/components/AdsCampaignLauncher';

type CheckoutSearchParams = {
    ad_checkout?: string;
    campaign_id?: string;
};

type CheckoutStatus = 'success' | 'cancel' | null;

function resolveCheckoutStatus(value: string | undefined): CheckoutStatus {
    if (value === 'success') return 'success';
    if (value === 'cancel') return 'cancel';
    return null;
}

function formatMoney(value: number, locale: string, currency: string) {
    return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value.toFixed(2)));
}

export default function AdvertisePage(
    props: {
        params: Promise<{ locale: string }>;
        searchParams: Promise<CheckoutSearchParams>;
    }
) {
    return (
        <AdvertiseContent paramsPromise={props.params} searchParamsPromise={props.searchParams} />
    );
}

async function AdvertiseContent({
    paramsPromise,
    searchParamsPromise,
}: {
    paramsPromise: Promise<{ locale: string }>;
    searchParamsPromise: Promise<CheckoutSearchParams>;
}) {
    const { locale } = await paramsPromise;
    const searchParams = await searchParamsPromise;
    const t = await getTranslations('dashboard.buyer.ads');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}`);
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    if (!isAdsMemberRole(profile?.role)) {
        redirect(`/${locale}`);
    }

    let campaignPlans: Array<{
        id: string;
        code: string;
        name: string;
        durationDays: number;
        basePrice: number;
        currency: string;
    }> = [];
    let placementMultipliers = { news: 1.5, newsletterFooter: 1.75 };

    try {
        const [plans, placements] = await Promise.all([getActivePricingPlans(), getActivePlacements()]);

        campaignPlans = plans
            .map((plan) => ({
                id: plan.id,
                code: plan.code,
                name: plan.name,
                durationDays: Number(plan.duration_days),
                basePrice: Number(plan.price),
                currency: typeof plan.currency === 'string' ? plan.currency : 'cad',
            }))
            .filter((plan) => Number.isFinite(plan.durationDays) && Number.isFinite(plan.basePrice))
            .sort((a, b) => a.durationDays - b.durationDays);

        const newsMultiplier = placements.find((placement) => placement.slug === 'news');
        const newsletterMultiplier = placements.find((placement) => placement.slug === 'newsletter_footer');

        placementMultipliers = {
            news: Number.isFinite(Number(newsMultiplier?.price_multiplier))
                ? Number(newsMultiplier?.price_multiplier)
                : 1.5,
            newsletterFooter: Number.isFinite(Number(newsletterMultiplier?.price_multiplier))
                ? Number(newsletterMultiplier?.price_multiplier)
                : 1.75,
        };
    } catch (error) {
        console.error('Failed to load advertising catalog for campaign launcher:', error);
    }

    // Fetch User Campaigns
    const { data: campaigns } = await supabase
        .from('ad_campaigns')
        .select(`
            id,
            name,
            status,
            total_price,
            total_price_usd,
            currency,
            created_at,
            ad_events (event_type)
        `)
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });

    // Calculate basic stats for current user
    let totalImpressions = 0;
    let totalClicks = 0;

    campaigns?.forEach(campaign => {
        const events = (campaign.ad_events as unknown as { event_type: string }[]) || [];
        totalImpressions += events.filter(e => e.event_type === 'impression').length;
        totalClicks += events.filter(e => e.event_type === 'click').length;
    });

    const stats = [
        { label: t('stats_impressions'), value: totalImpressions.toLocaleString(locale), icon: Eye, color: 'text-kode01-blue', iconBg: 'bg-kode01-blue/10' },
        { label: t('stats_clicks'), value: totalClicks.toLocaleString(locale), icon: MousePointer2, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
        { label: 'CTR', value: totalImpressions > 0 ? `${((totalClicks / totalImpressions) * 100).toFixed(2)}%` : '0%', icon: BarChart3, color: 'text-kode01-pink', iconBg: 'bg-kode01-pink/10' },
    ];
    const checkoutStatus = resolveCheckoutStatus(searchParams.ad_checkout);
    const checkoutCampaignId = searchParams.campaign_id;
    const guideHref = `/${locale}/advertise/guide`;

    return (
        <DashboardShell role="buyer" locale={locale} title={t('title')} subtitle={t('subtitle')}>
            {checkoutStatus ? (
                <div
                    className={cn(
                        'mb-6 rounded-[28px] border px-5 py-4',
                        checkoutStatus === 'success'
                            ? 'border-kode01-green/20 bg-kode01-green/10 text-kode01-green'
                            : 'border-kode01-pink/20 bg-kode01-pink/10 text-kode01-noir',
                    )}
                >
                    <p className="text-sm font-black">{t(`checkout_status.${checkoutStatus}`)}</p>
                    {checkoutCampaignId ? (
                        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-kode01-noir/60">
                            {t('checkout_status.campaign_ref', { id: checkoutCampaignId })}
                        </p>
                    ) : null}
                </div>
            ) : null}

            <div className="mb-6 flex flex-wrap justify-end gap-3">
                <a
                    href={guideHref}
                    className="inline-flex items-center gap-2 rounded-full border border-black/15 px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-kode01-noir transition-all hover:bg-black/5"
                >
                    <BookOpen size={16} /> {t('guide_button')}
                </a>

                <AdsCampaignLauncher
                    locale={locale}
                    guideHref={guideHref}
                    plans={campaignPlans}
                    multipliers={placementMultipliers}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
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

            <div className="mt-8 space-y-6">
                <h3 className="text-2xl font-serif font-black text-kode01-noir">{t('campaigns_title')}</h3>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {campaigns?.map((campaign) => (
                        <Card key={campaign.id} className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-all group">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg font-black text-kode01-noir">{campaign.name}</CardTitle>
                                        <p className="text-[10px] text-kode01-noir/40 font-bold uppercase tracking-widest">
                                            {new Date(campaign.created_at).toLocaleDateString(locale)}
                                        </p>
                                    </div>
                                    <Badge className={cn(
                                        "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                                        campaign.status === 'active' ? "bg-kode01-green/10 text-kode01-green border-kode01-green/20" :
                                            campaign.status === 'pending_review' ? "bg-kode01-pink/10 text-kode01-pink border-kode01-pink/20" :
                                                "bg-kode01-noir/10 text-kode01-noir/50 border-black/10"
                                    )}>
                                        {campaign.status}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-between items-end">
                                    <div className="text-sm font-black text-kode01-noir">
                                        {formatMoney(
                                            Number(campaign.total_price ?? campaign.total_price_usd ?? 0),
                                            locale,
                                            typeof campaign.currency === 'string' ? campaign.currency : 'usd',
                                        )}
                                    </div>
                                    <a
                                        href={`/${locale}/advertise/campaign/${campaign.id}`}
                                        className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 hover:text-kode01-noir transition-colors flex items-center gap-1"
                                    >
                                        Details <BarChart3 size={12} />
                                    </a>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {(!campaigns || campaigns.length === 0) && (
                        <div className="col-span-full py-12 text-center bg-black/5 rounded-[32px] border border-dashed border-black/10">
                            <Megaphone size={48} className="mx-auto text-kode01-noir/10 mb-4" />
                            <p className="text-sm font-bold text-kode01-noir/40">{t('no_campaigns')}</p>
                        </div>
                    )}
                </div>
            </div>
        </DashboardShell>
    );
}

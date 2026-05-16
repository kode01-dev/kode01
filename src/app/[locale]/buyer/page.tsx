import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Download, Package, Clock, Key, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BecomeVendorCard } from '@/features/dashboard/components/BecomeVendorCard';
import { BuyerQuickStart } from '@/features/onboarding/components/BuyerQuickStart';
import { ReportOrderIssueButton } from '@/features/order-incidents/components/ReportOrderIssueButton';
import { Link } from '@/i18n/routing';
import type {
    OrderIncidentDecision,
    OrderIncidentIssueType,
    OrderIncidentStatus,
} from '@/features/order-incidents/types';

const ONE_DAY_IN_MS = 1000 * 60 * 60 * 24;

function getDaysAgo(createdAt: string): number {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / ONE_DAY_IN_MS);
}

export default function BuyerDashboardPage(
    props: { params: Promise<{ locale: string }> }
) {
    return (
        <BuyerDashboardContent paramsPromise={props.params} />
    );
}

async function BuyerDashboardContent({
    paramsPromise,
}: {
    paramsPromise: Promise<{ locale: string }>;
}) {
    const { locale } = await paramsPromise;
    const t = await getTranslations('dashboard.buyer');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}`);
    }

    // Fetch user's license keys
    // RLS policy ensures they can only see keys for their own purchases
    const { data: licenseKeys } = await supabase
        .from('license_keys')
        .select(`
            id,
            key,
            status,
            uses_count,
            max_uses,
            created_at,
            products(title)
        `)
        .order('created_at', { ascending: false });

    // Fetch user's purchases
    const { data: purchasesData } = await supabase
        .from('purchases')
        .select(`
            id,
            amount,
            created_at,
            status,
            products (
                id,
                title,
                slug
            )
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

    const { data: incidentsData } = await supabase
        .from('purchase_incidents')
        .select(`
            id,
            purchase_id,
            issue_type,
            status,
            decision,
            resolution,
            created_at,
            updated_at,
            closed_at,
            evidence_urls,
            sla_deadline_at,
            refund_amount,
            products (
                title,
                slug
            )
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

    // Calculate real stats
    const totalPurchases = purchasesData?.length || 0;
    const totalDownloads = licenseKeys?.reduce((sum, key) => sum + (key.uses_count || 0), 0) || 0;
    const totalSpent = purchasesData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    const stats = [
        { label: t('stats.purchases'), value: totalPurchases.toString(), icon: ShoppingCart, color: 'text-kode01-blue', iconBg: 'bg-kode01-blue/10' },
        { label: t('stats.downloads'), value: totalDownloads.toString(), icon: Download, color: 'text-kode01-green', iconBg: 'bg-kode01-green/10' },
        { label: t('stats.spent'), value: `$${totalSpent.toFixed(2)}`, icon: Package, color: 'text-kode01-pink', iconBg: 'bg-kode01-pink/10' },
    ];

    interface PurchaseRow {
        id: string;
        amount: number | null;
        created_at: string;
        status: string | null;
        products: { id: string; title: string; slug: string | null }[] | { id: string; title: string; slug: string | null } | null;
    }

    const purchases = (purchasesData || []).map((p: PurchaseRow) => {
        const product = Array.isArray(p.products) ? p.products[0] : p.products;
        const daysAgo = getDaysAgo(p.created_at);
        const status = p.status ?? 'completed';
        const isReviewEligible = (status === 'completed' || status === 'refunded') && Boolean(product?.slug);
        const dateText = daysAgo === 0
            ? t('date.today')
            : daysAgo === 1
                ? t('date.one_day_ago')
                : daysAgo < 7
                    ? t('date.days_ago', { count: daysAgo })
                    : daysAgo < 14
                        ? t('date.one_week_ago')
                        : t('date.weeks_ago', { count: Math.floor(daysAgo / 7) });

        return {
            id: p.id,
            name: product?.title || t('unknown_product'),
            productId: product?.id || null,
            productSlug: product?.slug || null,
            date: dateText,
            price: `$${(p.amount || 0).toFixed(2)}`,
            statusLabel: status === 'completed'
                ? t('completed')
                : status === 'refunded'
                    ? t('refunded')
                    : status,
            canDownload: status === 'completed',
            isReviewEligible,
        };
    });

    type IncidentRow = {
        id: string;
        purchase_id: string;
        issue_type: OrderIncidentIssueType;
        status: OrderIncidentStatus;
        decision: OrderIncidentDecision | null;
        resolution: 'refunded' | 'partial_refund' | 'rejected' | 'escalated' | null;
        created_at: string;
        updated_at: string;
        closed_at: string | null;
        evidence_urls: string[] | null;
        sla_deadline_at: string | null;
        refund_amount: number | null;
        products: { title: string; slug: string }[] | { title: string; slug: string } | null;
    };

    const incidents = ((incidentsData ?? []) as IncidentRow[]).map((incident: IncidentRow) => {
        const product = Array.isArray(incident.products) ? incident.products[0] : incident.products;
        return {
            id: incident.id,
            purchaseId: incident.purchase_id,
            issueType: incident.issue_type,
            status: incident.status,
            decision: incident.decision,
            resolution: incident.resolution,
            createdAt: incident.created_at,
            updatedAt: incident.updated_at,
            closedAt: incident.closed_at,
            evidenceUrls: Array.isArray(incident.evidence_urls) ? incident.evidence_urls : [],
            slaDeadlineAt: incident.sla_deadline_at,
            refundAmount: incident.refund_amount,
            productTitle: product?.title || t('unknown_product'),
        };
    });

    return (
        <DashboardShell role="buyer" locale={locale} title={t('title')} subtitle={t('subtitle')}>
            <BecomeVendorCard />

            {totalPurchases === 0 && <BuyerQuickStart />}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-black/5 bg-kode01-white rounded-[32px] shadow-sm hover:shadow-md transition-shadow">
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
                            <CardContent className="pt-2">
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Recent Purchases */}
            <Card className="mt-8 border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b border-black/5 pb-6">
                    <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                        {t('recent_purchases')}
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="text-kode01-noir/40 hover:text-kode01-noir hover:bg-black/5 rounded-full font-bold">
                        {t('view_all')}
                    </Button>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {purchases.length > 0 ? (
                            purchases.map((purchase) => (
                                <div key={purchase.id} className="flex items-center gap-4 p-4 rounded-3xl border border-black/5 hover:border-kode01-pink/20 hover:shadow-sm transition-all bg-white">
                                    <div className="h-12 w-12 rounded-2xl bg-kode01-blue/10 flex items-center justify-center">
                                        <Package size={20} className="text-kode01-blue" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-kode01-noir">{purchase.name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Clock size={12} className="text-kode01-noir/30" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{purchase.date}</span>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black text-kode01-noir">{purchase.price}</span>
                                    <Badge className="bg-kode01-green/10 text-kode01-green font-bold border-0 hidden sm:inline-flex">
                                        {purchase.statusLabel}
                                    </Badge>
                                    <Button
                                        asChild={purchase.canDownload && Boolean(purchase.productId)}
                                        size="sm"
                                        variant="outline"
                                        disabled={!purchase.canDownload || !purchase.productId}
                                        className="gap-2 text-kode01-blue border-kode01-blue/20 hover:bg-kode01-blue hover:text-white rounded-full font-bold ml-2 disabled:pointer-events-none disabled:opacity-50"
                                    >
                                        {purchase.canDownload && purchase.productId ? (
                                            <a href={`/api/download/${purchase.productId}`}>
                                                <Download size={14} />
                                                {t('download')}
                                            </a>
                                        ) : (
                                            <>
                                                <Download size={14} />
                                                {t('download')}
                                            </>
                                        )}
                                    </Button>
                                    {purchase.isReviewEligible && purchase.productSlug && (
                                        <Button asChild size="sm" variant="outline" className="gap-2 text-kode01-pink border-kode01-pink/30 hover:bg-kode01-pink hover:text-kode01-noir rounded-full font-bold">
                                            <Link href={`/buyer/reviews?product=${encodeURIComponent(purchase.productSlug)}`}>
                                                <Star size={14} />
                                                {t('review')}
                                            </Link>
                                        </Button>
                                    )}
                                    <ReportOrderIssueButton purchaseId={purchase.id} locale={locale} />
                                </div>
                            ))
                        ) : (
                            <div className="rounded-3xl border border-black/10 bg-black/[0.02] px-4 py-8 text-center">
                                <p className="text-sm font-bold text-kode01-noir/70">{t('no_recent_purchases')}</p>
                                <p className="mt-1 text-xs text-kode01-noir/50">{t('no_recent_purchases_hint')}</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="mt-8 border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b border-black/5 pb-6">
                    <div>
                        <CardTitle className="text-xl font-serif font-black text-kode01-noir">
                            {t('order_incidents.title')}
                        </CardTitle>
                        <CardDescription className="text-kode01-noir/60 mt-2">
                            {t('order_incidents.subtitle')}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        {incidents.length === 0 ? (
                            <div className="rounded-3xl border border-black/10 bg-black/[0.02] px-4 py-8 text-center">
                                <p className="text-sm font-bold text-kode01-noir/70">{t('order_incidents.no_incidents')}</p>
                            </div>
                        ) : (
                            incidents.map((incident) => (
                                <div key={incident.id} className="rounded-2xl border border-black/10 bg-white p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-bold text-kode01-noir">{incident.productTitle}</p>
                                        <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                                            {t(`order_incidents.issue_types.${incident.issueType}`)}
                                        </Badge>
                                        <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                                            {t(`order_incidents.statuses.${incident.status}`)}
                                        </Badge>
                                        {incident.decision ? (
                                            <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                                                {t(`order_incidents.decisions.${incident.decision}`)}
                                            </Badge>
                                        ) : null}
                                        {incident.resolution ? (
                                            <Badge variant="outline" className="rounded-full border-kode01-sauge/30 text-kode01-noir/80">
                                                {t(`order_incidents.resolutions.${incident.resolution}`)}
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-kode01-noir/60 sm:grid-cols-4">
                                        <span>
                                            {t('order_incidents.created_at')}: {new Date(incident.createdAt).toLocaleString(locale)}
                                        </span>
                                        <span>
                                            {t('order_incidents.updated_at')}: {new Date(incident.updatedAt).toLocaleString(locale)}
                                        </span>
                                        <span>
                                            {t('order_incidents.closed_at')}: {incident.closedAt ? new Date(incident.closedAt).toLocaleString(locale) : '-'}
                                        </span>
                                        <span>
                                            {t('order_incidents.sla_deadline_at')}: {incident.slaDeadlineAt ? new Date(incident.slaDeadlineAt).toLocaleString(locale) : '-'}
                                        </span>
                                    </div>
                                    {incident.evidenceUrls.length > 0 ? (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {incident.evidenceUrls.map((url: string) => (
                                                <a
                                                    key={url}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block h-12 w-12 overflow-hidden rounded-lg border border-black/10"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={url} alt={t('order_incidents.evidence_alt')} className="h-full w-full object-cover" />
                                                </a>
                                            ))}
                                        </div>
                                    ) : null}
                                    {typeof incident.refundAmount === 'number' ? (
                                        <p className="mt-2 text-xs text-kode01-noir/60">
                                            {t('order_incidents.refund_amount')}: {(incident.refundAmount / 100).toFixed(2)}
                                        </p>
                                    ) : null}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* My License Keys */}
            <Card className="mt-8 border-black/5 bg-kode01-white rounded-[32px] shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b border-black/5 pb-6">
                    <div>
                        <CardTitle className="text-xl font-serif font-black text-kode01-noir flex items-center gap-2">
                            <Key className="text-kode01-pink" size={20} />
                            {t('license_keys')}
                        </CardTitle>
                        <CardDescription className="text-kode01-noir/60 mt-2">
                            {t('license_desc')}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {(licenseKeys ?? []).map((lk) => (
                            <div key={lk.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl border border-black/5 bg-white">
                                <div>
                                    <p className="text-sm font-bold text-kode01-noir pb-1">{((lk.products as unknown) as { title: string })?.title || t('unknown_product')}</p>
                                    <code className="px-3 py-1.5 bg-black/5 rounded-lg text-xs font-mono font-black tracking-widest text-kode01-pink break-all">
                                        {lk.key}
                                    </code>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('status')}</p>
                                        <Badge variant="outline" className={lk.status === 'active' ? "border-kode01-green text-kode01-green mt-1" : "border-red-500 text-red-500 mt-1"}>
                                            {lk.status}
                                        </Badge>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40">{t('uses')}</p>
                                        <span className="text-sm font-black text-kode01-noir block mt-1">
                                            {lk.uses_count} {lk.max_uses ? `/ ${lk.max_uses}` : ''}
                                        </span>
                                    </div>
                                    <Button size="icon" variant="outline" className="rounded-xl border-black/10 hover:bg-kode01-pink/10 hover:text-kode01-pink hover:border-kode01-pink/20 transition-all">
                                        <Key size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {(licenseKeys?.length ?? 0) === 0 && (
                            <div className="rounded-3xl border border-black/10 bg-black/[0.02] px-4 py-8 text-center">
                                <p className="text-sm font-bold text-kode01-noir/70">{t('no_license_keys')}</p>
                                <p className="mt-1 text-xs text-kode01-noir/50">{t('no_license_keys_hint')}</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </DashboardShell>
    );
}

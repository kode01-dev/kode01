import { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Check, Zap, Megaphone, Star, Lock } from 'lucide-react';

import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { PricingPageSkeleton } from '@/components/skeletons';
import { createClient } from '@/lib/supabase/server';
import { getActivePlacements, getActivePricingPlans } from '@/features/ads/server/repository';
import { applySeoMetadata } from '@/lib/seo';
import { SeoAppJsonLd } from '@/components/seo/SeoAppJsonLd';

type PricingPlan = {
    code: string;
    duration_days: number;
    price: number;
    price_usd?: number;
    currency: string;
};

type Placement = {
    slug: 'free' | 'news' | 'newsletter_footer';
    price_multiplier: number;
};

type MarketplacePlanCard = {
    id: string;
    name: string;
    price: string;
    period: string;
    description: string;
    icon: typeof Zap;
    iconBg: string;
    features: string[];
    cta: string;
    cta_member: string;
    ctaLink: string;
    popular: boolean;
    disableForMembers: boolean;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.pricing' });
    return applySeoMetadata({
        title: t('title'),
        description: t('description'),
    }, '/pricing', { locale });
}

async function resolveAdsCatalog() {
    const fallbackPlans: PricingPlan[] = [
        { code: 'ads_7d', duration_days: 7, price: 49, price_usd: 49, currency: 'cad' },
        { code: 'ads_30d', duration_days: 30, price: 149, price_usd: 149, currency: 'cad' },
    ];

    const fallbackPlacements: Placement[] = [
        { slug: 'free', price_multiplier: 1 },
        { slug: 'news', price_multiplier: 1.5 },
        { slug: 'newsletter_footer', price_multiplier: 1.75 },
    ];

    try {
        const [plansRes, placementsRes] = await Promise.all([
            getActivePricingPlans(),
            getActivePlacements(),
        ]);

        const plans = plansRes
            .map((plan) => ({
                code: plan.code,
                duration_days: Number(plan.duration_days),
                price: Number(plan.price ?? plan.price_usd),
                price_usd: Number(plan.price_usd ?? plan.price),
                currency: typeof plan.currency === 'string' ? plan.currency : 'cad',
            }))
            .filter((plan) => Number.isFinite(plan.duration_days) && Number.isFinite(plan.price))
            .sort((a, b) => a.duration_days - b.duration_days);

        const placements = placementsRes
            .map((placement) => ({
                slug: placement.slug,
                price_multiplier: Number(placement.price_multiplier),
            }))
            .filter((placement) => Number.isFinite(placement.price_multiplier)) as Placement[];

        return {
            plans: plans.length > 0 ? plans : fallbackPlans,
            placements: placements.length > 0 ? placements : fallbackPlacements,
        };
    } catch {
        return {
            plans: fallbackPlans,
            placements: fallbackPlacements,
        };
    }
}

function formatDurationLabel(days: number, isFr: boolean) {
    if (days === 7) return isFr ? '7 jours' : '7 days';
    if (days === 30) return isFr ? '30 jours' : '30 days';
    return isFr ? `${days} jours` : `${days} days`;
}

async function PricingPageContent({ locale }: { locale: string }) {
    const isFr = locale === 'fr';
    const t_ads = await getTranslations('pricing.ads');
    const tPricing = await getTranslations('pricing');
    const pricingTitle = tPricing.has('hero.title') ? tPricing('hero.title') : tPricing('title');
    const pricingSubtitle = tPricing.has('hero.subtitle') ? tPricing('hero.subtitle') : tPricing('subtitle');

    const plans: MarketplacePlanCard[] = [
        {
            id: 'free',
            name: tPricing('plans.free.name'),
            price: tPricing('plans.free.price'),
            period: tPricing('plans.free.period'),
            description: tPricing('plans.free.description'),
            icon: Zap,
            iconBg: 'bg-kode01-blue',
            features: tPricing.raw('plans.free.features') as string[],
            cta: tPricing('plans.free.cta'),
            cta_member: tPricing('plans.free.cta_member'),
            ctaLink: '/auth/signup',
            popular: false,
            disableForMembers: true,
        },
    ];

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isMember = Boolean(user);
    const { data: profile } = user
        ? await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
        : { data: null };
    const memberRole = typeof profile?.role === 'string' ? profile.role : null;
    const sponsoredBlogCtaHref = !isMember
        ? '/auth/signup'
        : memberRole === 'seller'
            ? `/${locale}/vendor/sponsored-blog`
            : memberRole === 'buyer'
                ? `/${locale}/buyer/sponsored-blog`
                : `/${locale}/dashboard`;

    const adsCatalog = await resolveAdsCatalog();
    const placementsMap = new Map(
        adsCatalog.placements.map((placement) => [placement.slug, placement.price_multiplier]),
    );
    const newsMultiplier = placementsMap.get('news') ?? 1.5;
    const newsletterMultiplier = placementsMap.get('newsletter_footer') ?? 1.75;

    const durationRows = adsCatalog.plans.map((plan) => ({
        code: plan.code,
        durationLabel: formatDurationLabel(plan.duration_days, isFr),
        fullBannerPrice: plan.price * newsMultiplier,
        splitSpotPrice: (plan.price * newsMultiplier) / 2,
        newsletterPrice: plan.price * newsletterMultiplier,
    }));

    const formatMoney = (value: number) => {
        const rounded = Number(value.toFixed(2));
        const hasDecimals = !Number.isInteger(rounded);
        const formatted = rounded.toLocaleString(isFr ? 'fr-CA' : 'en-CA', {
            minimumFractionDigits: hasDecimals ? 2 : 0,
            maximumFractionDigits: 2,
        });
        return `$${formatted}`;
    };

    const adPackages = [
        {
            key: 'split',
            icon: Megaphone,
            iconBg: 'bg-kode01-blue',
            title: isFr ? 'Spot vertical partage (1/2)' : 'Shared vertical spot (1/2)',
            description: isFr
                ? 'Plusieurs annonceurs partagent la zone news avec rotation strategique.'
                : 'Multiple advertisers share the news area with strategic rotation.',
            features: isFr
                ? [
                    'Jusqu a 4 annonceurs split par bloc hebdo',
                    'Prix reduit par annonceur',
                    'Rotation optimisee pour la visibilite',
                ]
                : [
                    'Up to 4 split advertisers per weekly block',
                    'Lower price per advertiser',
                    'Strategic visibility rotation',
                ],
            getPrice: (row: (typeof durationRows)[number]) => row.splitSpotPrice,
            ctaLabel: isMember
                ? (isFr ? 'Creer une campagne' : 'Create campaign')
                : (isFr ? 'Connexion requise' : 'Sign in required'),
        },
        {
            key: 'full',
            icon: Star,
            iconBg: 'bg-kode01-pink',
            title: isFr ? 'Banniere complete' : 'Full banner',
            description: isFr
                ? 'Format premium prioritaire dans la rotation news.'
                : 'Premium priority format in the news rotation.',
            features: isFr
                ? [
                    'Part prioritaire en rotation (~60%)',
                    'Format premium pour lancements',
                    'Compatible avec inventaire split',
                ]
                : [
                    'Priority share in rotation (~60%)',
                    'Premium format for launches',
                    'Runs alongside split inventory',
                ],
            getPrice: (row: (typeof durationRows)[number]) => row.fullBannerPrice,
            ctaLabel: isMember
                ? (isFr ? 'Reserver la banniere' : 'Book full banner')
                : (isFr ? 'Connexion requise' : 'Sign in required'),
        },
        {
            key: 'newsletter',
            icon: Megaphone,
            iconBg: 'bg-kode01-noir',
            title: t_ads('plans.newsletter.name'),
            description: isFr
                ? 'Placement email dans le recap hebdomadaire.'
                : 'Email placement in the weekly recap.',
            features: JSON.parse(JSON.stringify(t_ads.raw('plans.newsletter.features'))) as string[],
            getPrice: (row: (typeof durationRows)[number]) => row.newsletterPrice,
            ctaLabel: isMember
                ? (isFr ? 'Reserver en infolettre' : 'Book newsletter slot')
                : (isFr ? 'Connexion requise' : 'Sign in required'),
        },
    ] as const;

    const adsCtaHref = isMember ? `/${locale}/advertise` : `/${locale}`;
    const sponsoredBlogFeatures = isFr
        ? [
            '1 ou 2 langues (EN/FR)',
            'Validation admin obligatoire',
            'Publication auto au prochain 09:00 Toronto',
            'Visible dans le blog normal avec badge commandite',
        ]
        : [
            '1 or 2 locales (EN/FR)',
            'Admin approval required',
            'Auto-publish at next 09:00 Toronto slot',
            'Appears in normal blog feed with sponsored badge',
        ];

    return (
        <div className="max-w-[1440px] mx-auto px-6 md:px-12">
            {/* Hero Section */}
            <section className="py-20 text-center relative">
                <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-blue rounded-full opacity-20 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-pink rounded-full opacity-10 blur-3xl pointer-events-none" />

                <div className="mx-auto max-w-2xl text-center">
                    <h1 className="text-[clamp(3rem,8vw,5rem)] font-serif font-black text-kode01-noir mb-6 tracking-tight leading-[0.9] whitespace-pre-line">
                        {pricingTitle}
                    </h1>
                    <p className="text-lg md:text-xl font-medium text-kode01-noir/60 max-w-[600px] mx-auto leading-relaxed">
                        {pricingSubtitle}
                    </p>
                </div>
            </section>

            {/* Pricing Cards */}
            <div className="pb-24 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 gap-8 max-w-xl mx-auto">
                    {plans.map((plan) => {
                        const Icon = plan.icon;
                        const disableCta = isMember && plan.disableForMembers;
                        return (
                            <div
                                key={plan.id}
                                className={`bg-white rounded-[40px] p-10 relative flex flex-col ${plan.popular
                                        ? 'border-4 border-kode01-pink shadow-2xl scale-105 z-10'
                                        : 'border border-kode01-noir/5 shadow-lg'
                                    }`}
                            >
                                {plan.popular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                                        <div className="bg-kode01-pink text-kode01-noir px-6 py-2 rounded-full font-bold text-sm uppercase tracking-wider whitespace-nowrap">
                                            {isFr ? 'Le plus populaire' : 'Most Popular'}
                                        </div>
                                    </div>
                                )}

                                {/* Icon */}
                                <div className={`w-14 h-14 ${plan.iconBg} rounded-full flex items-center justify-center mb-6 shrink-0`}>
                                    <Icon className="w-7 h-7 text-white" />
                                </div>

                                {/* Plan Name & Price */}
                                <h2 className="text-3xl font-serif font-black text-kode01-noir mb-2">
                                    {plan.name}
                                </h2>
                                <p className="text-kode01-noir/60 mb-6 font-medium min-h-[3rem]">
                                    {plan.description}
                                </p>
                                <div className="mb-8">
                                    <span className="text-5xl font-black text-kode01-noir">
                                        {plan.price}
                                    </span>
                                    <span className="text-kode01-noir/40 text-lg font-medium">
                                        {plan.period}
                                    </span>
                                </div>

                                {/* Features List */}
                                <ul className="space-y-4 mb-10 flex-1">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <div className="mt-0.5 shrink-0">
                                                <Check className="w-5 h-5 text-kode01-green" strokeWidth={3} />
                                            </div>
                                            <span className="text-kode01-noir/80 font-medium">
                                                {feature}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA Button */}
                                <Link
                                    href={disableCta ? '#' : plan.ctaLink}
                                    className={`block w-full text-center py-4 px-6 rounded-full font-bold text-base transition-all duration-200 hover:scale-105 ${disableCta
                                            ? 'bg-kode01-noir/5 text-kode01-noir/40 cursor-default'
                                            : 'bg-kode01-noir text-white hover:bg-kode01-pink hover:text-kode01-noir shadow-lg'
                                        }`}
                                >
                                    {isMember ? plan.cta_member : plan.cta}
                                </Link>
                            </div>
                        );
                    })}
                </div>

                {/* FAQ or Additional Info */}
                <div className="mt-20 text-center">
                    <p className="text-kode01-noir/60 font-medium">
                        {isFr
                            ? 'Tous les forfaits incluent le traitement securisé des paiements, le tableau de bord vendeur et le support client.'
                            : 'All plans include secure payment processing, seller dashboard, and customer support.'}
                    </p>
                </div>
            </div>

            {/* Advertising Section */}
            <section className="pb-24 max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-serif font-black text-kode01-noir mb-4 tracking-tight leading-[0.9]">
                        {t_ads('title')}
                    </h2>
                    <p className="text-lg md:text-xl font-medium text-kode01-noir/60 max-w-[600px] mx-auto leading-relaxed">
                        {t_ads('description')}
                    </p>
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-kode01-noir/10 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/70">
                        <Lock size={14} />
                        {isFr ? 'Acces membres seulement' : 'Members only access'}
                    </div>
                    <p className="mt-4 text-sm text-kode01-noir/60 max-w-2xl mx-auto">
                        {isFr
                            ? 'Les tarifs sont affiches par format et par duree. Le montant final est confirme au moment de la creation de campagne.'
                            : 'Prices are displayed by format and duration. Final amount is confirmed when creating a campaign.'}
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {adPackages.map((ad) => {
                        const Icon = ad.icon;
                        return (
                            <div
                                key={ad.key}
                                className="bg-white rounded-[40px] p-10 border border-kode01-noir/5 shadow-lg"
                            >
                                {/* Icon */}
                                <div className={`w-14 h-14 ${ad.iconBg} rounded-full flex items-center justify-center mb-6`}>
                                    <Icon className="w-7 h-7 text-white" />
                                </div>

                                <h3 className="text-2xl font-serif font-black text-kode01-noir mb-2 leading-tight">
                                    {ad.title}
                                </h3>
                                <p className="text-sm text-kode01-noir/65 mb-6">
                                    {ad.description}
                                </p>

                                <div className="mb-8 space-y-2 rounded-2xl border border-black/10 bg-kode01-cream/35 p-4">
                                    {durationRows.map((row) => (
                                        <div key={`${ad.key}-${row.code}`} className="flex items-center justify-between gap-4">
                                            <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
                                                {row.durationLabel}
                                            </span>
                                            <span className="text-lg font-black text-kode01-noir">
                                                {formatMoney(ad.getPrice(row))}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Features List */}
                                <ul className="space-y-4 mb-10">
                                    {ad.features.map((feature: string, i: number) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <div className="mt-0.5">
                                                <Check className="w-5 h-5 text-kode01-green" strokeWidth={3} />
                                            </div>
                                            <span className="text-kode01-noir/80 font-medium">
                                                {feature}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA Button */}
                                <Link
                                    href={adsCtaHref}
                                    className="block w-full text-center py-4 px-6 rounded-full font-bold text-base transition-all duration-200 hover:scale-105 bg-kode01-noir text-white hover:bg-kode01-pink hover:text-kode01-noir"
                                >
                                    {ad.ctaLabel}
                                </Link>
                            </div>
                        );
                    })}
                </div>

                {!isMember && (
                    <p className="mt-8 text-center text-sm text-kode01-noir/60">
                        {isFr
                            ? 'Connectez-vous pour ouvrir une campagne publicitaire et acceder aux placements.'
                            : 'Sign in to launch ad campaigns and access placements.'}
                    </p>
                )}
            </section>

            <section className="pb-24 max-w-3xl mx-auto">
                <div className="text-center mb-10">
                    <h2 className="text-[clamp(1.8rem,4.5vw,2.8rem)] font-serif font-black text-kode01-noir tracking-tight leading-[0.95]">
                        {isFr ? 'Publication Blog Commanditee' : 'Sponsored Blog Publishing'}
                    </h2>
                    <p className="mt-3 text-base text-kode01-noir/60">
                        {isFr
                            ? 'Une section dediee pour les experts qui veulent publier un article commandite sur le blog.'
                            : 'A dedicated option for experts who want to publish a sponsored article on the blog.'}
                    </p>
                </div>

                <div className="bg-white rounded-[40px] p-10 border border-kode01-noir/5 shadow-lg">
                    <div className="w-14 h-14 bg-kode01-pink rounded-full flex items-center justify-center mb-6">
                        <Megaphone className="w-7 h-7 text-white" />
                    </div>

                    <h3 className="text-2xl font-serif font-black text-kode01-noir mb-2 leading-tight">
                        {isFr ? 'Blog commandite' : 'Sponsored blog'}
                    </h3>
                    <p className="text-sm text-kode01-noir/65 mb-6">
                        {isFr
                            ? 'Publication payante avec validation admin et badge commandite.'
                            : 'Paid publication with admin review and sponsored badge.'}
                    </p>

                    <div className="mb-8 rounded-2xl border border-black/10 bg-kode01-cream/35 p-4 flex items-center justify-between gap-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
                            {isFr ? 'Tarif fixe' : 'Fixed price'}
                        </span>
                        <span className="text-lg font-black text-kode01-noir">$79</span>
                    </div>

                    <ul className="space-y-4 mb-10">
                        {sponsoredBlogFeatures.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <div className="mt-0.5">
                                    <Check className="w-5 h-5 text-kode01-green" strokeWidth={3} />
                                </div>
                                <span className="text-kode01-noir/80 font-medium">{feature}</span>
                            </li>
                        ))}
                    </ul>

                    <Link
                        href={sponsoredBlogCtaHref}
                        className="block w-full text-center py-4 px-6 rounded-full font-bold text-base transition-all duration-200 hover:scale-105 bg-kode01-noir text-white hover:bg-kode01-pink hover:text-kode01-noir"
                    >
                        {isMember
                            ? (isFr ? 'Ouvrir le formulaire' : 'Open submission form')
                            : (isFr ? 'Creer un blog commandite' : 'Create sponsored blog')}
                    </Link>
                </div>
            </section>
        </div>
    );
}

export default async function PricingPage(
    props: { params: Promise<{ locale: string }> },
) {
    const { locale } = await props.params;

    return (
        <div className="min-h-screen bg-kode01-cream flex flex-col">
            <SeoAppJsonLd pathname="/pricing" />
            <BaseHeader />
            <main className="flex-1 pt-32">
                <Suspense
                    fallback={<PricingPageSkeleton />}
                >
                    <PricingPageContent locale={locale} />
                </Suspense>
            </main>
            <BaseFooter />
        </div>
    );
}

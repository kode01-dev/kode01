import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CreditCard, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ConnectStripeButton } from '@/features/dashboard/components/ConnectStripeButton';
import { ManageStripeButton } from '@/features/dashboard/components/ManageStripeButton';
import { DashboardAnalytics } from '@/features/dashboard/components/DashboardAnalytics';
import { VendorQuickStats } from '@/features/dashboard/components/VendorQuickStats';
import { SellerChecklistCard } from '@/features/onboarding/components/SellerChecklistCard';
import { StripeReturnToast } from '@/features/onboarding/components/StripeReturnToast';
import { NextActionCard } from '@/features/vendor-coaching/components/NextActionCard';
import { getNextActions } from '@/features/vendor-coaching/getNextActions';
import { CompleteVendorCountryCard } from '@/features/dashboard/components/CompleteVendorCountryCard';
import { VendorCountryChangeFinalize } from '@/features/dashboard/components/VendorCountryChangeFinalize';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
    CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
    computeConnectAccountStatus,
    getStripeClientForConnectSample,
} from '@/lib/stripe/connect-sample';
import { parseAllowedConnectCountryCode } from '@/lib/stripe/connect-countries';
import { verifyStripeConnectState } from '@/lib/stripe/connect-state';
import { isSellerRole } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/security/audit';

export default function VendorDashboardPage(
    props: {
        params: Promise<{ locale: string }>;
        searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }
) {
    return (
        <VendorDashboardContent
            paramsPromise={props.params}
            searchParamsPromise={props.searchParams}
        />
    );
}

async function VendorDashboardContent({
    paramsPromise,
    searchParamsPromise,
}: {
    paramsPromise: Promise<{ locale: string }>;
    searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { locale } = await paramsPromise;
    const searchParams = searchParamsPromise ? await searchParamsPromise : {};
    const t = await getTranslations('dashboard.vendor');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}`);
    }

    let profile = null;
    const extendedProfileSelect =
        'role, country, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, business_url, business_description, business_mcc';
    const legacyProfileSelect =
        'role, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted';

    const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(extendedProfileSelect)
        .eq('id', user.id)
        .single();

    if (!profileError) {
        profile = profileData;
    } else {
        const missingNewColumns = /column .* does not exist/i.test(profileError.message ?? '');
        if (missingNewColumns) {
            const { data: legacyProfileData, error: legacyProfileError } = await supabase
                .from('profiles')
                .select(legacyProfileSelect)
                .eq('id', user.id)
                .single();

            if (!legacyProfileError && legacyProfileData) {
                profile = {
                    ...legacyProfileData,
                    country: null,
                    business_url: null,
                    business_description: null,
                    business_mcc: null,
                };
            } else {
                console.error('Failed to load legacy vendor profile:', legacyProfileError);
            }
        } else {
            console.error('Failed to load vendor profile:', profileError);
        }
    }

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-kode01-white text-kode01-noir">
                <div className="text-center">
                    <h1 className="text-3xl font-black font-serif">500</h1>
                    <p className="mt-2 text-sm font-bold uppercase tracking-widest text-kode01-noir/50">
                        Unable to load vendor profile
                    </p>
                </div>
            </div>
        );
    }

    if (!isSellerRole(profile?.role)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-kode01-white text-kode01-noir">
                <div className="text-center">
                    <h1 className="text-3xl font-black font-serif">403</h1>
                    <p className="mt-2 text-sm font-bold uppercase tracking-widest text-kode01-noir/50">
                        {t('forbidden')}
                    </p>
                </div>
            </div>
        );
    }

    const canSellFromProfile = isSellerRole(profile?.role)
        && Boolean(profile?.stripe_account_id)
        && profile?.stripe_charges_enabled === true
        && profile?.stripe_payouts_enabled === true;
    const normalizedCountry = parseAllowedConnectCountryCode(profile?.country);
    const hasStripeAccount = Boolean(profile?.stripe_account_id);
    const canResumeExistingStripeAccount = hasStripeAccount && !normalizedCountry;
    const hasValidCountry = Boolean(normalizedCountry) || canResumeExistingStripeAccount;

    let canSell = canSellFromProfile;
    if (profile?.stripe_account_id) {
        try {
            const stripeClient = getStripeClientForConnectSample();
            const account = await stripeClient.v2.core.accounts.retrieve(profile.stripe_account_id, {
                include: CONNECT_ACCOUNT_RETRIEVE_INCLUDE,
            });
            const status = computeConnectAccountStatus(account);

            canSell = status.readyToReceivePayments && status.onboardingComplete;

            if (
                profile.stripe_charges_enabled !== status.readyToReceivePayments
                || profile.stripe_payouts_enabled !== status.readyToReceivePayments
                || profile.stripe_details_submitted !== status.onboardingComplete
            ) {
                await supabase
                    .from('profiles')
                    .update({
                        stripe_charges_enabled: status.readyToReceivePayments,
                        stripe_payouts_enabled: status.readyToReceivePayments,
                        stripe_details_submitted: status.onboardingComplete,
                        stripe_onboarding_completed_at: status.onboardingComplete ? new Date().toISOString() : null,
                        is_verified: status.readyToReceivePayments,
                    })
                    .eq('id', user.id);
            }
        } catch (error) {
            console.error('Failed to retrieve Stripe v2 account status for vendor dashboard:', error);
        }
    }

    // Fetch product count and profile completeness for onboarding checklist
    const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', user.id);

    const { data: profileDetails } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single();

    const hasProducts = (productCount ?? 0) > 0;
    const profileComplete = Boolean(profileDetails?.display_name && profileDetails?.avatar_url);

    // Compute coaching next actions
    const nextActions = getNextActions({
        stripeReady: canSell,
        hasProducts,
        profileComplete,
        productCount: productCount ?? 0,
        totalSales: 0, // Will be fetched client-side in analytics
        totalViews: 0,
        locale,
    });

    const countryChangeEventId = typeof searchParams.country_change_event_id === 'string'
        ? searchParams.country_change_event_id
        : undefined;
    const countryChangeAccountId = typeof searchParams.country_change_account_id === 'string'
        ? searchParams.country_change_account_id
        : undefined;
    const onboardingComplete = typeof searchParams.onboarding_complete === 'string'
        ? searchParams.onboarding_complete
        : undefined;
    const stripeConnectReturn = searchParams.stripe_connect_return === '1';
    const stripeConnectState = typeof searchParams.state === 'string' ? searchParams.state : undefined;
    const stripeConnectError = typeof searchParams.stripe_connect_error === 'string'
        ? searchParams.stripe_connect_error
        : undefined;
    let stripeReturnAccepted = false;
    let stripeReturnError = stripeConnectError;

    if (stripeConnectReturn) {
        const verifiedState = verifyStripeConnectState(stripeConnectState, {
            expectedUserId: user.id,
            expectedStripeAccountId: profile.stripe_account_id ?? undefined,
            expectedPurpose: 'vendor_onboarding',
        });

        stripeReturnAccepted = verifiedState.ok;
        stripeReturnError = verifiedState.ok ? undefined : 'invalid_state';

        await logAuditEvent({
            eventType: verifiedState.ok ? 'stripe_connect.return.received' : 'stripe_connect.return.invalid',
            userId: user.id,
            path: `/${locale}/vendor`,
            metadata: {
                stripe_account_id: profile.stripe_account_id,
                reason: verifiedState.ok ? 'returned_from_stripe' : verifiedState.reason,
            },
        });
    }

    return (
        <DashboardShell role="vendor" locale={locale} title={t('title')} subtitle={t('subtitle')}>
            <VendorCountryChangeFinalize
                eventId={countryChangeEventId}
                accountId={countryChangeAccountId}
                onboardingComplete={onboardingComplete}
            />
            {!hasValidCountry ? <CompleteVendorCountryCard /> : null}

            {/* Quick Stats — above the fold */}
            {canSell && <VendorQuickStats />}

            {/* Stripe return toast */}
            <StripeReturnToast
                onboardingComplete={onboardingComplete === 'true'}
                stripeConnectReturned={stripeReturnAccepted}
                stripeConnectError={stripeReturnError}
            />

            {/* Onboarding Progress Checklist */}
            <SellerChecklistCard
                stripeReady={canSell}
                hasProducts={hasProducts}
                profileComplete={profileComplete}
                locale={locale}
            />

            {/* Coaching — Next Best Action */}
            {nextActions.length > 0 && <NextActionCard actions={nextActions} />}

            {/* Stripe Connect Onboarding Section */}
            {!canSell && (
                <Card className="mb-8 overflow-hidden rounded-[32px] border-kode01-pink/20 bg-gradient-to-br from-kode01-white via-kode01-pink/5 to-kode01-blue/5 shadow-sm">
                    <CardContent className="relative px-6 py-8 sm:px-10 sm:py-10">
                        <div className="pointer-events-none absolute right-[-40px] top-[-30px] h-32 w-32 rounded-full bg-kode01-pink/15 blur-2xl" />
                        <div className="pointer-events-none absolute left-[-20px] bottom-[-40px] h-24 w-24 rounded-full bg-kode01-blue/15 blur-2xl" />

                        <div className="relative flex flex-col items-center text-center max-w-xl mx-auto">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-kode01-pink/10 mb-5">
                                <CreditCard size={28} className="text-kode01-pink" />
                            </div>

                            <h2 className="font-serif text-2xl font-black text-kode01-noir sm:text-3xl">
                                {t('stripe_connect_title')}
                            </h2>
                            <p className="mt-3 text-sm text-kode01-noir/60 sm:text-base max-w-md">
                                {t('stripe_connect_description')}
                            </p>

                            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 text-xs text-kode01-noir/50">
                                <span className="inline-flex items-center gap-1.5">
                                    <ShieldCheck size={14} className="text-kode01-green" />
                                    {t('stripe_connect_secure')}
                                </span>
                                <span className="hidden sm:inline">-</span>
                                <span>{t('stripe_connect_minutes')}</span>
                            </div>

                            <div className="mt-6">
                                <ConnectStripeButton
                                    hasStripeAccount={hasStripeAccount}
                                    disabled={!hasValidCountry}
                                    disabledReason={t('country_required_before_connect')}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
                <div className="text-xs font-bold uppercase tracking-widest text-kode01-noir/40">
                    {!canSell ? t('new_product_locked') : t('new_product_ready')}
                </div>
                <div className="flex items-center gap-3">
                    {canSell ? <ManageStripeButton /> : null}
                    <Button asChild className="bg-kode01-pink hover:bg-kode01-pink/90 text-kode01-white gap-2 font-bold shadow-sm hover:shadow-md transition-all rounded-full h-10 px-6">
                        <Link href={`/${locale}/vendor/products/new`}>
                            <Plus size={18} />
                            {t('new_product')}
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Analytics & Charts */}
            <DashboardAnalytics />
        </DashboardShell>
    );
}

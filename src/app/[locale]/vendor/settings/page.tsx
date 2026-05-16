import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent } from '@/components/ui/card';
import { VendorBusinessProfileCard } from '@/features/dashboard/components/VendorBusinessProfileCard';
import { VendorCountryChangeCard } from '@/features/dashboard/components/VendorCountryChangeCard';
import { ManageStripeButton } from '@/features/dashboard/components/ManageStripeButton';
import { ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { isSellerRole } from '@/lib/auth/roles';
import { parseAllowedConnectCountryCode } from '@/lib/stripe/connect-countries';
import { Link } from '@/i18n/routing';

export default async function VendorSettingsPage(
    props: { params: Promise<{ locale: string }> }
) {
    const { locale } = await props.params;
    const t = await getTranslations('dashboard.vendor');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}`);
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, country, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, business_url, business_description, business_mcc')
        .eq('id', user.id)
        .single();

    if (!profile || !isSellerRole(profile.role)) {
        redirect(`/${locale}`);
    }

    const normalizedCountry = parseAllowedConnectCountryCode(profile.country);
    const isCountryLocked = Boolean(profile.stripe_account_id);
    const canSell = Boolean(profile.stripe_account_id)
        && profile.stripe_charges_enabled === true
        && profile.stripe_payouts_enabled === true;

    return (
        <DashboardShell role="vendor" locale={locale} title={t('settings_page.title')} subtitle={t('settings_page.subtitle')}>
            {/* Link to general account settings */}
            <Link href="/dashboard/settings">
                <Card className="mb-8 rounded-[24px] border-black/5 bg-kode01-white shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="flex items-center justify-between p-6">
                        <div>
                            <p className="font-bold text-kode01-noir">{t('settings_page.general_settings_link')}</p>
                            <p className="text-sm text-kode01-noir/60 mt-0.5">{t('settings_page.general_settings_description')}</p>
                        </div>
                        <ArrowRight size={20} className="text-kode01-noir/40" />
                    </CardContent>
                </Card>
            </Link>

            {/* Stripe Management */}
            {canSell && (
                <div className="flex justify-end mb-6">
                    <ManageStripeButton />
                </div>
            )}

            {/* Business Profile */}
            <VendorBusinessProfileCard
                initialBusinessUrl={profile.business_url || ''}
                initialBusinessDescription={profile.business_description || ''}
                initialBusinessMcc={profile.business_mcc || ''}
            />

            {/* Country Change */}
            {normalizedCountry && isCountryLocked ? (
                <VendorCountryChangeCard currentCountry={normalizedCountry} />
            ) : null}
        </DashboardShell>
    );
}

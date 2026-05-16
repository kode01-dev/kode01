import { StripeConnectSamplePage } from '@/features/stripe-connect-sample/StripeConnectSamplePage';

export default async function StripeConnectSampleRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <StripeConnectSamplePage locale={locale} />;
}

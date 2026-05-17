import { notFound } from 'next/navigation';
import { StripeConnectSamplePage } from '@/features/stripe-connect-sample/StripeConnectSamplePage';
import { requireStripeConnectSampleSeller } from '@/lib/stripe/connect-sample-access';

export default async function StripeConnectSampleRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const access = await requireStripeConnectSampleSeller();
  if (!access.ok) notFound();

  return <StripeConnectSamplePage locale={locale} />;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from 'next/navigation';
import { AlertTriangle, CreditCard, Receipt, RotateCcw, ShieldAlert } from 'lucide-react';
import { DashboardShell } from '@/features/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function money(cents: number | null | undefined, currency = 'cad') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100);
}

function formatDate(value: string | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : '-';
}

export default async function AdminFinancePage(
  props: { params: Promise<{ locale: string }> },
) {
  const { locale } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    redirect(`/${locale}/admin`);
  }

  const admin = createAdminClient() as any;
  const [ordersResult, paymentsResult, refundsResult, webhookResult] = await Promise.all([
    admin
      .from('orders')
      .select('id, status, currency, total_cents, fee_cents, stripe_checkout_session_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('payments')
      .select('id, status, currency, amount_cents, provider_payment_intent_id, provider_checkout_session_id, failure_reason, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('refunds')
      .select('id, status, currency, amount_cents, reason, stripe_refund_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('stripe_webhook_events')
      .select('event_id, type, status, error_message, locked_at, created_at, processed_at')
      .in('status', ['failed', 'processing'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const orders = ordersResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const refunds = refundsResult.data ?? [];
  const webhooks = webhookResult.data ?? [];

  const paidOrders = orders.filter((order: any) => order.status === 'paid');
  const openWebhooks = webhooks.filter((event: any) => event.status === 'failed' || event.status === 'processing');
  const totalRevenueCents = paidOrders.reduce((sum: number, order: any) => sum + Number(order.total_cents ?? 0), 0);
  const totalFeeCents = paidOrders.reduce((sum: number, order: any) => sum + Number(order.fee_cents ?? 0), 0);
  const totalRefundCents = refunds.reduce((sum: number, refund: any) => sum + Number(refund.amount_cents ?? 0), 0);

  const kpis = [
    { label: 'Gross paid orders', value: money(totalRevenueCents), icon: Receipt },
    { label: 'Platform fees', value: money(totalFeeCents), icon: CreditCard },
    { label: 'Refunds', value: money(totalRefundCents), icon: RotateCcw },
    { label: 'Webhook gaps', value: String(openWebhooks.length), icon: ShieldAlert },
  ];

  return (
    <DashboardShell
      role="admin"
      locale={locale}
      title="Finance operations"
      subtitle="Orders, payments, refunds, and Stripe webhook gaps."
    >
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="rounded-[24px] border-black/5 bg-kode01-white shadow-sm">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kode01-pink/10 text-kode01-pink">
                  <Icon size={18} />
                </div>
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-kode01-noir/40">{kpi.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-serif text-3xl font-black text-kode01-noir">{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <FinanceTable
          title="Recent orders"
          rows={orders.map((order: any) => ({
            id: order.id,
            primary: money(order.total_cents, order.currency),
            secondary: order.stripe_checkout_session_id ?? '-',
            status: order.status,
            date: formatDate(order.created_at, locale),
          }))}
        />
        <FinanceTable
          title="Recent payments"
          rows={payments.map((payment: any) => ({
            id: payment.id,
            primary: money(payment.amount_cents, payment.currency),
            secondary: payment.failure_reason ?? payment.provider_payment_intent_id ?? '-',
            status: payment.status,
            date: formatDate(payment.created_at, locale),
          }))}
        />
        <FinanceTable
          title="Recent refunds"
          rows={refunds.map((refund: any) => ({
            id: refund.id,
            primary: money(refund.amount_cents, refund.currency),
            secondary: refund.reason ?? refund.stripe_refund_id ?? '-',
            status: refund.status,
            date: formatDate(refund.created_at, locale),
          }))}
        />
        <FinanceTable
          title="Webhook attention queue"
          rows={webhooks.map((event: any) => ({
            id: event.event_id,
            primary: event.type,
            secondary: event.error_message ?? `locked: ${formatDate(event.locked_at, locale)}`,
            status: event.status,
            date: formatDate(event.created_at, locale),
          }))}
          emptyIcon
        />
      </div>
    </DashboardShell>
  );
}

function FinanceTable({
  title,
  rows,
  emptyIcon = false,
}: {
  title: string;
  rows: Array<{ id: string; primary: string; secondary: string; status: string; date: string }>;
  emptyIcon?: boolean;
}) {
  return (
    <Card className="rounded-[24px] border-black/5 bg-kode01-white shadow-sm">
      <CardHeader className="border-b border-black/5">
        <CardTitle className="font-serif text-xl font-black text-kode01-noir">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-8 text-sm font-bold text-kode01-noir/45">
            {emptyIcon ? <AlertTriangle size={18} /> : null}
            No records.
          </div>
        ) : (
          <div className="divide-y divide-black/5">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-kode01-noir">{row.primary}</p>
                  <p className="mt-1 truncate text-xs text-kode01-noir/45">{row.secondary}</p>
                  <p className="mt-1 font-mono text-[10px] text-kode01-noir/30">{row.id}</p>
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <Badge variant="outline" className="rounded-full border-kode01-sauge/30 font-bold">
                    {row.status}
                  </Badge>
                  <span className="text-xs font-bold text-kode01-noir/35">{row.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

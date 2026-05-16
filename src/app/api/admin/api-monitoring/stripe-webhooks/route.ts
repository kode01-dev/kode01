import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSessionOrNull } from '../_lib';

const STALE_PROCESSING_MS = 15 * 60 * 1000;

type StripeWebhookEventRow = {
  event_id: string;
  type: string;
  status: string;
  error_message: string | null;
  locked_at: string | null;
  processed_at: string | null;
  created_at: string;
};

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  eq: (column: string, value: string) => QueryBuilder;
  in: (column: string, values: string[]) => QueryBuilder;
  then: Promise<{ data: StripeWebhookEventRow[] | null; error: { message: string } | null }>['then'];
};

export async function GET(request: Request) {
  const adminSession = await getAdminSessionOrNull(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const status = params.get('status');
  const limit = Math.min(Math.max(Number(params.get('limit') ?? 50), 1), 100);
  const admin = createAdminClient() as unknown as { from: (table: string) => QueryBuilder };

  let query = admin
    .from('stripe_webhook_events')
    .select('event_id, type, status, error_message, locked_at, processed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status === 'failed' || status === 'processing' || status === 'processed') {
    query = query.eq('status', status);
  } else {
    query = query.in('status', ['failed', 'processing']);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  return NextResponse.json({
    events: (data ?? []).map((event: StripeWebhookEventRow) => {
      const lockedAtMs = event.locked_at ? new Date(event.locked_at).getTime() : 0;
      const stale = event.status === 'processing'
        && (!lockedAtMs || Number.isNaN(lockedAtMs) || now - lockedAtMs > STALE_PROCESSING_MS);

      return {
        eventId: event.event_id,
        type: event.type,
        status: event.status,
        errorMessage: event.error_message,
        lockedAt: event.locked_at,
        processedAt: event.processed_at,
        createdAt: event.created_at,
        replayable: event.status === 'failed' || stale,
        stale,
      };
    }),
  });
}

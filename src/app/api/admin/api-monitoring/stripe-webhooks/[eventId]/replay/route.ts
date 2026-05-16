import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invokeEdgeFunction } from '@/lib/edge/invoke';
import { getAdminSessionOrNull } from '../../../_lib';

const STALE_PROCESSING_MS = 15 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const adminSession = await getAdminSessionOrNull(request);
  if (!adminSession) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { eventId } = await params;
  const admin = createAdminClient() as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: {
              event_id: string;
              status: string;
              locked_at: string | null;
            } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data: event, error } = await admin
    .from('stripe_webhook_events')
    .select('event_id, status, locked_at')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: 'Webhook event not found' }, { status: 404 });
  }

  const lockedAtMs = event.locked_at ? new Date(event.locked_at).getTime() : 0;
  const staleProcessing = event.status === 'processing'
    && (!lockedAtMs || Number.isNaN(lockedAtMs) || Date.now() - lockedAtMs > STALE_PROCESSING_MS);

  if (event.status !== 'failed' && !staleProcessing) {
    return NextResponse.json(
      { error: 'Webhook event is not replayable', status: event.status },
      { status: 409 },
    );
  }

  const upstream = await invokeEdgeFunction({
    functionName: 'stripe-webhook',
    method: 'POST',
    requestId: request.headers.get('x-request-id') ?? undefined,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replay_event_id: eventId }),
  });

  const payload = await upstream.json().catch(() => ({ received: upstream.ok }));
  return NextResponse.json(payload, { status: upstream.status });
}

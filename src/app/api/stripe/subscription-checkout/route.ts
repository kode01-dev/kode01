import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';

const PLAN_KEY_REGEX = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function parsePlan(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!PLAN_KEY_REGEX.test(normalized)) return null;
  return normalized;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    const plan = parsePlan(payload?.plan);
    const locale = typeof payload?.locale === 'string' ? payload.locale : undefined;

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan format.' }, { status: 400 });
    }

    const upstream = await invokeEdgeFunction({
      functionName: 'stripe-subscription-checkout',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      requestId: req.headers.get('x-request-id') ?? undefined,
      body: JSON.stringify({
        userId: user.id,
        userEmail: user.email,
        plan,
        locale,
      }),
    });

    return await toNextJsonResponse(upstream);
  } catch (error) {
    console.error('Subscription checkout error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

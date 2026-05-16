import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';

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
    const locale = typeof payload?.locale === 'string' ? payload.locale : undefined;
    const returnPath = typeof payload?.returnPath === 'string' ? payload.returnPath : undefined;

    const upstream = await invokeEdgeFunction({
      functionName: 'stripe-customer-portal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      requestId: req.headers.get('x-request-id') ?? undefined,
      body: JSON.stringify({
        userId: user.id,
        locale,
        returnPath,
      }),
    });

    return await toNextJsonResponse(upstream);
  } catch (error) {
    console.error('Customer portal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


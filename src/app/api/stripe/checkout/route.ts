import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';
import { securityErrorResponse } from '@/lib/security/api-errors';

export async function POST(req: Request) {
    try {
        const requestId = req.headers.get('x-request-id') ?? undefined;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return securityErrorResponse({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Authentication is required.',
                requestId,
            });
        }

        const payload = await req.json().catch(() => null);
        const productId = payload?.productId;

        if (!productId) {
            return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
        }

        const upstream = await invokeEdgeFunction({
            functionName: 'stripe-checkout',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            requestId: req.headers.get('x-request-id') ?? undefined,
            body: JSON.stringify({
                userId: user.id,
                productId,
            }),
        });

        return await toNextJsonResponse(upstream);
    } catch (error) {
        console.error('Checkout error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json().catch(() => null);
        const { productId, finalPrice, affiliateCode, couponCode } = payload ?? {};

        if (!productId) {
            return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
        }

        const upstream = await invokeEdgeFunction({
            functionName: 'stripe-embedded-checkout',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            requestId: req.headers.get('x-request-id') ?? undefined,
            body: JSON.stringify({
                userId: user.id,
                productId,
                finalPrice: typeof finalPrice === 'number' ? finalPrice : undefined,
                affiliateCode: typeof affiliateCode === 'string' ? affiliateCode : undefined,
                couponCode: typeof couponCode === 'string' ? couponCode : undefined,
            }),
        });

        return await toNextJsonResponse(upstream);
    } catch (error) {
        console.error('Embedded Checkout error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

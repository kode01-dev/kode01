import { NextResponse } from 'next/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';
import { getTrustedClientIpFromHeaders } from '@/lib/security/request-ip';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const ip = getTrustedClientIpFromHeaders(req.headers) ?? 'unknown';
        const userAgent = req.headers.get('user-agent') || 'unknown';

        const upstream = await invokeEdgeFunction({
            functionName: 'track-product-view',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            requestId: req.headers.get('x-request-id') ?? undefined,
            body: JSON.stringify({
                slug,
                ip,
                userAgent,
            }),
        });

        return await toNextJsonResponse(upstream);
    } catch (error) {
        console.error('View tracking proxy error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

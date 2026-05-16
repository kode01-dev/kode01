import { NextResponse } from 'next/server';
import { invokeEdgeFunction, toNextJsonResponse } from '@/lib/edge/invoke';
import { trackInboundApiCallFromRequest } from '@/features/api-monitoring/server/tracker';

export async function POST(req: Request) {
    const monitorStartedAt = Date.now();
    try {
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');

        if (!signature) {
            await trackInboundApiCallFromRequest({
                request: req,
                endpoint: '/api/webhooks/stripe',
                startedAt: monitorStartedAt,
                statusCode: 400,
                metadata: { failure_type: 'missing_signature' },
            });
            return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
        }

        const upstream = await invokeEdgeFunction({
            functionName: 'stripe-webhook',
            method: 'POST',
            requestId: req.headers.get('x-request-id') ?? undefined,
            headers: {
                'Content-Type': 'text/plain',
                'stripe-signature': signature,
            },
            body,
        });

        const response = await toNextJsonResponse(upstream);
        await trackInboundApiCallFromRequest({
            request: req,
            endpoint: '/api/webhooks/stripe',
            startedAt: monitorStartedAt,
            statusCode: response.status,
            metadata: {
                upstream_status: upstream.status,
            },
        });
        return response;
    } catch (error) {
        console.error('Webhook proxy error:', error);
        await trackInboundApiCallFromRequest({
            request: req,
            endpoint: '/api/webhooks/stripe',
            startedAt: monitorStartedAt,
            statusCode: 500,
            metadata: {
                failure_type: 'internal_error',
                error_message: error instanceof Error ? error.message : String(error),
            },
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

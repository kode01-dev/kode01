import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { securityErrorResponse } from '@/lib/security/api-errors';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ product_id: string }> }
) {
    const auditContext = getAuditContextFromRequest(req);
    let actorUserId: string | null = null;
    let productId: string | null = null;
    const requestId = req.headers.get('x-request-id') ?? undefined;
    try {
        const { product_id } = await params;
        productId = product_id;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            await logAuditEvent({
                eventType: 'product.download.failed.unauthorized',
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { product_id: product_id },
            });
            return securityErrorResponse({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Authentication is required.',
                requestId,
            });
        }
        actorUserId = user.id;

        // Check if the user has purchased this product
        const { data: purchase, error: purchaseError } = await supabase
            .from('purchases')
            .select('id, status')
            .eq('product_id', product_id)
            .eq('buyer_id', user.id)
            .in('status', ['completed', 'paid', 'fulfilled'])
            .limit(1)
            .maybeSingle();

        if (purchaseError || !purchase) {
            await logAuditEvent({
                eventType: 'product.download.failed.forbidden',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { product_id: product_id },
            });
            return securityErrorResponse({
                status: 403,
                code: 'FORBIDDEN_RESOURCE',
                message: 'You do not own this product.',
                requestId,
            });
        }

        // Fetch the product's vault file path
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('file_path_vault')
            .eq('id', product_id)
            .single();

        if (productError || !product || !product.file_path_vault) {
            await logAuditEvent({
                eventType: 'product.download.failed.product_not_found',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { product_id: product_id },
            });
            return NextResponse.json({ error: 'Product file not found' }, { status: 404 });
        }

        // Generate a signed URL valid for 60 seconds
        const { data: signedUrlData, error: signedUrlError } = await supabase
            .storage
            .from('vault')
            .createSignedUrl(product.file_path_vault, 60);

        if (signedUrlError || !signedUrlData) {
            console.error('Signed URL generation failed:', signedUrlError);
            await logAuditEvent({
                eventType: 'product.download.failed.signed_url',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: {
                    product_id: product_id,
                    error_message: signedUrlError?.message ?? 'missing_signed_url',
                },
            });
            return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 });
        }

        await logAuditEvent({
            eventType: 'product.download.success',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                product_id: product_id,
            },
        });

        await supabase.from('recommendation_events').insert({
            user_id: user.id,
            event_type: 'download_started',
            source_type: 'download',
            target_product_id: product_id,
            signal_payload: {
                purchase_id: purchase.id,
            },
        });

        // Redirect the user to the signed URL so the download starts
        return NextResponse.redirect(signedUrlData.signedUrl);

    } catch (error) {
        console.error('Download API Error:', error);
        await logAuditEvent({
            eventType: 'product.download.failed.internal_error',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                product_id: productId,
                error_message: error instanceof Error ? error.message : String(error),
            },
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

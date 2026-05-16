import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { revalidateMarketContent } from '@/lib/cache/revalidate';

const reviewSchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(10).max(2000),
});

type ReviewStatsResponse = {
    averageRating: number | null;
    reviewsCount: number;
};

function normalizeStats(raw: { average_rating: number | string | null; reviews_count: number | null } | null): ReviewStatsResponse {
    const averageRaw = raw?.average_rating;
    const countRaw = raw?.reviews_count;
    const averageRating = averageRaw === null ? null : Number(averageRaw);
    const reviewsCount = typeof countRaw === 'number' ? countRaw : 0;

    return {
        averageRating: Number.isFinite(averageRating as number) ? (averageRating as number) : null,
        reviewsCount,
    };
}

async function getProductBySlug(supabase: Awaited<ReturnType<typeof createClient>>, slug: string) {
    const { data: product, error } = await supabase
        .from('products')
        .select('id, seller_id')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

    if (error) {
        throw error;
    }

    return product;
}

async function getStats(supabase: Awaited<ReturnType<typeof createClient>>, productId: string): Promise<ReviewStatsResponse> {
    const { data: stats, error } = await supabase
        .from('product_review_stats')
        .select('average_rating, reviews_count')
        .eq('product_id', productId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return normalizeStats(stats ?? null);
}

async function hasEligiblePurchase(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    productId: string,
    sellerId: string,
): Promise<boolean> {
    if (userId === sellerId) {
        return false;
    }

    const { count, error } = await supabase
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('buyer_id', userId)
        .in('status', ['completed', 'refunded']);

    if (error) {
        throw error;
    }

    return (count ?? 0) > 0;
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const auditContext = getAuditContextFromRequest(req);
    let actorUserId: string | null = null;
    let targetSlug: string | null = null;
    try {
        const { slug } = await params;
        targetSlug = slug;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            await logAuditEvent({
                eventType: 'product.review.upsert.failed.unauthorized',
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug },
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        actorUserId = user.id;

        const rawBody = await req.json().catch(() => null);
        if (!rawBody || typeof rawBody !== 'object') {
            await logAuditEvent({
                eventType: 'product.review.upsert.failed.validation',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug, reason: 'invalid_payload_object' },
            });
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const parsed = reviewSchema.safeParse(rawBody);
        if (!parsed.success) {
            await logAuditEvent({
                eventType: 'product.review.upsert.failed.validation',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: {
                    slug,
                    issues: parsed.error.issues.map((issue) => ({
                        path: issue.path.join('.'),
                        code: issue.code,
                        message: issue.message,
                    })),
                },
            });
            return NextResponse.json(
                { error: 'Validation failed', issues: parsed.error.flatten() },
                { status: 422 },
            );
        }

        const product = await getProductBySlug(supabase, slug);
        if (!product) {
            await logAuditEvent({
                eventType: 'product.review.upsert.failed.product_not_found',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug },
            });
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const eligible = await hasEligiblePurchase(supabase, user.id, product.id, product.seller_id);
        if (!eligible) {
            await logAuditEvent({
                eventType: 'product.review.upsert.failed.forbidden',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug, product_id: product.id },
            });
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: review, error: upsertError } = await supabase
            .from('product_reviews')
            .upsert({
                product_id: product.id,
                buyer_id: user.id,
                rating: parsed.data.rating,
                comment: parsed.data.comment,
            }, { onConflict: 'product_id,buyer_id' })
            .select('id, product_id, buyer_id, rating, comment, created_at, updated_at')
            .single();

        if (upsertError) {
            console.error('Review upsert failed:', upsertError);
            await logAuditEvent({
                eventType: 'product.review.upsert.failed.db_error',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: {
                    slug,
                    product_id: product.id,
                    error_message: upsertError.message,
                },
            });
            return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
        }

        await logAuditEvent({
            eventType: 'product.review.upsert.success',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                slug,
                product_id: product.id,
                review_id: review.id,
                rating: review.rating,
            },
        });

        revalidateMarketContent();
        const stats = await getStats(supabase, product.id);
        return NextResponse.json({ review, stats }, { status: 200 });
    } catch (error) {
        console.error('POST /api/products/[slug]/reviews error:', error);
        await logAuditEvent({
            eventType: 'product.review.upsert.failed.internal_error',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                slug: targetSlug,
                error_message: error instanceof Error ? error.message : String(error),
            },
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const auditContext = getAuditContextFromRequest(req);
    let actorUserId: string | null = null;
    let targetSlug: string | null = null;
    try {
        const { slug } = await params;
        targetSlug = slug;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            await logAuditEvent({
                eventType: 'product.review.delete.failed.unauthorized',
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug },
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        actorUserId = user.id;

        const product = await getProductBySlug(supabase, slug);
        if (!product) {
            await logAuditEvent({
                eventType: 'product.review.delete.failed.product_not_found',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug },
            });
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        const eligible = await hasEligiblePurchase(supabase, user.id, product.id, product.seller_id);
        if (!eligible) {
            await logAuditEvent({
                eventType: 'product.review.delete.failed.forbidden',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: { slug, product_id: product.id },
            });
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { error: deleteError } = await supabase
            .from('product_reviews')
            .delete()
            .eq('product_id', product.id)
            .eq('buyer_id', user.id);

        if (deleteError) {
            console.error('Review delete failed:', deleteError);
            await logAuditEvent({
                eventType: 'product.review.delete.failed.db_error',
                userId: actorUserId,
                path: auditContext.path,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
                metadata: {
                    slug,
                    product_id: product.id,
                    error_message: deleteError.message,
                },
            });
            return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 });
        }

        await logAuditEvent({
            eventType: 'product.review.delete.success',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                slug,
                product_id: product.id,
            },
        });

        revalidateMarketContent();
        const stats = await getStats(supabase, product.id);
        return NextResponse.json({ ok: true, stats }, { status: 200 });
    } catch (error) {
        console.error('DELETE /api/products/[slug]/reviews error:', error);
        await logAuditEvent({
            eventType: 'product.review.delete.failed.internal_error',
            userId: actorUserId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
                slug: targetSlug,
                error_message: error instanceof Error ? error.message : String(error),
            },
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { securityErrorResponse } from '@/lib/security/api-errors';

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

/**
 * GET /api/account/export
 * Exports all personal data for the authenticated user as JSON.
 * Supports GDPR Art. 20 (data portability) and CCPA right to know.
 */
export async function GET(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return securityErrorResponse({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
        requestId: request.headers.get('x-request-id') ?? undefined,
      });
    }

    await logAuditEvent({
      eventType: 'account_export_requested',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    // Fetch all user data in parallel
    const [
      profileResult,
      productsResult,
      buyerPurchasesResult,
      sellerPurchasesResult,
      savedItemsResult,
      recommendationEventsResult,
      cookieConsentEventsResult,
      marketingEventsResult,
      cartsResult,
      abandonedCartEmailJobsResult,
      pushSubscriptionsResult,
      notificationsResult,
      reviewsResult,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('products').select('id, title, slug, description, price_usd, price_cad, status, created_at, updated_at').eq('seller_id', user.id),
      supabase.from('purchases').select('*').eq('buyer_id', user.id),
      supabase.from('purchases').select('*').eq('seller_id', user.id),
      supabase.from('user_saved_items').select('id, product_id, created_at').eq('user_id', user.id),
      supabase.from('recommendation_events').select('*').eq('user_id', user.id),
      supabase.from('cookie_consent_events').select('*').eq('user_id', user.id),
      supabase.from('marketing_campaign_events').select('*').eq('user_id', user.id),
      supabase.from('carts').select('*').eq('user_id', user.id),
      supabase.from('abandoned_cart_email_jobs').select('*').eq('user_id', user.id),
      supabase.from('notification_push_subscriptions').select('id, endpoint, device_label, is_active, user_agent, created_at, updated_at, last_seen_at').eq('user_id', user.id),
      supabase.from('notifications').select('*').eq('user_id', user.id),
      supabase.from('product_reviews').select('id, product_id, rating, comment, created_at').eq('user_id', user.id),
    ]);

    const queryErrors = [
      profileResult.error,
      productsResult.error,
      buyerPurchasesResult.error,
      sellerPurchasesResult.error,
      savedItemsResult.error,
      recommendationEventsResult.error,
      cookieConsentEventsResult.error,
      marketingEventsResult.error,
      cartsResult.error,
      abandonedCartEmailJobsResult.error,
      pushSubscriptionsResult.error,
      notificationsResult.error,
      reviewsResult.error,
    ].filter(isNotNull);

    if (queryErrors.length > 0) {
      console.error(
        'Data export query failures:',
        queryErrors.map((error) => error.message),
      );
      await logAuditEvent({
        eventType: 'account_export_failed',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          failure_count: queryErrors.length,
        },
      });
      return NextResponse.json({ error: 'Failed to export complete account data' }, { status: 500 });
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      profile: profileResult.data ?? null,
      products: productsResult.data ?? [],
      purchases: {
        as_buyer: buyerPurchasesResult.data ?? [],
        as_seller: sellerPurchasesResult.data ?? [],
      },
      saved_items: savedItemsResult.data ?? [],
      recommendation_events: recommendationEventsResult.data ?? [],
      cookie_consent_events: cookieConsentEventsResult.data ?? [],
      marketing_campaign_events: marketingEventsResult.data ?? [],
      carts: cartsResult.data ?? [],
      abandoned_cart_email_jobs: abandonedCartEmailJobsResult.data ?? [],
      notification_push_subscriptions: pushSubscriptionsResult.data ?? [],
      notifications: notificationsResult.data ?? [],
      reviews: reviewsResult.data ?? [],
    };

    await logAuditEvent({
      eventType: 'account_export_succeeded',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        exported_sections: Object.keys(exportData),
      },
    });

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kode01-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error('Data export error:', error);
    await logAuditEvent({
      eventType: 'account_export_failed',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        reason: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

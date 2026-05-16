import { NextResponse } from 'next/server';
import { isSellerRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import {
  STRIPE_CONNECT_CALLBACK_HTTPS_ERROR,
  StripeConnectCallbackUrlError,
} from '@/lib/stripe/connect-callback-url';
import { createVendorOnboardingAccountLink } from '@/lib/stripe/connect-onboarding';
import {
  STRIPE_CONNECT_STATE_SECRET_ERROR,
  StripeConnectStateSecretError,
  verifyStripeConnectState,
} from '@/lib/stripe/connect-state';
import { getStripeClientForConnectSample } from '@/lib/stripe/connect-sample';

function normalizeLocale(input: string | undefined): string {
  return input?.trim().toLowerCase() === 'fr' ? 'fr' : 'en';
}

function redirectToVendor(req: Request, locale: string, error: string): NextResponse {
  const url = new URL(`/${normalizeLocale(locale)}/vendor`, req.url);
  url.searchParams.set('stripe_connect_error', error);

  return NextResponse.redirect(url, 303);
}

export async function GET(req: Request) {
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const auditContext = getAuditContextFromRequest(req);
  const state = new URL(req.url).searchParams.get('state');
  const verifiedState = verifyStripeConnectState(state, {
    expectedPurpose: 'vendor_onboarding',
  });

  if (!verifiedState.ok) {
    await logAuditEvent({
      eventType: 'stripe_connect.refresh.failed',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        request_id: requestId,
        reason: verifiedState.reason,
      },
    });
    return redirectToVendor(req, 'en', 'invalid_state');
  }

  const { payload } = verifiedState;

  try {
    await logAuditEvent({
      eventType: 'stripe_connect.refresh.started',
      userId: payload.userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        request_id: requestId,
        stripe_account_id: payload.stripeAccountId,
      },
    });

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      await logAuditEvent({
        eventType: 'stripe_connect.refresh.failed',
        userId: payload.userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          request_id: requestId,
          reason: 'session_expired',
          stripe_account_id: payload.stripeAccountId,
        },
      });
      return redirectToVendor(req, payload.locale, 'session_expired');
    }

    if (user.id !== payload.userId) {
      await logAuditEvent({
        eventType: 'stripe_connect.refresh.failed',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          request_id: requestId,
          reason: 'wrong_user',
          stripe_account_id: payload.stripeAccountId,
        },
      });
      return redirectToVendor(req, payload.locale, 'invalid_state');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, stripe_account_id')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !isSellerRole(profile.role) ||
      profile.stripe_account_id !== payload.stripeAccountId
    ) {
      await logAuditEvent({
        eventType: 'stripe_connect.refresh.failed',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          request_id: requestId,
          reason: 'account_not_accessible',
          stripe_account_id: payload.stripeAccountId,
        },
      });
      return redirectToVendor(req, payload.locale, 'account_not_accessible');
    }

    const stripeClient = getStripeClientForConnectSample();
    const accountLink = await createVendorOnboardingAccountLink({
      request: req,
      accountLinks: stripeClient.v2.core.accountLinks,
      userId: user.id,
      stripeAccountId: payload.stripeAccountId,
      locale: payload.locale,
    });

    await logAuditEvent({
      eventType: 'stripe_connect.account_link.created',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        request_id: requestId,
        stripe_account_id: payload.stripeAccountId,
        environment: process.env.NODE_ENV ?? 'development',
        source: 'refresh',
        refresh_url_host: new URL(accountLink.refreshUrl).host,
        return_url_host: new URL(accountLink.returnUrl).host,
      },
    });

    return NextResponse.redirect(accountLink.url, 303);
  } catch (error) {
    console.error('Stripe Connect refresh error:', error);
    await logAuditEvent({
      eventType: 'stripe_connect.refresh.failed',
      userId: payload.userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        request_id: requestId,
        reason: error instanceof StripeConnectCallbackUrlError
          ? STRIPE_CONNECT_CALLBACK_HTTPS_ERROR
          : error instanceof StripeConnectStateSecretError
            ? STRIPE_CONNECT_STATE_SECRET_ERROR
          : 'unknown',
        stripe_account_id: payload.stripeAccountId,
      },
    });

    return redirectToVendor(
      req,
      payload.locale,
      error instanceof StripeConnectCallbackUrlError
        ? STRIPE_CONNECT_CALLBACK_HTTPS_ERROR
        : error instanceof StripeConnectStateSecretError
          ? STRIPE_CONNECT_STATE_SECRET_ERROR
        : 'refresh_failed',
    );
  }
}

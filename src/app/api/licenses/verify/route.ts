import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRouteRateLimit } from '@/lib/security/rate-limit-route';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { authenticateVendorIntegrationByProduct } from '@/features/licenses/server/integration-auth';
import { trackInboundApiCallFromRequest } from '@/features/api-monitoring/server/tracker';

const verifyLicenseSchema = z.object({
  licenseKey: z.string().trim().min(8).max(255),
  productId: z.string().uuid(),
});

type LicenseVerifyRow = {
  id: string;
  status: 'active' | 'revoked';
  uses_count: number;
  max_uses: number | null;
  purchases: {
    status: 'pending' | 'completed' | 'refunded' | 'failed' | null;
  } | null;
};

export async function POST(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  const monitorStartedAt = Date.now();
  let productIdForLogs: string | null = null;
  const respond = async (
    payload: Record<string, unknown>,
    status = 200,
    metadata?: Record<string, unknown>,
  ) => {
    await trackInboundApiCallFromRequest({
      request,
      endpoint: '/api/licenses/verify',
      startedAt: monitorStartedAt,
      statusCode: status,
      metadata,
    });
    return NextResponse.json(payload, { status });
  };

  try {
    const payload = await request.json().catch(() => null);
    const parsed = verifyLicenseSchema.safeParse(payload);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'license.verify.failed.validation',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return respond({ error: 'Invalid payload' }, 400, { failure_type: 'validation' });
    }

    const { licenseKey, productId } = parsed.data;
    productIdForLogs = productId;

    const rateLimited = await enforceRouteRateLimit({
      request,
      action: 'LICENSE_API',
      extraKeyPart: productId,
    });
    if (rateLimited) {
      const status = rateLimited.status;
      await trackInboundApiCallFromRequest({
        request,
        endpoint: '/api/licenses/verify',
        startedAt: monitorStartedAt,
        statusCode: status,
        metadata: { failure_type: 'rate_limit' },
      });
      return rateLimited;
    }

    const admin = createAdminClient();
    const authResult = await authenticateVendorIntegrationByProduct({
      admin,
      productId,
      authorizationHeader: request.headers.get('authorization'),
    });

    if (!authResult.ok) {
      await logAuditEvent({
        eventType: 'license.verify.failed.auth',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          status: authResult.status,
          reason: authResult.error,
        },
      });
      return respond(
        { error: authResult.error },
        authResult.status,
        { failure_type: 'auth', product_id: productId },
      );
    }

    const { data: license, error: licenseError } = await admin
      .from('license_keys')
      .select('id, status, uses_count, max_uses, purchases!inner(status)')
      .eq('key', licenseKey)
      .eq('product_id', productId)
      .maybeSingle();

    if (licenseError) {
      await logAuditEvent({
        eventType: 'license.verify.failed.lookup',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          seller_id: authResult.sellerId,
          error_message: licenseError.message,
        },
      });
      return respond(
        { error: 'Failed to verify license' },
        500,
        { failure_type: 'lookup', product_id: productId },
      );
    }

    if (!license) {
      await logAuditEvent({
        eventType: 'license.verify.not_found',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          seller_id: authResult.sellerId,
        },
      });
      return respond(
        {
          valid: false,
          status: 'not_found',
          purchaseStatus: null,
          maxUses: null,
          usesCount: 0,
          canActivate: false,
        },
        200,
        { business_status: 'not_found', product_id: productId },
      );
    }

    const normalizedLicense = license as unknown as LicenseVerifyRow;
    const purchaseStatus = normalizedLicense.purchases?.status ?? null;
    const maxUses = normalizedLicense.max_uses;
    const usesCount = normalizedLicense.uses_count;
    const hasCapacity = maxUses === null || usesCount < maxUses;
    const canActivate =
      normalizedLicense.status === 'active'
      && purchaseStatus === 'completed'
      && hasCapacity;

    await logAuditEvent({
      eventType: 'license.verify.success',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        product_id: productId,
        seller_id: authResult.sellerId,
        status: normalizedLicense.status,
        purchase_status: purchaseStatus,
        can_activate: canActivate,
      },
    });

    return respond(
      {
        valid: canActivate,
        status: normalizedLicense.status,
        purchaseStatus,
        maxUses,
        usesCount,
        canActivate,
      },
      200,
      { business_status: 'success', product_id: productId, can_activate: canActivate },
    );
  } catch (error) {
    console.error('POST /api/licenses/verify error:', error);
    await logAuditEvent({
      eventType: 'license.verify.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        product_id: productIdForLogs,
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return respond(
      { error: 'Internal Server Error' },
      500,
      { failure_type: 'internal_error', product_id: productIdForLogs },
    );
  }
}

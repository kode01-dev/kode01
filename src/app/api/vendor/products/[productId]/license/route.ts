import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRouteRateLimit } from '@/lib/security/rate-limit-route';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';

const updateLicenseFlagSchema = z.object({
  generatesLicenseKey: z.boolean(),
});

const routeParamsSchema = z.object({
  productId: z.string().uuid(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  let productId: string | null = null;

  try {
    const resolvedParams = routeParamsSchema.safeParse(await params);
    if (!resolvedParams.success) {
      return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
    }
    productId = resolvedParams.data.productId;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      await logAuditEvent({
        eventType: 'vendor.product_license_toggle.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { product_id: productId },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    actorUserId = user.id;

    const rateLimited = await enforceRouteRateLimit({
      request,
      action: 'LICENSE_API',
      extraKeyPart: `${user.id}:${productId}`,
    });
    if (rateLimited) return rateLimited;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      await logAuditEvent({
        eventType: 'vendor.product_license_toggle.failed.profile_lookup',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          error_message: profileError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    if (profile?.role !== 'seller') {
      await logAuditEvent({
        eventType: 'vendor.product_license_toggle.failed.forbidden_role',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          role: profile?.role ?? null,
        },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = updateLicenseFlagSchema.safeParse(payload);

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'vendor.product_license_toggle.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: updatedProduct, error: updateError } = await admin
      .from('products')
      .update({
        generates_license_key: parsed.data.generatesLicenseKey,
      })
      .eq('id', productId)
      .eq('seller_id', user.id)
      .select('id, generates_license_key, updated_at')
      .maybeSingle();

    if (updateError) {
      await logAuditEvent({
        eventType: 'vendor.product_license_toggle.failed.update',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
          error_message: updateError.message,
        },
      });
      return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }

    if (!updatedProduct) {
      await logAuditEvent({
        eventType: 'vendor.product_license_toggle.failed.product_not_found',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          product_id: productId,
        },
      });
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    await logAuditEvent({
      eventType: 'vendor.product_license_toggle.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        product_id: updatedProduct.id,
        generates_license_key: updatedProduct.generates_license_key,
      },
    });

    return NextResponse.json({
      productId: updatedProduct.id,
      generatesLicenseKey: updatedProduct.generates_license_key,
      updatedAt: updatedProduct.updated_at,
    });
  } catch (error) {
    console.error('PATCH /api/vendor/products/[productId]/license error:', error);
    await logAuditEvent({
      eventType: 'vendor.product_license_toggle.failed.internal_error',
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

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { dispatchNotification } from '@/features/notifications/server/dispatch';
import type { Json } from '@/types/database.types';

const activateLicenseSchema = z.object({
  licenseKey: z.string().trim().min(32).max(128),
  instanceId: z.string().trim().min(8).max(128),
  instanceName: z.string().trim().max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type ActivateLicenseRpcResult = {
  ok?: boolean;
  error_code?: string | null;
  message?: string | null;
  owner_user_id?: string | null;
  license_id?: string | null;
  product_name?: string | null;
  activated_at?: string | null;
};

type LegacyRpcInvoker = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function POST(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  const payload = await req.json().catch(() => null);

  const parsed = activateLicenseSchema.safeParse(payload);
  if (!parsed.success) {
    await logAuditEvent({
      eventType: 'license.activation.failed.validation',
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

    return NextResponse.json(
      { error: 'Invalid request payload', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const admin = createAdminClient();

  try {
    const rpcPayload: Record<string, unknown> = {
      p_license_key: input.licenseKey,
      p_instance_id: input.instanceId,
      p_instance_name: input.instanceName ?? null,
      p_metadata: (input.metadata ?? {}) as Json,
    };
    const rpcClient = admin as unknown as LegacyRpcInvoker;
    const { data, error } = await rpcClient.rpc('activate_license_key_v1', rpcPayload);

    if (error) {
      await logAuditEvent({
        eventType: 'license.activation.failed.db_error',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          licenseKey: input.licenseKey,
          error: error.message,
        },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (data ?? {}) as ActivateLicenseRpcResult;
    if (result.ok !== true) {
      await logAuditEvent({
        eventType: 'license.activation.failed.logic',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          licenseKey: input.licenseKey,
          reason: result.error_code,
        },
      });
      return NextResponse.json(
        { error: result.message || 'Activation failed', code: result.error_code },
        { status: 400 },
      );
    }

    await logAuditEvent({
      eventType: 'license.activation.success',
      userId: result.owner_user_id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        licenseKey: input.licenseKey,
        instanceId: input.instanceId,
      },
    });

    if (result.owner_user_id) {
      try {
        await dispatchNotification({
          recipientUserId: result.owner_user_id,
          templateKey: 'license_activated',
          locale: 'en', // Required by dispatchNotification
          title: 'Licence activée',
          message: `Votre licence pour ${result.product_name || 'le produit'} a été activée avec succès.`,
          metadata: {
            license_id: result.license_id,
            product_name: result.product_name,
            instance_name: input.instanceName,
          },
        });
      } catch (notifError) {
        console.error('Failed to dispatch activation notification:', notifError);
      }
    }

    return NextResponse.json({
      success: true,
      license_id: result.license_id,
      activated_at: result.activated_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown activation error';
    console.error('License activation fatal error:', err);
    await logAuditEvent({
      eventType: 'license.activation.failed.internal',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error: message },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

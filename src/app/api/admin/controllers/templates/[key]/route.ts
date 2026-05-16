import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { getAdminSessionOrNull } from '@/app/api/admin/controllers/_lib';
import { createAdminClient } from '@/lib/supabase/admin';

const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    subjectEn: z.string().trim().min(1).optional(),
    subjectFr: z.string().trim().min(1).optional(),
    messageEn: z.string().trim().min(1).optional(),
    messageFr: z.string().trim().min(1).optional(),
    emailEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  let templateKey: string | null = null;

  try {
    const { key } = await params;
    templateKey = key;

    const adminSession = await getAdminSessionOrNull(req);
    if (!adminSession) {
      await logAuditEvent({
        eventType: 'controllers.templates.update.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { template_key: key },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    actorUserId = adminSession.userId;

    const body = await req.json().catch(() => null);
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'controllers.templates.update.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          template_key: key,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const updatePayload = {
      name: input.name,
      description: input.description,
      subject_en: input.subjectEn,
      subject_fr: input.subjectFr,
      message_en: input.messageEn,
      message_fr: input.messageFr,
      email_enabled: input.emailEnabled,
      in_app_enabled: input.inAppEnabled,
      push_enabled: input.pushEnabled,
      is_active: input.isActive,
    };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notification_templates')
      .update(updatePayload)
      .eq('key', key)
      .select(
        'key, name, description, subject_en, subject_fr, message_en, message_fr, email_enabled, in_app_enabled, push_enabled, is_active, updated_at',
      )
      .single();

    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    await logAuditEvent({
      eventType: 'controllers.templates.update.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { template_key: key },
    });

    return NextResponse.json({ template: data });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Admin controllers template PATCH error:', error);

    await logAuditEvent({
      eventType: 'controllers.templates.update.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { template_key: templateKey, error_message: errorMessage },
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

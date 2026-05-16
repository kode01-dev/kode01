import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { optionalNullableCtaUrlSchema } from '@/lib/security/cta-url-schema';
import { ensureOptimizedStorageImageUrl } from '@/lib/images/server/core-image-pipeline';
import { isAdminRole } from '@/lib/auth/roles';

// Partial campaign schema for updates
const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  template_id: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed', 'archived']).optional(),

  title_en: z.string().min(1).optional(),
  title_fr: z.string().min(1).optional(),
  body_en: z.string().optional().nullable(),
  body_fr: z.string().optional().nullable(),
  cta_text_en: z.string().optional().nullable(),
  cta_text_fr: z.string().optional().nullable(),
  cta_url: optionalNullableCtaUrlSchema,

  image_url: z.string().url().optional().nullable(),
  background_image_url: z.string().url().optional().nullable(),

  start_at: z.string().datetime().optional().nullable(),
  end_at: z.string().datetime().optional().nullable(),

  targeting_rules: z.object({
    pages: z.array(z.string()),
    excludePages: z.array(z.string()),
    userRoles: z.array(z.string()),
    locales: z.array(z.string()),
    deviceTypes: z.array(z.enum(['desktop', 'mobile', 'tablet'])),
  }).optional(),

  trigger_type: z.enum(['page_load', 'scroll_depth', 'time_delay', 'exit_intent', 'manual']).optional(),
  trigger_config: z.object({
    delay: z.number().optional(),
    scrollDepth: z.number().optional(),
    showOnce: z.boolean().optional(),
    cooldownHours: z.number().optional(),
  }).optional(),

  priority: z.number().int().optional(),
});

// Helper function to check admin role
async function checkAdminRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, error: 'Unauthorized', status: 401 };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!isAdminRole(profile?.role)) {
    return { authorized: false, error: 'Forbidden', status: 403 };
  }

  return { authorized: true, user };
}

/**
 * GET /api/admin/marketing/campaigns/[id]
 * Get a specific campaign (admin only)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const adminCheck = await checkAdminRole(supabase);
    if (!adminCheck.authorized) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const { data: campaign, error } = await supabase
      .from('marketing_campaigns')
      .select(
        `
        *,
        template:marketing_templates(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/marketing/campaigns/[id]
 * Update a campaign (admin only)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  try {
    const { id } = await params;
    const supabase = await createClient();

    const adminCheck = await checkAdminRole(supabase);
    if (!adminCheck.authorized) {
      await logAuditEvent({
        eventType: 'marketing.campaign.update.failed.forbidden',
        userId: null,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          campaign_id: id,
          status_code: adminCheck.status,
          error: adminCheck.error,
        },
      });
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    if (!adminCheck.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminUserId = adminCheck.user.id;
    actorUserId = adminUserId;

    // Parse and validate body
    const body = await request.json();
    const parsed = updateCampaignSchema.safeParse(body);

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'marketing.campaign.update.failed.validation',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          campaign_id: id,
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
        { status: 400 }
      );
    }

    const data = parsed.data;
    try {
      const storageAdmin = createAdminClient();
      if (typeof data.image_url === 'string') {
        data.image_url = await ensureOptimizedStorageImageUrl({
          admin: storageAdmin,
          bucket: 'covers',
          sourceUrl: data.image_url,
          pathPrefix: `marketing/${adminUserId}`,
          pathLabel: 'campaign-image',
          timeoutMs: 15_000,
        });
      }

      if (typeof data.background_image_url === 'string') {
        data.background_image_url = await ensureOptimizedStorageImageUrl({
          admin: storageAdmin,
          bucket: 'covers',
          sourceUrl: data.background_image_url,
          pathPrefix: `marketing/${adminUserId}`,
          pathLabel: 'campaign-bg',
          timeoutMs: 15_000,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logAuditEvent({
        eventType: 'marketing.campaign.update.failed.image_normalization',
        userId: actorUserId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          campaign_id: id,
          error_message: errorMessage,
        },
      });
      return NextResponse.json({ error: `Image normalization failed: ${errorMessage}` }, { status: 400 });
    }

    // Recalculate content locales if titles changed
    if ('title_en' in data || 'title_fr' in data) {
      const { data: existing } = await supabase
        .from('marketing_campaigns')
        .select('title_en, title_fr')
        .eq('id', id)
        .single();

      if (existing) {
        const title_en = data.title_en ?? existing.title_en;
        const title_fr = data.title_fr ?? existing.title_fr;

        const content_locales: string[] = [];
        if (title_en) content_locales.push('en');
        if (title_fr) content_locales.push('fr');

        Object.assign(data, {
          content_locales,
          content_source_locale: title_en ? 'en' : 'fr',
        });
      }
    }

    // Update campaign
    const { data: campaign, error } = await supabase
      .from('marketing_campaigns')
      .update({
        ...data,
        updated_by: adminUserId,
      })
      .eq('id', id)
      .select(
        `
        *,
        template:marketing_templates(*)
      `
      )
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      throw error;
    }

    await logAuditEvent({
      eventType: 'marketing.campaign.update.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: id,
        status: campaign.status,
        priority: campaign.priority,
      },
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('Error updating campaign:', error);
    await logAuditEvent({
      eventType: 'marketing.campaign.update.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/marketing/campaigns/[id]
 * Delete a campaign (soft delete - archive it)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  try {
    const { id } = await params;
    const supabase = await createClient();

    const adminCheck = await checkAdminRole(supabase);
    if (!adminCheck.authorized) {
      await logAuditEvent({
        eventType: 'marketing.campaign.archive.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          campaign_id: id,
          status_code: adminCheck.status,
          error: adminCheck.error,
        },
      });
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }
    actorUserId = adminCheck.user?.id ?? null;

    // Soft delete by archiving
    const { error } = await supabase
      .from('marketing_campaigns')
      .update({ status: 'archived' })
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
      throw error;
    }

    await logAuditEvent({
      eventType: 'marketing.campaign.archive.success',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    await logAuditEvent({
      eventType: 'marketing.campaign.archive.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}


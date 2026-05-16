import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { optionalNullableCtaUrlSchema } from '@/lib/security/cta-url-schema';
import { ensureOptimizedStorageImageUrl } from '@/lib/images/server/core-image-pipeline';
import { isAdminRole } from '@/lib/auth/roles';

// Validation schema for campaign creation
const campaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  template_id: z.string().uuid().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed', 'archived']),

  title_en: z.string().min(1, 'English title is required'),
  title_fr: z.string().min(1, 'French title is required'),
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
  }),

  trigger_type: z.enum(['page_load', 'scroll_depth', 'time_delay', 'exit_intent', 'manual']),
  trigger_config: z.object({
    delay: z.number().optional(),
    scrollDepth: z.number().optional(),
    showOnce: z.boolean().optional(),
    cooldownHours: z.number().optional(),
  }),

  priority: z.number().int().default(0),
});

type CampaignInput = z.infer<typeof campaignSchema>;
const campaignStatuses = campaignSchema.shape.status.options;

/**
 * GET /api/admin/marketing/campaigns
 * List all marketing campaigns (admin only)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Check admin role
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    let query = supabase
      .from('marketing_campaigns')
      .select(
        `
        *,
        template:marketing_templates(*)
      `,
        { count: 'exact' }
      )
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (status && campaignStatuses.includes(status as CampaignInput['status'])) {
      query = query.eq('status', status as CampaignInput['status']);
    }

    const { data: campaigns, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({ campaigns, total: count, limit, offset });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

/**
 * POST /api/admin/marketing/campaigns
 * Create a new marketing campaign (admin only)
 */
export async function POST(request: Request) {
  const auditContext = getAuditContextFromRequest(request);
  let actorUserId: string | null = null;
  try {
    const supabase = await createClient();

    // Check admin role
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      await logAuditEvent({
        eventType: 'marketing.campaign.create.failed.unauthorized',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    actorUserId = user.id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!isAdminRole(profile?.role)) {
      await logAuditEvent({
        eventType: 'marketing.campaign.create.failed.forbidden',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { role: profile?.role ?? null },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse and validate body
    const body = await request.json();
    const parsed = campaignSchema.safeParse(body);

    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'marketing.campaign.create.failed.validation',
        userId: user.id,
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
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data as CampaignInput;
    let imageUrlForInsert: string | null | undefined = data.image_url;
    let backgroundImageUrlForInsert: string | null | undefined = data.background_image_url;

    try {
      const storageAdmin = createAdminClient();
      if (typeof data.image_url === 'string') {
        imageUrlForInsert = await ensureOptimizedStorageImageUrl({
          admin: storageAdmin,
          bucket: 'covers',
          sourceUrl: data.image_url,
          pathPrefix: `marketing/${user.id}`,
          pathLabel: 'campaign-image',
          timeoutMs: 15_000,
        });
      }

      if (typeof data.background_image_url === 'string') {
        backgroundImageUrlForInsert = await ensureOptimizedStorageImageUrl({
          admin: storageAdmin,
          bucket: 'covers',
          sourceUrl: data.background_image_url,
          pathPrefix: `marketing/${user.id}`,
          pathLabel: 'campaign-bg',
          timeoutMs: 15_000,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await logAuditEvent({
        eventType: 'marketing.campaign.create.failed.image_normalization',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: errorMessage },
      });
      return NextResponse.json({ error: `Image normalization failed: ${errorMessage}` }, { status: 400 });
    }

    // Determine content locales
    const content_locales: string[] = [];
    if (data.title_en) content_locales.push('en');
    if (data.title_fr) content_locales.push('fr');

    // Determine source locale (first non-empty)
    const content_source_locale = data.title_en ? 'en' : 'fr';

    // Insert campaign
    const { data: campaign, error } = await supabase
      .from('marketing_campaigns')
      .insert({
        ...data,
        image_url: imageUrlForInsert,
        background_image_url: backgroundImageUrlForInsert,
        content_locales,
        content_source_locale,
        created_by: user.id,
        updated_by: user.id,
      })
      .select(
        `
        *,
        template:marketing_templates(*)
      `
      )
      .single();

    if (error) throw error;

    await logAuditEvent({
      eventType: 'marketing.campaign.create.success',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: campaign.id,
        status: campaign.status,
        template_id: campaign.template_id ?? null,
      },
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('Error creating campaign:', error);
    await logAuditEvent({
      eventType: 'marketing.campaign.create.failed.internal_error',
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

    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}


import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeCampaignPrice } from '@/features/ads/server/pricing';
import { AdPlacementSlug } from '@/features/ads/types';
import { adCreativeGuidelines } from '@/features/ads/creative-guidelines';
import { isAdsMemberRole } from '@/features/ads/server/access';
import { buildNewsRotationPolicySnapshot } from '@/features/ads/server/inventory';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/auth/roles';
import {
  ensureOptimizedStorageImageUrl,
  isOptimizedPublicStorageUrl,
} from '@/lib/images/server/core-image-pipeline';

const createCampaignSchema = z.object({
  name: z.string().trim().min(3).max(120),
  advertiserType: z.enum(['user', 'company', 'admin']),
  pricingPlanId: z.string().uuid(),
  placementSlugs: z.array(z.enum(['news', 'newsletter_footer'])).min(1).max(2),
  newsFormat: z.enum(['split', 'full']).optional(),
  creative: z.object({
    title: z.string().trim().min(3).max(90),
    ctaText: z.string().trim().min(2).max(40),
    imageUrl: z.string().url().max(1200).optional(),
    destinationUrl: z.string().trim().min(1).max(1800),
    destinationKind: z.enum(['internal', 'external']).optional(),
    locale: z.enum(['fr', 'en']).optional(),
  }),
  creativeSlots: z
    .array(
      z.object({
        placementSlug: z.enum(['news', 'newsletter_footer']),
        imageUrl: z.string().url().max(1200),
        pagesCount: z.number().int().min(1).max(500).optional(),
      }),
    )
    .max(2)
    .optional(),
});

function isValidDestination(destinationUrl: string, destinationKind: 'internal' | 'external') {
  if (destinationKind === 'internal') {
    return destinationUrl.startsWith('/');
  }

  try {
    const url = new URL(destinationUrl);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSecureOrLocalAssetUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;

    return (
      url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '::1'
      || url.hostname.endsWith('.local')
    );
  } catch {
    return false;
  }
}

function validateCreativeForPlacements(args: {
  placementSlugs: AdPlacementSlug[];
  title: string;
  ctaText: string;
  imageUrlsByPlacement: Map<AdPlacementSlug, string>;
  destinationUrl: string;
  destinationKind: 'internal' | 'external';
}) {
  const errors: string[] = [];
  for (const placementSlug of args.placementSlugs) {
    const imageUrl = args.imageUrlsByPlacement.get(placementSlug);
    if (!imageUrl) {
      errors.push(`${placementSlug} placement: missing image URL.`);
      continue;
    }

    if (!isSecureOrLocalAssetUrl(imageUrl)) {
      errors.push(`${placementSlug} placement: image URL must use HTTPS (or localhost for local testing).`);
    }
  }

  if (args.placementSlugs.includes('news')) {
    const rules = adCreativeGuidelines.placementRestrictions.news.enforced;
    const newsImageUrl = args.imageUrlsByPlacement.get('news');

    if (args.title.length > rules.titleMaxChars) {
      errors.push(`News placement: title must be ${rules.titleMaxChars} characters or fewer.`);
    }

    if (args.ctaText.length > rules.ctaMaxChars) {
      errors.push(`News placement: CTA must be ${rules.ctaMaxChars} characters or fewer.`);
    }

    if (rules.requireImageUrlHttps && newsImageUrl && !isSecureOrLocalAssetUrl(newsImageUrl)) {
      errors.push('News placement: image URL must use HTTPS (or localhost for local testing).');
    }

    if (
      rules.requireExternalDestinationHttps
      && args.destinationKind === 'external'
      && !isHttpsUrl(args.destinationUrl)
    ) {
      errors.push('News placement: external destination URL must use HTTPS.');
    }
  }

  return errors;
}

export async function GET() {
  try {
    const supabase = await createClient();
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
      .maybeSingle();

    if (!isAdsMemberRole(profile?.role)) {
      return NextResponse.json({ error: 'Advertising is restricted to members.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('ad_campaigns')
      .select(
        `
        id,
        name,
        advertiser_type,
        status,
        total_price,
        total_price_usd,
        currency,
        is_paid,
        news_format,
        rotation_policy_snapshot,
        duration_days,
        created_at,
        start_at,
        end_at,
        ad_campaign_placements (
          ad_placements ( slug, channel, price_multiplier )
        ),
        ad_creatives (
          id, placement_slug, page_count, title, cta_text, image_url, destination_url, destination_kind, validation_status, locale
        )
      `,
      )
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('List campaigns error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  let actorUserId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.unauthorized',
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
      .maybeSingle();

    if (!isAdsMemberRole(profile?.role)) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.forbidden_role',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { role: profile?.role ?? null },
      });
      return NextResponse.json({ error: 'Advertising is restricted to members.' }, { status: 403 });
    }

    const payload = await req.json().catch(() => null);
    const parsed = createCampaignSchema.safeParse(payload);
    if (!parsed.success) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.validation',
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
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;
    const selectedPlacementSlugs = Array.from(new Set(body.placementSlugs)) as AdPlacementSlug[];
    if (selectedPlacementSlugs.length !== body.placementSlugs.length) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.validation',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          reason: 'duplicate_placement_slugs',
          placement_slugs: body.placementSlugs,
        },
      });
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: {
            placementSlugs: ['placementSlugs contains duplicated values'],
          },
        },
        { status: 400 },
      );
    }

    const includesNewsPlacement = selectedPlacementSlugs.includes('news');
    const resolvedNewsFormat = includesNewsPlacement ? body.newsFormat : undefined;

    const imageUrlsByPlacement = new Map<AdPlacementSlug, string>();
    const pageCountByPlacement = new Map<AdPlacementSlug, number>();
    if (Array.isArray(body.creativeSlots)) {
      for (const slot of body.creativeSlots) {
        const placementSlug = slot.placementSlug as AdPlacementSlug;
        if (!selectedPlacementSlugs.includes(placementSlug)) {
          await logAuditEvent({
            eventType: 'ads.campaign.create.failed.validation',
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
              reason: 'creative_slot_not_selected',
              placement_slug: placementSlug,
              selected_placements: selectedPlacementSlugs,
            },
          });
          return NextResponse.json(
            {
              error: 'Invalid payload',
              details: {
                creativeSlots: [`${placementSlug} is not in placementSlugs`],
              },
            },
            { status: 400 },
          );
        }

        if (imageUrlsByPlacement.has(placementSlug)) {
          await logAuditEvent({
            eventType: 'ads.campaign.create.failed.validation',
            userId: user.id,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: {
              reason: 'creative_slot_duplicate',
              placement_slug: placementSlug,
            },
          });
          return NextResponse.json(
            {
              error: 'Invalid payload',
              details: {
                creativeSlots: [`${placementSlug} has multiple creative slots`],
              },
            },
            { status: 400 },
          );
        }

        imageUrlsByPlacement.set(placementSlug, slot.imageUrl);
        pageCountByPlacement.set(placementSlug, slot.pagesCount ?? 1);
      }
    }

    if (imageUrlsByPlacement.size === 0 && body.creative.imageUrl) {
      for (const placementSlug of selectedPlacementSlugs) {
        imageUrlsByPlacement.set(placementSlug, body.creative.imageUrl);
        pageCountByPlacement.set(placementSlug, 1);
      }
    }

    const missingCreativePlacements = selectedPlacementSlugs.filter(
      (placementSlug) => !imageUrlsByPlacement.get(placementSlug),
    );
    if (missingCreativePlacements.length > 0) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.validation',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          reason: 'missing_creative_for_placement',
          missing_placements: missingCreativePlacements,
          selected_placements: selectedPlacementSlugs,
        },
      });
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: {
            creativeSlots: missingCreativePlacements.map((placementSlug) => `${placementSlug} creative is required`),
          },
        },
        { status: 400 },
      );
    }

    if (includesNewsPlacement && !resolvedNewsFormat) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.validation',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          reason: 'missing_news_format',
          placement_slugs: selectedPlacementSlugs,
        },
      });
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: {
            newsFormat: ['newsFormat is required when placementSlugs includes news'],
          },
        },
        { status: 400 },
      );
    }

    const destinationKind = body.creative.destinationKind
      ?? (body.creative.destinationUrl.startsWith('/') ? 'internal' : 'external');
    const admin = createAdminClient();
    const normalizedImageUrlsByPlacement = new Map<AdPlacementSlug, string>();
    const normalizedBySourceUrl = new Map<string, string>();

    for (const placementSlug of selectedPlacementSlugs) {
      const sourceImageUrl = imageUrlsByPlacement.get(placementSlug);
      if (!sourceImageUrl) continue;

      const cached = normalizedBySourceUrl.get(sourceImageUrl);
      if (cached) {
        normalizedImageUrlsByPlacement.set(placementSlug, cached);
        continue;
      }

      if (isOptimizedPublicStorageUrl(sourceImageUrl, 'covers')) {
        normalizedBySourceUrl.set(sourceImageUrl, sourceImageUrl);
        normalizedImageUrlsByPlacement.set(placementSlug, sourceImageUrl);
        continue;
      }

      try {
        const normalizedUrl = await ensureOptimizedStorageImageUrl({
          admin,
          bucket: 'covers',
          sourceUrl: sourceImageUrl,
          pathPrefix: `ads/${user.id}`,
          pathLabel: placementSlug,
          timeoutMs: 15_000,
        });
        normalizedBySourceUrl.set(sourceImageUrl, normalizedUrl);
        normalizedImageUrlsByPlacement.set(placementSlug, normalizedUrl);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logAuditEvent({
          eventType: 'ads.campaign.create.failed.image_normalization',
          userId: user.id,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            placement_slug: placementSlug,
            image_url: sourceImageUrl,
            error_message: errorMessage,
          },
        });
        return NextResponse.json(
          { error: `Failed to normalize image for ${placementSlug}: ${errorMessage}` },
          { status: 400 },
        );
      }
    }

    if (!isValidDestination(body.creative.destinationUrl, destinationKind)) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.invalid_destination',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          destination_kind: destinationKind,
          destination_url: body.creative.destinationUrl,
        },
      });
      return NextResponse.json({ error: 'Invalid destination URL for selected destination kind' }, { status: 400 });
    }

    const creativeErrors = validateCreativeForPlacements({
      placementSlugs: selectedPlacementSlugs,
      title: body.creative.title,
      ctaText: body.creative.ctaText,
      imageUrlsByPlacement: normalizedImageUrlsByPlacement,
      destinationUrl: body.creative.destinationUrl,
      destinationKind,
    });

    if (creativeErrors.length > 0) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.creative_validation',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          placement_slugs: selectedPlacementSlugs,
          creative_errors: creativeErrors,
        },
      });
      return NextResponse.json(
        {
          error: 'Creative does not meet placement restrictions',
          details: creativeErrors,
        },
        { status: 400 },
      );
    }

    if (body.advertiserType === 'admin' && !isAdminRole(profile?.role)) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.forbidden_advertiser_type',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          advertiser_type: body.advertiserType,
          role: profile?.role ?? null,
        },
      });
      return NextResponse.json({ error: 'Forbidden advertiser type' }, { status: 403 });
    }

    const pricing = await computeCampaignPrice({
      pricingPlanId: body.pricingPlanId,
      placementSlugs: selectedPlacementSlugs,
      newsFormat: resolvedNewsFormat,
    });

    const initialStatus = body.advertiserType === 'admin' ? 'pending_review' : 'pending_payment';
    const isPaid = body.advertiserType === 'admin';

    const { data: campaign, error: campaignError } = await admin
      .from('ad_campaigns')
      .insert({
        owner_user_id: user.id,
        advertiser_type: body.advertiserType,
        name: body.name,
        status: initialStatus,
        pricing_plan_id: body.pricingPlanId,
        duration_days: pricing.durationDays,
        total_price: pricing.totalPrice,
        total_price_usd: pricing.totalPriceUsd,
        currency: pricing.currency,
        is_paid: isPaid,
        news_format: includesNewsPlacement ? resolvedNewsFormat : null,
        rotation_policy_snapshot: includesNewsPlacement ? buildNewsRotationPolicySnapshot() : {},
      })
      .select('id, name, status, total_price, total_price_usd, currency, is_paid, news_format, rotation_policy_snapshot')
      .single();

    if (campaignError || !campaign) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.campaign_insert',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          error_message: campaignError?.message ?? 'unknown_campaign_insert_error',
        },
      });
      return NextResponse.json({ error: campaignError?.message ?? 'Failed to create campaign' }, { status: 500 });
    }

    const placementRows = pricing.placements.map((placement) => ({
      campaign_id: campaign.id,
      placement_id: placement.id,
      multiplier_snapshot: placement.multiplier,
    }));

    const { error: placementsError } = await admin.from('ad_campaign_placements').insert(placementRows);
    if (placementsError) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.placements_insert',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          campaign_id: campaign.id,
          error_message: placementsError.message,
        },
      });
      return NextResponse.json({ error: placementsError.message }, { status: 500 });
    }

    const creativeRows = selectedPlacementSlugs.map((placementSlug) => ({
      campaign_id: campaign.id,
      placement_slug: placementSlug,
      locale: body.creative.locale ?? null,
      title: body.creative.title,
      cta_text: body.creative.ctaText,
      image_url: normalizedImageUrlsByPlacement.get(placementSlug) ?? '',
      page_count: pageCountByPlacement.get(placementSlug) ?? 1,
      destination_url: body.creative.destinationUrl,
      destination_kind: destinationKind,
    }));

    const { data: creatives, error: creativeError } = await admin
      .from('ad_creatives')
      .insert(creativeRows)
      .select('id, placement_slug, page_count, title, cta_text, image_url, destination_url, destination_kind, validation_status');

    if (creativeError) {
      await logAuditEvent({
        eventType: 'ads.campaign.create.failed.creative_insert',
        userId: user.id,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: {
          campaign_id: campaign.id,
          error_message: creativeError.message,
        },
      });
      return NextResponse.json({ error: creativeError.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'ads.campaign.create.success',
      userId: user.id,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        campaign_id: campaign.id,
        advertiser_type: body.advertiserType,
        placement_slugs: selectedPlacementSlugs,
        total_price: pricing.totalPrice,
        total_price_usd: pricing.totalPriceUsd,
        currency: pricing.currency,
        duration_days: pricing.durationDays,
      },
    });

    return NextResponse.json({
      data: {
        campaign,
        creative: (creatives ?? [])[0] ?? null,
        creatives: creatives ?? [],
        pricing: {
          durationDays: pricing.durationDays,
          currency: pricing.currency,
          basePrice: pricing.basePrice,
          totalPrice: pricing.totalPrice,
          // Deprecated compatibility fields.
          basePriceUsd: pricing.basePriceUsd,
          totalPriceUsd: pricing.totalPriceUsd,
          placements: pricing.placements,
        },
      },
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    await logAuditEvent({
      eventType: 'ads.campaign.create.failed.internal_error',
      userId: actorUserId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAdEvent } from '@/features/ads/server/repository';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasMarketingConsentFromCcCookie } from '@/features/cookies/lib/consent';

const schema = z.object({
  campaignId: z.string().uuid(),
  creativeId: z.string().uuid().optional(),
  placement: z.enum(['free', 'news', 'newsletter_footer']).optional(),
  eventType: z.enum(['impression', 'click', 'email_delivered', 'email_ad_click']),
  channel: z.enum(['web', 'email']),
  locale: z.string().trim().min(2).max(8).optional(),
  pagePath: z.string().trim().min(1).max(300).optional(),
  quantity: z.number().int().positive().max(100000).optional(),
  fingerprint: z.string().trim().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => null);
    const parsed = schema.safeParse(payload);

    // Check marketing consent for web-channel events (email events are server-triggered)
    if (parsed.success && parsed.data.channel === 'web') {
      const cookieHeader = req.headers.get('cookie') || '';
      const cookieMatch = cookieHeader.match(/cc_cookie=([^;]+)/);
      const ccCookie = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;

      if (req.headers.get('sec-gpc') === '1' || !hasMarketingConsentFromCcCookie(ccCookie)) {
        return NextResponse.json({ success: true, consent_blocked: true });
      }
    }

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const { campaignId, eventType, fingerprint } = parsed.data;

    // 1. Rate Limiting based on campaign or fingerprint
    const rateLimitKey = fingerprint ? `ad_event:${fingerprint}` : `ad_event_campaign:${campaignId}`;
    const rl = await checkRateLimit({
      action: 'AD_EVENT',
      key: rateLimitKey,
    });

    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // 2. Simple Deduplication (Anti-fraud léger)
    // Avoid double counting same event type for same campaign/creative/fingerprint within a short window (e.g. 1 hour)
    if (fingerprint && (eventType === 'impression' || eventType === 'click')) {
      const admin = createAdminClient();
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

      const { data: recentEvent } = await admin
        .from('ad_events')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('event_type', eventType)
        .eq('fingerprint', fingerprint)
        .gt('created_at', oneHourAgo)
        .maybeSingle();

      if (recentEvent) {
        // Skip recording but return success to client to avoid retries
        return NextResponse.json({ success: true, deduplicated: true });
      }
    }

    await recordAdEvent({
      campaignId: parsed.data.campaignId,
      creativeId: parsed.data.creativeId,
      placementSlug: parsed.data.placement,
      eventType: parsed.data.eventType,
      channel: parsed.data.channel,
      locale: parsed.data.locale ?? null,
      pagePath: parsed.data.pagePath ?? null,
      quantity: parsed.data.quantity,
      fingerprint: parsed.data.fingerprint ?? null,
      metadata: parsed.data.metadata ?? {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ad event error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

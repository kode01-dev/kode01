import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { hasMarketingConsentFromCcCookie } from '@/features/cookies/lib/consent';
import type { Json } from '@/types/database.types';

const eventSchema = z.object({
  campaign_id: z.string().uuid('Invalid campaign ID'),
  event_type: z.enum(['view', 'click', 'close', 'conversion', 'form_submit']),
  locale: z.string().min(2).max(8),
  page_url: z.string().url().optional(),
  device_type: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  fingerprint: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type EventPayload = z.infer<typeof eventSchema>;

/**
 * POST /api/marketing/events
 * Track a marketing event (view, click, close, etc.)
 * Includes rate limiting and deduplication
 */
export async function POST(request: Request) {
  try {
    // Get cookies for consent check
    const cookieHeader = request.headers.get('cookie') || '';
    const cookieMatch = cookieHeader.match(/cc_cookie=([^;]+)/);
    const ccCookie = cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;

    // Check if marketing consent is given
    const hasConsent = request.headers.get('sec-gpc') !== '1' && hasMarketingConsentFromCcCookie(ccCookie);
    if (!hasConsent) {
      // Still return success to prevent client errors, but don't track
      return NextResponse.json({ success: true, consent_blocked: true });
    }

    // Parse and validate payload
    const payload = await request.json().catch(() => null);
    const parsed = eventSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const data = parsed.data as EventPayload;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. RATE LIMITING
    // Use fingerprint if provided, otherwise use campaign ID
    const rateLimitKey = data.fingerprint
      ? `marketing_event:${data.fingerprint}`
      : `marketing_event_campaign:${data.campaign_id}`;

    const rl = await checkRateLimit({
      action: 'AD_EVENT',
      key: rateLimitKey,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    // 2. DEDUPLICATION
    // Avoid double counting same event for same campaign/event_type/fingerprint within 1 hour
    if (data.fingerprint && (data.event_type === 'view' || data.event_type === 'click')) {
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

      const { data: recentEvent } = await supabase
        .from('marketing_campaign_events')
        .select('id')
        .eq('campaign_id', data.campaign_id)
        .eq('event_type', data.event_type)
        .eq('fingerprint', data.fingerprint)
        .gt('created_at', oneHourAgo)
        .maybeSingle();

      if (recentEvent) {
        // Skip recording but return success to avoid client retries
        return NextResponse.json({
          success: true,
          deduplicated: true,
        });
      }
    }

    // 3. RECORD EVENT
    const { error: insertError } = await supabase
      .from('marketing_campaign_events')
      .insert({
        campaign_id: data.campaign_id,
        event_type: data.event_type,
        user_id: user?.id,
        fingerprint: data.fingerprint || null,
        locale: data.locale,
        page_url: data.page_url || null,
        device_type: data.device_type || null,
        metadata: (data.metadata || {}) as Json,
      });

    if (insertError) throw insertError;

    // 4. UPDATE CAMPAIGN COUNTERS
    if (data.event_type === 'view') {
      await supabase.rpc('increment_campaign_views', {
        campaign_uuid: data.campaign_id,
      });
    } else if (data.event_type === 'click') {
      await supabase.rpc('increment_campaign_clicks', {
        campaign_uuid: data.campaign_id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Marketing event error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

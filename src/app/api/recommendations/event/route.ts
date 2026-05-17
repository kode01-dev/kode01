import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
  COOKIE_CONSENT_COOKIE_NAME,
  LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
} from '@/features/cookies/lib/consent';
import { applyEventToAnonymousProfile, parseAnonymousRecommendationProfile } from '@/features/recommendations/lib/anonymous-profile';
import { hasAnalyticsConsentFromCcCookie } from '@/features/recommendations/lib/consent';
import { RecommendationEventPayload } from '@/features/recommendations/types';
import { shouldTrackSignedInRecommendations } from '@/features/recommendations/server/privacy';
import type { Json } from '@/types/database.types';

const payloadSchema = z.object({
  eventType: z.enum([
    'product_view',
    'recommendation_click',
    'blog_to_news_click',
    'news_to_blog_click',
    'add_to_cart',
    'checkout_started',
    'checkout_completed',
    'download_started',
    'refund_requested',
  ]),
  sourceType: z.enum(['product', 'blog', 'news', 'cart', 'checkout', 'download', 'refund']),
  sourceSlug: z.string().trim().min(1).max(200).optional(),
  targetProductId: z.string().uuid().optional(),
  signalPayload: z.object({
    keywords: z.array(z.string().trim().min(2).max(64)).max(40).optional(),
  }).catchall(z.unknown()).optional(),
});

const ANON_PROFILE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function POST(req: Request) {
  let payload: RecommendationEventPayload;

  try {
    const json = await req.json();
    payload = payloadSchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const canTrack = await shouldTrackSignedInRecommendations(supabase, user.id);
      if (!canTrack) {
        return NextResponse.json({ success: true, skipped: 'recommendation_personalization_disabled' });
      }

      const { error } = await supabase.from('recommendation_events').insert({
        user_id: user.id,
        event_type: payload.eventType,
        source_type: payload.sourceType,
        source_slug: payload.sourceSlug ?? null,
        target_product_id: payload.targetProductId ?? null,
        signal_payload: (payload.signalPayload ?? {}) as Json,
      });

      if (error) {
        console.error('Failed to insert signed-in recommendation event:', error);
        return NextResponse.json({ error: 'Failed to track recommendation event' }, { status: 500 });
      }

      return NextResponse.json({ success: true, mode: 'signed_in' });
    }

    const cookieStore = await cookies();
    const ccCookie = cookieStore.get(COOKIE_CONSENT_COOKIE_NAME)?.value;
    if (!hasAnalyticsConsentFromCcCookie(ccCookie)) {
      return NextResponse.json({ success: true, skipped: 'analytics_consent_missing' });
    }

    const currentProfile = parseAnonymousRecommendationProfile(
      cookieStore.get(ANONYMOUS_RECO_PROFILE_COOKIE_NAME)?.value
      ?? cookieStore.get(LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME)?.value,
    );
    const nextProfile = applyEventToAnonymousProfile(currentProfile, payload);

    const response = NextResponse.json({ success: true, mode: 'anonymous' });
    response.cookies.set({
      name: ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
      value: JSON.stringify(nextProfile),
      maxAge: ANON_PROFILE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    });

    return response;
  } catch (error) {
    console.error('Recommendation event route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

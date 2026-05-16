import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
  COOKIE_CONSENT_ID_COOKIE_NAME,
  LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
  LEGACY_COOKIE_CONSENT_ID_COOKIE_NAME,
  extractRejectedCategories,
} from '@/features/cookies/lib/consent';
import type { CookieConsentEventPayload } from '@/features/cookies/types';

const consentPayloadSchema = z.object({
  eventType: z.enum(['consent_first_choice', 'consent_updated', 'consent_withdrawn']),
  acceptedCategories: z.array(z.enum(['necessary', 'analytics', 'marketing'])).min(1).max(3),
  rejectedCategories: z.array(z.enum(['necessary', 'analytics', 'marketing'])).max(3),
  source: z.enum(['banner', 'preferences', 'settings']),
  consentVersion: z.string().trim().min(1).max(80),
  locale: z.string().trim().min(2).max(12).optional(),
});

const CONSENT_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeCategories(categories: string[]): string[] {
  const unique = Array.from(new Set(categories));
  if (!unique.includes('necessary')) unique.push('necessary');
  return unique.sort();
}

function normalizeOptionalCategories(categories: string[]): string[] {
  return Array.from(new Set(categories.filter((category) => category !== 'necessary'))).sort();
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function POST(req: Request) {
  let payload: CookieConsentEventPayload;

  try {
    const json = await req.json();
    payload = consentPayloadSchema.parse(json);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const cookieStore = await cookies();

    const rawConsentId =
      cookieStore.get(COOKIE_CONSENT_ID_COOKIE_NAME)?.value
      ?? cookieStore.get(LEGACY_COOKIE_CONSENT_ID_COOKIE_NAME)?.value;
    const consentId = rawConsentId && isUuid(rawConsentId) ? rawConsentId : crypto.randomUUID();
    const acceptedCategories = normalizeCategories(payload.acceptedCategories);
    const rejectedCategories = normalizeOptionalCategories(extractRejectedCategories(acceptedCategories));

    let duplicateQuery = admin
      .from('cookie_consent_events')
      .select('event_type, source, accepted_categories, rejected_categories, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    duplicateQuery = user?.id
      ? duplicateQuery.eq('user_id', user.id)
      : duplicateQuery.eq('anonymous_consent_id', consentId);

    const { data: existingRows, error: existingError } = await duplicateQuery;

    if (existingError) {
      console.error('Failed to read latest consent event:', existingError);
      return NextResponse.json({ error: 'Failed to store consent event' }, { status: 500 });
    }

    const latestEvent = existingRows?.[0] ?? null;
    const latestAccepted = normalizeCategories(
      Array.isArray(latestEvent?.accepted_categories)
        ? latestEvent.accepted_categories.filter((item): item is string => typeof item === 'string')
        : [],
    );
    const latestRejected = normalizeOptionalCategories(
      Array.isArray(latestEvent?.rejected_categories)
        ? latestEvent.rejected_categories.filter((item): item is string => typeof item === 'string')
        : [],
    );
    const latestCreatedAt = latestEvent?.created_at ? Date.parse(latestEvent.created_at) : 0;
    const isDuplicate =
      Boolean(latestEvent) &&
      Date.now() - latestCreatedAt <= DUPLICATE_WINDOW_MS &&
      latestEvent?.event_type === payload.eventType &&
      latestEvent?.source === payload.source &&
      arraysEqual(latestAccepted, acceptedCategories) &&
      arraysEqual(latestRejected, rejectedCategories);

    if (!isDuplicate) {
      const { error: insertError } = await admin.from('cookie_consent_events').insert({
        user_id: user?.id ?? null,
        anonymous_consent_id: consentId,
        event_type: payload.eventType,
        accepted_categories: acceptedCategories,
        rejected_categories: rejectedCategories,
        consent_version: payload.consentVersion,
        source: payload.source,
        locale: payload.locale ?? null,
      });

      if (insertError) {
        console.error('Failed to insert consent event:', insertError);
        return NextResponse.json({ error: 'Failed to store consent event' }, { status: 500 });
      }
    }

    const response = NextResponse.json({
      success: true,
      deduplicated: isDuplicate,
    });

    response.cookies.set({
      name: COOKIE_CONSENT_ID_COOKIE_NAME,
      value: consentId,
      maxAge: CONSENT_ID_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    });

    if (!acceptedCategories.includes('analytics')) {
      response.cookies.set({
        name: ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
        value: '',
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false,
      });
      response.cookies.set({
        name: LEGACY_ANONYMOUS_RECO_PROFILE_COOKIE_NAME,
        value: '',
        maxAge: 0,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false,
      });
    }

    return response;
  } catch (error) {
    console.error('Cookie consent event route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

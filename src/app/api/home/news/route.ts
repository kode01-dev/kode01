import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabasePublicEnvConfigured } from '@/lib/supabase/env';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  createDbUnavailableApiPayload,
  DB_UNAVAILABLE_RESPONSE_HEADERS,
  DB_UNAVAILABLE_STATUS,
  isTransientDbUnavailableError,
} from '@/lib/resilience/db-unavailable';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(3),
  locale: z.enum(['en', 'fr']).default('en'),
});

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

type NewsPostRow = {
  id: string;
  edition_id: string;
  locale: 'fr' | 'en';
  slug: string;
  title: string;
  intro: string;
  excerpt: string | null;
  tags: unknown;
  published_at: string | null;
};

function toStringTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

async function createNewsReadClient() {
  return createServerClient();
}

function isMissingNewsTagsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const details = 'details' in error && typeof error.details === 'string' ? error.details : '';
  const haystack = `${message} ${details}`.toLowerCase();
  return code === '42703' && haystack.includes('tags');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      locale: url.searchParams.get('locale') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: PUBLIC_CACHE_HEADERS },
      );
    }

    const { limit, locale } = parsed.data;
    if (!isSupabasePublicEnvConfigured() && process.env.NODE_ENV !== 'production') {
      return NextResponse.json({ items: [] }, { headers: PUBLIC_CACHE_HEADERS });
    }

    const supabase = await createNewsReadClient();

    let { data, error } = await supabase
      .from('ai_recap_posts')
      .select('id, edition_id, locale, slug, title, intro, excerpt, tags, published_at')
      .eq('is_published', true)
      .eq('locale', locale)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error && isMissingNewsTagsColumn(error)) {
      const fallbackResult = await supabase
        .from('ai_recap_posts')
        .select('id, edition_id, locale, slug, title, intro, excerpt, published_at')
        .eq('is_published', true)
        .eq('locale', locale)
        .order('published_at', { ascending: false })
        .limit(limit);
      data = fallbackResult.data?.map((row) => ({ ...row, tags: [] })) ?? null;
      error = fallbackResult.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
    }

    return NextResponse.json(
      {
        items: ((data ?? []) as NewsPostRow[]).map((row) => ({
          id: row.id,
          edition_id: row.edition_id,
          locale: row.locale,
          slug: row.slug,
          title: row.title,
          intro: row.intro,
          excerpt: row.excerpt,
          tags: toStringTags(row.tags),
          published_at: row.published_at,
        })),
      },
      { headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (error) {
    console.error('Home news GET error:', error);
    if (isTransientDbUnavailableError(error)) {
      return NextResponse.json(
        createDbUnavailableApiPayload(),
        { status: DB_UNAVAILABLE_STATUS, headers: DB_UNAVAILABLE_RESPONSE_HEADERS },
      );
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: PUBLIC_CACHE_HEADERS });
  }
}

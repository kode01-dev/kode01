import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEditorialAdminSessionOrNull, EDITORIAL_SELECT, EDITORIAL_SELECT_LEGACY } from '@/app/api/admin/editorial/_lib';
import { isValidEditorialSlug, normalizeSlug } from '@/features/editorial/lib/slug';
import { revalidateEditorialContent } from '@/lib/cache/revalidate';
import { shouldRevalidateOnEditorialCreate } from '@/features/editorial/server/public-cache-policy';
import {
  isMissingAuthorNameColumnError,
  normalizeAuthorNameRow,
  normalizeAuthorNameRows,
  withoutAuthorName,
} from '@/features/editorial/server/author-name-compat';
import {
  ensureOptimizedStorageImageUrl,
  type StorageUploader,
} from '@/lib/images/server/core-image-pipeline';
import type { Database } from '@/types/database.types';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional().default(''),
  locale: z.enum(['all', 'en', 'fr']).default('all'),
  status: z.enum(['all', 'draft', 'published']).default('all'),
});

const createSchema = z.object({
  mode: z.enum(['create_source', 'create_translation', 'create_en', 'create_fr_translation']).default('create_source'),
  locale: z.enum(['en', 'fr']).optional(),
  sourcePostId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(220),
  slug: z.string().trim().min(1).max(180).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  excerpt: z.string().trim().max(600).optional().nullable(),
  content_markdown: z.string().max(200000).optional().default(''),
  cover_image_url: z.string().url().max(1200).optional().nullable(),
  seo_title: z.string().trim().max(220).optional().nullable(),
  seo_description: z.string().trim().max(320).optional().nullable(),
  author_name: z.string().trim().max(120).optional().nullable(),
  status: z.enum(['draft', 'published']).optional().default('draft'),
  published_at: z.string().trim().max(80).optional().nullable(),
});

type EditorialSourceRow = {
  id: string;
  source_locale: 'en' | 'fr';
  locale: 'en' | 'fr';
  slug: string;
  category: string | null;
  translation_group_id: string;
  cover_image_url: string | null;
  author_name: string | null;
  clap_count: number;
};

type EditorialLocaleRow = {
  translation_group_id: string;
  locale: 'en' | 'fr';
};

type EditorialListRow = {
  id: string;
  translation_group_id: string;
  source_locale: 'en' | 'fr';
  locale: 'en' | 'fr';
  status: 'draft' | 'published';
  slug: string;
  category: string | null;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type EditorialInsert = Database['public']['Tables']['editorial_posts']['Insert'];

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDateTime(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function normalizeEditorialCoverImage(args: {
  admin: StorageUploader;
  userId: string;
  sourceUrl: string | null;
  pathLabel: string;
}): Promise<string | null> {
  if (!args.sourceUrl) return null;
  return ensureOptimizedStorageImageUrl({
    admin: args.admin,
    bucket: 'editorial',
    sourceUrl: args.sourceUrl,
    pathPrefix: `editorial/${args.userId}`,
    pathLabel: args.pathLabel,
    timeoutMs: 15_000,
  });
}

export async function GET(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      locale: searchParams.get('locale') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { admin } = adminSession;
    const { page, pageSize, q, locale, status } = parsed.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const runPostsQuery = (selectClause: string) => {
      let query = admin.from('editorial_posts').select(selectClause, { count: 'exact' });
      if (locale !== 'all') query = query.eq('locale', locale);
      if (status !== 'all') query = query.eq('status', status);
      if (q) {
        const pattern = `%${q}%`;
        query = query.or(`title.ilike.${pattern},slug.ilike.${pattern},excerpt.ilike.${pattern}`);
      }

      return query
        .order('updated_at', { ascending: false })
        .range(from, to);
    };

    let result = await runPostsQuery(EDITORIAL_SELECT);
    if (isMissingAuthorNameColumnError(result.error)) {
      result = await runPostsQuery(EDITORIAL_SELECT_LEGACY);
    }

    const { data, error, count } = result;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const posts = normalizeAuthorNameRows((Array.isArray(data) ? data : []) as unknown as EditorialListRow[]) as EditorialListRow[];
    const groupIds = Array.from(new Set(posts.map((row) => row.translation_group_id).filter(Boolean)));

    let groupsWithTranslation = new Set<string>();
    if (groupIds.length > 0) {
      const { data: localeRows, error: localeError } = await admin
        .from('editorial_posts')
        .select('translation_group_id, locale')
        .in('translation_group_id', groupIds);

      if (localeError) {
        return NextResponse.json({ error: localeError.message }, { status: 500 });
      }

      const localeMap = new Map<string, Set<string>>();
      for (const row of (localeRows ?? []) as EditorialLocaleRow[]) {
        const locales = localeMap.get(row.translation_group_id) ?? new Set<string>();
        locales.add(row.locale);
        localeMap.set(row.translation_group_id, locales);
      }

      groupsWithTranslation = new Set(
        Array.from(localeMap.entries())
          .filter(([, locales]) => locales.size > 1)
          .map(([translationGroupId]) => translationGroupId),
      );
    }

    const hydratedPosts = posts.map((row) => ({
      ...row,
      has_translation: groupsWithTranslation.has(row.translation_group_id),
    }));

    return NextResponse.json({
      data: hydratedPosts,
      page,
      pageSize,
      total: count ?? posts.length,
    });
  } catch (error) {
    console.error('GET /api/admin/editorial/posts error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload',
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 },
      );
    }

    const { admin, userId } = adminSession;
    const input = parsed.data;
    const requestedPublishAt = normalizeOptionalDateTime(input.published_at);

    if (input.mode === 'create_source' || input.mode === 'create_en') {
      const sourceLocale = input.mode === 'create_en' ? 'en' : (input.locale ?? 'en');
      const rawSlug = input.slug?.trim() || input.title;
      const slug = normalizeSlug(rawSlug);
      if (!isValidEditorialSlug(slug)) {
        return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
      }
      const normalizedCoverImageUrl = await normalizeEditorialCoverImage({
        admin,
        userId,
        sourceUrl: normalizeOptionalText(input.cover_image_url),
        pathLabel: `post-${slug}`,
      });

      const nowIso = new Date().toISOString();
      const insertPayload = {
        source_locale: sourceLocale,
        locale: sourceLocale,
        status: input.status,
        slug,
        category: normalizeOptionalText(input.category),
        title: input.title.trim(),
        excerpt: normalizeOptionalText(input.excerpt),
        content_markdown: input.content_markdown,
        cover_image_url: normalizedCoverImageUrl,
        seo_title: normalizeOptionalText(input.seo_title),
        seo_description: normalizeOptionalText(input.seo_description),
        author_name: normalizeOptionalText(input.author_name),
        published_at: input.status === 'published' ? requestedPublishAt ?? nowIso : null,
        created_by: userId,
        updated_by: userId,
      };

      const runInsert = (payload: EditorialInsert, selectClause: string) => {
        return admin
          .from('editorial_posts')
          .insert(payload)
          .select(selectClause)
          .single();
      };

      let result = await runInsert(insertPayload, EDITORIAL_SELECT);
      if (isMissingAuthorNameColumnError(result.error)) {
        result = await runInsert(withoutAuthorName(insertPayload) as EditorialInsert, EDITORIAL_SELECT_LEGACY);
      }

      const { data, error } = result;

      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'Unable to create post' }, { status: 500 });
      }

      const normalizedData = normalizeAuthorNameRow(data as unknown as EditorialListRow);

      if (shouldRevalidateOnEditorialCreate(normalizedData.status)) {
        revalidateEditorialContent();
      }

      return NextResponse.json({ data: normalizedData }, { status: 201 });
    }

    if (!input.sourcePostId) {
      return NextResponse.json({ error: 'sourcePostId is required for translation' }, { status: 400 });
    }

    const runSourceQuery = (selectClause: string) => {
      return admin
        .from('editorial_posts')
        .select(selectClause)
        .eq('id', input.sourcePostId!)
        .maybeSingle();
    };

    let sourceResult = await runSourceQuery('id, source_locale, locale, slug, category, translation_group_id, cover_image_url, author_name');
    if (isMissingAuthorNameColumnError(sourceResult.error)) {
      sourceResult = await runSourceQuery('id, source_locale, locale, slug, category, translation_group_id, cover_image_url');
    }

    const { data: sourcePost, error: sourceError } = sourceResult;

    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 500 });
    }

    if (!sourcePost) {
      return NextResponse.json({ error: 'Source post not found' }, { status: 404 });
    }

    const source = normalizeAuthorNameRow(sourcePost as unknown as Record<string, unknown>) as unknown as EditorialSourceRow;
    const targetLocale = source.locale === 'en' ? 'fr' : 'en';
    const sourceLocale = source.source_locale ?? source.locale;
    const coverImageUrl = await normalizeEditorialCoverImage({
      admin,
      userId,
      sourceUrl: normalizeOptionalText(input.cover_image_url) ?? source.cover_image_url ?? null,
      pathLabel: `translation-${source.translation_group_id}-${targetLocale}`,
    });
    const category = normalizeOptionalText(input.category) ?? source.category ?? null;

    const { data: existingTarget } = await admin
      .from('editorial_posts')
      .select('id')
      .eq('translation_group_id', source.translation_group_id)
      .eq('locale', targetLocale)
      .maybeSingle();

    if (existingTarget) {
      return NextResponse.json({ error: 'Translation already exists for this source article' }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const translationInsertPayload = {
      translation_group_id: source.translation_group_id,
      source_locale: sourceLocale,
      locale: targetLocale,
      status: input.status,
      slug: source.slug,
      category,
      title: input.title.trim(),
      excerpt: normalizeOptionalText(input.excerpt),
      content_markdown: input.content_markdown,
      cover_image_url: coverImageUrl,
      seo_title: normalizeOptionalText(input.seo_title),
      seo_description: normalizeOptionalText(input.seo_description),
      author_name: normalizeOptionalText(input.author_name) ?? source.author_name ?? null,
      published_at: input.status === 'published' ? requestedPublishAt ?? nowIso : null,
      created_by: userId,
      updated_by: userId,
    };
    const runInsert = (payload: EditorialInsert, selectClause: string) => {
      return admin
        .from('editorial_posts')
        .insert(payload)
        .select(selectClause)
        .single();
    };

    let insertResult = await runInsert(translationInsertPayload, EDITORIAL_SELECT);
    if (isMissingAuthorNameColumnError(insertResult.error)) {
      insertResult = await runInsert(
        withoutAuthorName(translationInsertPayload) as EditorialInsert,
        EDITORIAL_SELECT_LEGACY,
      );
    }

    const { data, error } = insertResult;

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to create translation' }, { status: 500 });
    }

    const normalizedData = normalizeAuthorNameRow(data as unknown as EditorialListRow);

    if (shouldRevalidateOnEditorialCreate(normalizedData.status)) {
      revalidateEditorialContent();
    }

    return NextResponse.json({ data: normalizedData }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/editorial/posts error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

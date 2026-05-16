import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEditorialAdminSessionOrNull, EDITORIAL_SELECT, EDITORIAL_SELECT_LEGACY } from '@/app/api/admin/editorial/_lib';
import { isValidEditorialSlug, normalizeSlug } from '@/features/editorial/lib/slug';
import { revalidateEditorialContent } from '@/lib/cache/revalidate';
import {
  shouldRevalidateOnEditorialDelete,
  shouldRevalidateOnEditorialUpdate,
} from '@/features/editorial/server/public-cache-policy';
import { ensureOptimizedStorageImageUrl } from '@/lib/images/server/core-image-pipeline';
import {
  isMissingAuthorNameColumnError,
  normalizeAuthorNameRow,
  withoutAuthorName,
} from '@/features/editorial/server/author-name-compat';

const updateSchema = z.object({
  title: z.string().trim().min(1).max(220).optional(),
  slug: z.string().trim().min(1).max(180).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  excerpt: z.string().trim().max(600).optional().nullable(),
  content_markdown: z.string().max(200000).optional(),
  cover_image_url: z.string().url().max(1200).optional().nullable(),
  seo_title: z.string().trim().max(220).optional().nullable(),
  seo_description: z.string().trim().max(320).optional().nullable(),
  author_name: z.string().trim().max(120).optional().nullable(),
  status: z.enum(['draft', 'published']).optional(),
  published_at: z.string().trim().max(80).optional().nullable(),
});

type EditorialPostRow = {
  id: string;
  source_locale: 'en' | 'fr';
  locale: 'en' | 'fr';
  status: 'draft' | 'published';
  slug: string;
  translation_group_id: string;
  published_at: string | null;
};

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Missing post id' }, { status: 400 });
    }

    const payload = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(payload);
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
    const { data: existingRaw, error: existingError } = await admin
      .from('editorial_posts')
      .select('id, source_locale, locale, status, slug, translation_group_id, published_at')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (!existingRaw) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const existing = existingRaw as EditorialPostRow;
    const input = parsed.data;
    const nowIso = new Date().toISOString();

    const isSourceLocaleRow = existing.locale === existing.source_locale;

    if (!isSourceLocaleRow && typeof input.slug === 'string') {
      const requestedSlug = normalizeSlug(input.slug);
      if (requestedSlug !== existing.slug) {
        return NextResponse.json({ error: 'Translation slug is locked to source locale slug' }, { status: 400 });
      }
    }

    let slugForUpdate: string | undefined;
    if (typeof input.slug === 'string') {
      slugForUpdate = normalizeSlug(input.slug);
      if (!isValidEditorialSlug(slugForUpdate)) {
        return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
      }
    }

    const nextStatus = input.status ?? existing.status;
    const updatePayload: Record<string, unknown> = {
      updated_by: userId,
    };
    const coverImageForSync =
      typeof input.cover_image_url === 'string' || input.cover_image_url === null
        ? normalizeOptionalText(input.cover_image_url)
        : undefined;
    const categoryForSync =
      typeof input.category === 'string' || input.category === null
        ? normalizeOptionalText(input.category)
        : undefined;
    const requestedPublishAt =
      typeof input.published_at === 'string' || input.published_at === null
        ? normalizeOptionalDateTime(input.published_at)
        : undefined;
    const statusProvided = typeof input.status === 'string';
    const publishAtProvided = typeof input.published_at === 'string' || input.published_at === null;
    const shouldSyncSchedule = statusProvided || publishAtProvided;
    let syncedStatus: 'draft' | 'published' | undefined;
    let syncedPublishedAt: string | null | undefined;
    const normalizedCoverImageForSync =
      typeof coverImageForSync === 'string'
        ? await ensureOptimizedStorageImageUrl({
          admin,
          bucket: 'editorial',
          sourceUrl: coverImageForSync,
          pathPrefix: `editorial/${userId}`,
          pathLabel: `post-${id}`,
          timeoutMs: 15_000,
        })
        : coverImageForSync;

    if (typeof input.title === 'string') updatePayload.title = input.title.trim();
    if (typeof input.excerpt === 'string' || input.excerpt === null) updatePayload.excerpt = normalizeOptionalText(input.excerpt);
    if (typeof input.content_markdown === 'string') updatePayload.content_markdown = input.content_markdown;
    if (typeof input.seo_title === 'string' || input.seo_title === null) updatePayload.seo_title = normalizeOptionalText(input.seo_title);
    if (typeof input.seo_description === 'string' || input.seo_description === null) updatePayload.seo_description = normalizeOptionalText(input.seo_description);
    if (typeof input.author_name === 'string' || input.author_name === null) updatePayload.author_name = normalizeOptionalText(input.author_name);

    if (isSourceLocaleRow && slugForUpdate && slugForUpdate !== existing.slug) {
      updatePayload.slug = slugForUpdate;
    }

    if (isSourceLocaleRow && slugForUpdate && slugForUpdate !== existing.slug) {
      const { error: slugSyncError } = await admin
        .from('editorial_posts')
        .update({
          slug: slugForUpdate,
          updated_by: userId,
        })
        .eq('translation_group_id', existing.translation_group_id);

      if (slugSyncError) {
        return NextResponse.json({ error: slugSyncError.message }, { status: 500 });
      }
    }

    if (shouldSyncSchedule) {
      const targetStatus = (statusProvided ? input.status : existing.status) as 'draft' | 'published';
      const targetPublishedAt =
        targetStatus === 'published'
          ? typeof requestedPublishAt === 'string'
            ? requestedPublishAt
            : requestedPublishAt === null
              ? nowIso
              : existing.status === 'published'
                ? existing.published_at ?? nowIso
                : nowIso
          : null;

      const { error: scheduleSyncError } = await admin
        .from('editorial_posts')
        .update({
          status: targetStatus,
          published_at: targetPublishedAt,
          updated_by: userId,
        })
        .eq('translation_group_id', existing.translation_group_id);

      if (scheduleSyncError) {
        return NextResponse.json({ error: scheduleSyncError.message }, { status: 500 });
      }

      syncedStatus = targetStatus;
      syncedPublishedAt = targetPublishedAt;
    }

    if (typeof syncedStatus !== 'undefined') {
      updatePayload.status = syncedStatus;
    } else if (typeof input.status === 'string') {
      updatePayload.status = input.status;
    }

    if (typeof syncedPublishedAt !== 'undefined') {
      updatePayload.published_at = syncedPublishedAt;
    } else if (nextStatus === 'published') {
      if (typeof requestedPublishAt === 'string') {
        updatePayload.published_at = requestedPublishAt;
      } else if (requestedPublishAt === null) {
        updatePayload.published_at = nowIso;
      } else {
        updatePayload.published_at = existing.status === 'published' ? existing.published_at ?? nowIso : nowIso;
      }
    } else {
      updatePayload.published_at = null;
    }

    if (typeof normalizedCoverImageForSync !== 'undefined') {
      const { error: coverSyncError } = await admin
        .from('editorial_posts')
        .update({
          cover_image_url: normalizedCoverImageForSync,
          updated_by: userId,
        })
        .eq('translation_group_id', existing.translation_group_id);

      if (coverSyncError) {
        return NextResponse.json({ error: coverSyncError.message }, { status: 500 });
      }
    }

    if (typeof categoryForSync !== 'undefined') {
      const { error: categorySyncError } = await admin
        .from('editorial_posts')
        .update({
          category: categoryForSync,
          updated_by: userId,
        })
        .eq('translation_group_id', existing.translation_group_id);

      if (categorySyncError) {
        return NextResponse.json({ error: categorySyncError.message }, { status: 500 });
      }
    }

    const runUpdate = (payload: Record<string, unknown>, selectClause: string) => {
      return admin
        .from('editorial_posts')
        .update(payload)
        .eq('id', id)
        .select(selectClause)
        .single();
    };

    let result = await runUpdate(updatePayload, EDITORIAL_SELECT);
    if (isMissingAuthorNameColumnError(result.error)) {
      result = await runUpdate(withoutAuthorName(updatePayload), EDITORIAL_SELECT_LEGACY);
    }

    const { data, error } = result;

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Unable to update post' }, { status: 500 });
    }

    const normalizedData = normalizeAuthorNameRow(data as unknown as Record<string, unknown>);

    if (shouldRevalidateOnEditorialUpdate(existing.status, normalizedData.status as 'draft' | 'published')) {
      revalidateEditorialContent();
    }

    return NextResponse.json({ data: normalizedData });
  } catch (error) {
    console.error('PATCH /api/admin/editorial/posts/[id] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const adminSession = await getEditorialAdminSessionOrNull(request);
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Missing post id' }, { status: 400 });
    }

    const { admin } = adminSession;
    const { data: existingPost, error: existingPostError } = await admin
      .from('editorial_posts')
      .select('status')
      .eq('id', id)
      .maybeSingle();

    if (existingPostError) {
      return NextResponse.json({ error: existingPostError.message }, { status: 500 });
    }

    if (!existingPost) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const { error } = await admin
      .from('editorial_posts')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (shouldRevalidateOnEditorialDelete(existingPost.status as 'draft' | 'published')) {
      revalidateEditorialContent();
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('DELETE /api/admin/editorial/posts/[id] error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

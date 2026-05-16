import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env/server';
import { timingSafeCompare } from '@/lib/security/timing-safe-compare';
import { isPublicCacheTag, revalidatePublicCacheTags } from '@/lib/cache/revalidate';
import type { PublicCacheTag } from '@/lib/cache/tags';

const payloadSchema = z.object({
  tags: z.array(z.string().trim().min(1)).min(1).max(10),
});

function extractBearerToken(req: Request): string {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
}

function isInternalRevalidateAuthorized(req: Request): boolean {
  const env = getServerEnv();
  const bearerToken = extractBearerToken(req);
  const internalHeader = (req.headers.get('x-internal-auth') ?? '').trim();
  const cronSecret = (env.CRON_SECRET ?? '').trim();
  const edgeToken = (env.EDGE_INTERNAL_AUTH_TOKEN ?? '').trim();

  const bearerAuthorized =
    Boolean(bearerToken) &&
    (
      (Boolean(cronSecret) && timingSafeCompare(bearerToken, cronSecret)) ||
      (Boolean(edgeToken) && timingSafeCompare(bearerToken, edgeToken))
    );

  const internalAuthorized =
    Boolean(edgeToken) &&
    Boolean(internalHeader) &&
    timingSafeCompare(internalHeader, edgeToken);

  return bearerAuthorized || internalAuthorized;
}

export async function POST(req: Request) {
  try {
    if (!isInternalRevalidateAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => null);
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const invalidTags = parsed.data.tags.filter((tag) => !isPublicCacheTag(tag));
    if (invalidTags.length > 0) {
      return NextResponse.json(
        {
          error: 'Unsupported tags',
          invalid: invalidTags,
        },
        { status: 400 },
      );
    }

    const tags = parsed.data.tags as PublicCacheTag[];
    revalidatePublicCacheTags(tags);

    return NextResponse.json({
      revalidated: Array.from(new Set(tags)),
    });
  } catch (error) {
    console.error('POST /api/internal/cache/revalidate error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


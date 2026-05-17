import { z } from 'zod';

import {
  getEditorialRssResponse,
  invalidEditorialRssLocaleResponse,
} from '@/features/editorial/server/rss-route';

const querySchema = z.object({
  locale: z.enum(['en', 'fr']).default('en'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? undefined,
  });

  if (!parsed.success) {
    return invalidEditorialRssLocaleResponse(parsed.error.flatten().fieldErrors);
  }

  const { locale } = parsed.data;
  return getEditorialRssResponse({
    request,
    locale,
    feedPath: `/api/blog/rss?locale=${locale}`,
  });
}

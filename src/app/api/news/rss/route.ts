import { z } from 'zod';

import {
  getAiNewsRssResponse,
  invalidAiNewsRssLocaleResponse,
} from '@/features/ai-recap/server/rss-route';

const querySchema = z.object({
  locale: z.enum(['en', 'fr']).default('en'),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    locale: url.searchParams.get('locale') ?? undefined,
  });

  if (!parsed.success) {
    return invalidAiNewsRssLocaleResponse(parsed.error.flatten().fieldErrors);
  }

  const { locale } = parsed.data;
  return getAiNewsRssResponse({
    request,
    locale,
    feedPath: `/api/news/rss?locale=${locale}`,
  });
}

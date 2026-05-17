import {
  getAiNewsRssResponse,
  invalidAiNewsRssLocaleResponse,
  isAiNewsRssLocale,
} from '@/features/ai-recap/server/rss-route';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isAiNewsRssLocale(locale)) {
    return invalidAiNewsRssLocaleResponse();
  }

  return getAiNewsRssResponse({
    request,
    locale,
    feedPath: `/${locale}/news/rss.xml`,
  });
}

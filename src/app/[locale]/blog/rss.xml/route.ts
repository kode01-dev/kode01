import {
  getEditorialRssResponse,
  invalidEditorialRssLocaleResponse,
  isEditorialRssLocale,
} from '@/features/editorial/server/rss-route';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isEditorialRssLocale(locale)) {
    return invalidEditorialRssLocaleResponse();
  }

  return getEditorialRssResponse({
    request,
    locale,
    feedPath: `/${locale}/blog/rss.xml`,
  });
}

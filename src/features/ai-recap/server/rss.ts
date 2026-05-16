import type { RecapLocale, RecapPostCard } from '@/features/ai-recap/types';

const RSS_XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

type RssNewsPost = Pick<RecapPostCard, 'slug' | 'title' | 'intro' | 'excerpt' | 'published_at'>;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function toRssDate(value: string | null | undefined): string {
  if (!value) return new Date().toUTCString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toUTCString();
  return parsed.toUTCString();
}

function buildChannelMeta(locale: RecapLocale) {
  if (locale === 'fr') {
    return {
      title: 'KODE01 AI News FR',
      description: 'Dernieres nouvelles IA de KODE01.',
      language: 'fr',
    };
  }

  return {
    title: 'KODE01 AI News',
    description: 'Latest AI news from KODE01.',
    language: 'en',
  };
}

function buildOgImageUrl(baseUrl: string, title: string, description: string): string {
  const params = new URLSearchParams({
    title,
    desc: description,
  });
  return `${baseUrl}/api/og?${params.toString()}`;
}

export function buildAiNewsRssXml(args: {
  locale: RecapLocale;
  baseUrl: string;
  feedPath: string;
  posts: RssNewsPost[];
}): string {
  const { locale, baseUrl, feedPath, posts } = args;
  const { title, description, language } = buildChannelMeta(locale);
  const channelLink = `${baseUrl}/${locale}/news`;
  const selfLink = `${baseUrl}${feedPath}`;
  const latestDateSource = posts[0]?.published_at ?? null;
  const lastBuildDate = toRssDate(latestDateSource);

  const itemsXml = posts
    .map((post) => {
      const canonicalLink = `${baseUrl}/${locale}/news/${post.slug}`;
      const descriptionText = post.excerpt ?? post.intro;
      const pubDate = toRssDate(post.published_at);
      const imageUrl = buildOgImageUrl(baseUrl, post.title, descriptionText);

      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(canonicalLink)}</link>`,
        `<guid isPermaLink="true">${escapeXml(canonicalLink)}</guid>`,
        `<pubDate>${escapeXml(pubDate)}</pubDate>`,
        `<description>${escapeXml(descriptionText)}</description>`,
        `<enclosure url="${escapeXml(imageUrl)}" type="image/jpeg" length="0" />`,
        `<media:content url="${escapeXml(imageUrl)}" medium="image" />`,
        '</item>',
      ].join('');
    })
    .join('');

  return [
    RSS_XML_DECLARATION,
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(channelLink)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    `<language>${escapeXml(language)}</language>`,
    `<lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>`,
    `<atom:link href="${escapeXml(selfLink)}" rel="self" type="application/rss+xml" />`,
    itemsXml,
    '</channel>',
    '</rss>',
  ].join('');
}

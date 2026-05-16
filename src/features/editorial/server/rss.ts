import type { EditorialLocale, EditorialPostListItem } from '@/features/editorial/types';

const RSS_XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

type RssPost = Pick<EditorialPostListItem, 'slug' | 'title' | 'excerpt' | 'published_at' | 'created_at' | 'cover_image_url'>;

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

function toAbsoluteUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
}

function buildChannelMeta(locale: EditorialLocale) {
  if (locale === 'fr') {
    return {
      title: 'KODE01 Blogue',
      description: 'Derniers articles du blogue KODE01.',
      language: 'fr',
    };
  }

  return {
    title: 'KODE01 Blog',
    description: 'Latest articles from the KODE01 blog.',
    language: 'en',
  };
}

export function buildEditorialRssXml(args: {
  locale: EditorialLocale;
  baseUrl: string;
  feedPath: string;
  posts: RssPost[];
}): string {
  const { locale, baseUrl, feedPath, posts } = args;
  const { title, description, language } = buildChannelMeta(locale);
  const channelLink = `${baseUrl}/${locale}/blog`;
  const selfLink = `${baseUrl}${feedPath}`;
  const latestDateSource = posts[0]?.published_at ?? posts[0]?.created_at ?? null;
  const lastBuildDate = toRssDate(latestDateSource);

  const itemsXml = posts
    .map((post) => {
      const canonicalLink = `${baseUrl}/${locale}/blog/${post.slug}`;
      const descriptionText = post.excerpt ?? '';
      const pubDate = toRssDate(post.published_at ?? post.created_at ?? null);
      const imageUrl = post.cover_image_url ? toAbsoluteUrl(baseUrl, post.cover_image_url) : null;

      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(canonicalLink)}</link>`,
        `<guid isPermaLink="true">${escapeXml(canonicalLink)}</guid>`,
        `<pubDate>${escapeXml(pubDate)}</pubDate>`,
        `<description>${escapeXml(descriptionText)}</description>`,
        imageUrl ? `<enclosure url="${escapeXml(imageUrl)}" type="image/jpeg" length="0" />` : '',
        imageUrl ? `<media:content url="${escapeXml(imageUrl)}" medium="image" />` : '',
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

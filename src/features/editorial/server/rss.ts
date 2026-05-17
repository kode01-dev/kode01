import type { EditorialLocale, EditorialPostListItem } from '@/features/editorial/types';
import {
  RSS_XML_DECLARATION,
  buildMediaContentTag,
  escapeXml,
  inferImageMimeType,
  toAbsoluteUrl,
  toRssDate,
  type RssBuildResult,
} from '@/lib/rss';

type RssPost = Pick<EditorialPostListItem, 'slug' | 'title' | 'excerpt' | 'published_at' | 'created_at' | 'cover_image_url'>;

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

export function buildEditorialRssDocument(args: {
  locale: EditorialLocale;
  baseUrl: string;
  feedPath: string;
  posts: RssPost[];
}): RssBuildResult {
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
      const mediaTag = imageUrl ? buildMediaContentTag(imageUrl, inferImageMimeType(imageUrl)) : '';

      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${escapeXml(canonicalLink)}</link>`,
        `<guid isPermaLink="true">${escapeXml(canonicalLink)}</guid>`,
        `<pubDate>${escapeXml(pubDate)}</pubDate>`,
        `<description>${escapeXml(descriptionText)}</description>`,
        mediaTag,
        '</item>',
      ].join('');
    })
    .join('');

  const xml = [
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

  return { xml, lastBuildDate, selfUrl: selfLink };
}

export function buildEditorialRssXml(args: {
  locale: EditorialLocale;
  baseUrl: string;
  feedPath: string;
  posts: RssPost[];
}): string {
  return buildEditorialRssDocument(args).xml;
}

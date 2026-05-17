import type { RecapLocale, RecapPostDetail } from '../types';

export type NewsPostLocaleResolution =
  | { type: 'render'; post: RecapPostDetail }
  | { type: 'redirect'; href: string }
  | { type: 'notFound' };

export function resolveNewsPostLocale({
  exactPost,
  canonicalPost,
}: {
  requestedLocale: RecapLocale;
  requestedSlug: string;
  exactPost: RecapPostDetail | null;
  canonicalPost: RecapPostDetail | null;
}): NewsPostLocaleResolution {
  if (exactPost) {
    return { type: 'render', post: exactPost };
  }

  if (canonicalPost) {
    return {
      type: 'redirect',
      href: `/${canonicalPost.locale}/news/${canonicalPost.slug}`,
    };
  }

  return { type: 'notFound' };
}

export function buildNewsArticleJsonLd({
  baseUrl,
  locale,
  post,
  homeLabel,
  newsLabel,
}: {
  baseUrl: string;
  locale: RecapLocale | string;
  post: RecapPostDetail;
  homeLabel: string;
  newsLabel: string;
}) {
  const canonicalUrl = `${baseUrl}/${locale}/news/${post.slug}`;

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt ?? post.intro,
      datePublished: post.published_at ?? undefined,
      inLanguage: locale,
      mainEntityOfPage: canonicalUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: homeLabel,
          item: `${baseUrl}/${locale}`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: newsLabel,
          item: `${baseUrl}/${locale}/news`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: post.title,
          item: canonicalUrl,
        },
      ],
    },
  ];
}

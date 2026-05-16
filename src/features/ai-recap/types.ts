export type RecapLocale = 'fr' | 'en';

export type RecapQuickHit = {
  topic: string;
  summary: string;
  source_url: string;
};

export type RecapSummary30Locale = {
  bullets: string[];
  primary_source_url: string;
  source_urls: string[];
};

export type RecapSummary30 = {
  fr: RecapSummary30Locale;
  en: RecapSummary30Locale;
  generated_at?: string;
  generated_by?: string;
};

export type RecapSourceManifest = {
  primary_source_url?: string;
  used_source_urls: string[];
  allowed_source_urls?: string[];
  scrape_methods_breakdown?: Record<string, number>;
  generated_at?: string;
  generated_by?: string;
};

export type RecapSourceStory = {
  source_url: string;
  source_name?: string;
  title?: string;
};

export type RecapContent = {
  title: string;
  introduction: string;
  bigNews: {
    name: string;
    impact: string;
    source_url: string;
  };
  quickHits: RecapQuickHit[];
  tags?: string[];
  lookingAhead: string;
  summary30s?: RecapSummary30;
  source_manifest?: RecapSourceManifest;
  sourceStories?: RecapSourceStory[];
};

export type RecapPostCard = {
  id: string;
  edition_id: string;
  locale: RecapLocale;
  slug: string;
  title: string;
  intro: string;
  excerpt: string | null;
  tags?: string[];
  published_at: string | null;
  clap_count?: number;
};

export type RecapPostDetail = RecapPostCard & {
  content_markdown: string;
  content_json: RecapContent | null;
};

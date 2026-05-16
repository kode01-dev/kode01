export type ScrapeRoute = 'rss' | 'firecrawl';

export type SourceLocaleHint = 'fr' | 'en' | 'both';

export type SourceItem = {
  id: string;
  name: string;
  url: string;
  feed_url: string | null;
  domain: string;
  priority: number;
  is_active: boolean;
  locale_hint: SourceLocaleHint;
  scrape_route: ScrapeRoute;
  rss_allow_firecrawl_fallback: boolean;
  created_at: string;
  updated_at: string;
};

export type RunMode = 'run' | 'tick' | 'build_article' | 'send_newsletter' | 'retry_newsletter';
export type RunTriggerType = 'cron' | 'manual' | 'retry';
export type RunStatus = 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped';

export type RunItem = {
  id: string;
  edition_key: string;
  trigger_type: RunTriggerType;
  mode?: RunMode | null;
  attempt: number;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  failure_reason?: string | null;
};

export type ScheduleItem = {
  is_enabled: boolean;
  timezone: string;
  slot_a_day: number;
  slot_a_hour: number;
  slot_a_minute: number;
  slot_b_day: number;
  slot_b_hour: number;
  slot_b_minute: number;
  slot_c_day: number | null;
  slot_c_hour: number | null;
  slot_c_minute: number | null;
  slot_d_day: number | null;
  slot_d_hour: number | null;
  slot_d_minute: number | null;
  slot_e_day: number | null;
  slot_e_hour: number | null;
  slot_e_minute: number | null;
  created_at: string;
  updated_at: string;
};

export type DayThemeItem = {
  day_index: number;
  theme_key: string;
  theme_name_fr: string;
  theme_name_en: string;
  theme_description_fr: string;
  theme_description_en: string;
  source_ids: string[];
  is_active: boolean;
  skip_if_quiet: boolean;
};

export type BusyAction = 'run' | 'force' | 'test' | 'retry' | 'smoke' | null;
export type StatusTone = 'idle' | 'success' | 'error';


export type RetryChoice = {
  value: string;
  label: string;
};

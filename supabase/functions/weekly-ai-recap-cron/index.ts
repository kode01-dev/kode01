import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.36.3';
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';
import { getEdgeEnv } from '../_shared/env.ts';
import {
  badRequest,
  isCronAuthorized,
  json,
  methodNotAllowed,
  unauthorized,
} from '../_shared/http.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseWithSchema, z } from '../_shared/validation.ts';
import { revalidateCache } from '../_shared/revalidate.ts';

type SourceRow = {
  id: string;
  name: string;
  url: string;
  feed_url?: string | null;
  scrape_route: 'rss' | 'firecrawl';
  rss_allow_firecrawl_fallback: boolean;
  domain: string;
  priority: number;
  is_active: boolean;
  locale_hint: 'fr' | 'en' | 'both';
};

type DayTheme = {
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

type ScrapedDocument = {
  source: SourceRow;
  sourceUrl: string;
  rawMarkdown: string;
  cleanedText: string;
  status: number;
  scrapeOk: boolean;
  title: string;
  snippet: string;
  scrapeMethod: ScrapeResult['scrapeMethod'];
};

type ScrapeResult = {
  sourceUrl: string;
  rawMarkdown: string;
  cleanedText: string;
  status: number;
  scrapeOk: boolean;
  title: string;
  snippet: string;
  scrapeMethod: 'rss' | 'cheerio' | 'firecrawl' | 'rss+cheerio' | 'rss+firecrawl' | 'cheerio+firecrawl';
  isDuplicate?: boolean;
};

type Story = {
  sourceId: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  snippet: string;
  priority: number;
};

type EvidenceStory = {
  sourceId: string;
  sourceUrl: string;
  sourceName: string;
  title: string;
  snippet: string;
  claims: string[];
  wordCount: number;
  dataPoints: number;
  qualityScore: number;
  truncated: boolean;
};

type EvidencePack = {
  stories: EvidenceStory[];
  sourceUrls: string[];
  totalChars: number;
  truncatedStories: number;
  tokenEstimate: number;
};

type BriefQualityReport = {
  score: number;
  threshold: number;
  checks: Record<string, boolean>;
  failures: string[];
  attempts: number;
};

type Summary30Locale = {
  bullets: string[];
  primary_source_url: string;
  source_urls: string[];
};

type Summary30Payload = {
  fr: Summary30Locale;
  en: Summary30Locale;
};
type LocaleDraft = {
  title: string;
  introduction: string;
  bigNews: {
    name: string;
    impact: string;
    source_url: string;
  };
  quickHits: Array<{
    topic: string;
    summary: string;
    source_url: string;
  }>;
  lookingAhead: string;
};

type BilingualDraft = {
  tags: string[];
  fr: LocaleDraft;
  en: LocaleDraft;
};

type WebLocaleDraft = {
  title: string;
  introduction: string;
  article_markdown: string;
};

type BilingualWebArticleDraft = {
  fr: WebLocaleDraft;
  en: WebLocaleDraft;
};

type RecapConfig = {
  firecrawlApiKey?: string;
  googleApiKey?: string;
  summaryModel: string;
  anthropicApiKey: string;
  articleModel: string;
  articleFallbackModel?: string;
  sendFoxApiToken: string;
  sendFoxListId: string;
  sendFoxTestListId?: string;
  sendFoxBaseUrl: string;
  sendFoxFromName: string;
  sendFoxFromEmail: string;
  maxSources: number;
  targetSuccessfulScrapes: number;
  articleHour: number;
  newsletterHour: number;
  articleMaxTokens: number;
  articleSourceCharLimit: number;
  evidenceSnippetMaxChars: number;
  evidenceClaimsMaxPerStory: number;
  evidencePackMaxChars: number;
  scrapeMinWords: number;
  briefQualityThreshold: number;
  timezone: string;
  appBaseUrl: string;
};

type RunMode = 'tick' | 'build_article' | 'send_newsletter' | 'retry_newsletter';

type SponsoredEmailAd = {
  campaignId: string;
  creativeId: string;
  title: string;
  ctaText: string;
  imageUrl: string;
  destinationUrl: string;
  trackingUrl: string;
  poolType: 'monthly' | 'weekly';
};

type NewsletterSendSlot = 'A' | 'B' | 'C' | 'D' | 'E';

type NewsletterSlotRender = {
  slot: 'monthly' | 'weekly';
  servedFromPool: 'monthly' | 'weekly' | 'fallback';
  ad: SponsoredEmailAd | null;
};

type RecapSchedule = {
  isEnabled: boolean;
  timezone: string;
  slots: Array<{
    day: number;
    hour: number;
    minute: number;
  }>;
};

const editionKeyPattern = /^[A-Z0-9][A-Z0-9_-]*$/i;
const ALLOWED_RECAP_TAGS = [
  'AI & LLM',
  'Automation',
  'SaaS & Tools',
  'Open Source',
  'Development',
  'Productivity',
  'Future & Research',
  'Ethics & Policy',
  'Tech Industry',
  'Hardware & GPUs',
] as const;
const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';
const FIRECRAWL_TIMEOUT_MS = 20_000;
const RSS_FETCH_TIMEOUT_MS = 10_000;
const CHEERIO_FETCH_TIMEOUT_MS = 12_000;
const FIRECRAWL_MAX_ATTEMPTS = 3;
const FIRECRAWL_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRYABLE_STATUS = new Set([429, 500, 502, 503]);
const ANTHROPIC_RATE_LIMIT_MAX_ATTEMPTS = 3;
const BRIEF_GENERATION_MAX_ATTEMPTS = 2;
const SUMMARY30_MAX_ATTEMPTS = 2;

const requestSchema = z.object({
  trigger: z.enum(['cron', 'manual', 'retry']).optional(),
  force: z.boolean().optional(),
  mode: z.enum(['tick', 'build_article', 'send_newsletter', 'retry_newsletter', 'run']).optional(),
  editionKey: z
    .string()
    .min(3)
    .max(64)
    .regex(editionKeyPattern)
    .optional(),
  testEmail: z.string().email().optional(),
  testMode: z.boolean().optional(),
});

const draftSchema = z.object({
  tags: z
    .array(z.enum(ALLOWED_RECAP_TAGS))
    .min(1)
    .max(3)
    .refine((tags) => new Set(tags).size === tags.length, 'Tags must be unique'),
  fr: z.object({
    title: z.string().min(10).max(180),
    introduction: z.string().min(20).max(1200),
    bigNews: z.object({
      name: z.string().min(2).max(180),
      impact: z.string().min(20).max(2200),
      source_url: z.string().url(),
    }),
    quickHits: z
      .array(
        z.object({
          topic: z.string().min(2).max(180),
          summary: z.string().min(10).max(1200),
          source_url: z.string().url(),
        }),
      )
      .max(3),
    lookingAhead: z.string().min(10).max(600),
  }),
  en: z.object({
    title: z.string().min(10).max(180),
    introduction: z.string().min(20).max(1200),
    bigNews: z.object({
      name: z.string().min(2).max(180),
      impact: z.string().min(20).max(2200),
      source_url: z.string().url(),
    }),
    quickHits: z
      .array(
        z.object({
          topic: z.string().min(2).max(180),
          summary: z.string().min(10).max(1200),
          source_url: z.string().url(),
        }),
      )
      .max(3),
    lookingAhead: z.string().min(10).max(600),
  }),
});

const webArticleSchema = z.object({
  fr: z.object({
    title: z.string().min(10).max(180),
    introduction: z.string().min(20).max(1200),
    article_markdown: z.string().min(1500).max(100000),
  }),
  en: z.object({
    title: z.string().min(10).max(180),
    introduction: z.string().min(20).max(1200),
    article_markdown: z.string().min(1200).max(100000),
  }),
});

const webArticleLocaleSchema = z.object({
  title: z.string().min(10).max(180),
  introduction: z.string().min(20).max(1200),
  article_markdown: z.string().min(1200).max(100000),
});

const summary30LocaleSchema = z.object({
  bullets: z.array(z.string().min(10).max(320)).min(1).max(3),
  primary_source_url: z.string().url(),
  source_urls: z.array(z.string().url()).min(1).max(8),
});

const summary30Schema = z.object({
  fr: summary30LocaleSchema,
  en: summary30LocaleSchema,
});

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnvOneOf(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function optionalNumberEnv(name: string, fallback: number) {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value) || value <= 0) return fallback;
  return value;
}

function boundedNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = optionalNumberEnv(name, fallback);
  return Math.min(max, Math.max(min, value));
}

function normalizeAnthropicModel(raw: string | undefined, fallback: string) {
  if (!raw?.trim()) {
    return fallback;
  }

  const cleaned = raw.trim().replace(/^['"]+|['"]+$/g, '');
  const extracted = cleaned.match(/claude-[a-z0-9.-]+/i)?.[0];
  return extracted ?? cleaned;
}

function parseAnthropicMaxTokensLimit(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const match = message.match(/max_tokens:\s*\d+\s*>\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isAnthropicRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.status === 429) {
      return true;
    }
    if (err.error && typeof err.error === 'object') {
      const inner = err.error as Record<string, unknown>;
      if (inner.type === 'rate_limit_error') {
        return true;
      }
    }
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return /rate.?limit|429|too many requests/i.test(message);
}

function extractAnthropicRetryAfterMs(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.headers && typeof err.headers === 'object') {
      const headers = err.headers as Record<string, unknown>;
      const retryAfter = headers['retry-after'];
      if (typeof retryAfter === 'string') {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds > 0) {
          return Math.round(seconds * 1000);
        }
      }
    }
  }
  return null;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const bracketMatch = trimmed.match(/<([^>]+)>/);
  const candidate = (bracketMatch?.[1] ?? trimmed).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function getConfig(): RecapConfig {
  const edgeEnv = getEdgeEnv();
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')?.trim() || undefined;
  const articleModel = normalizeAnthropicModel(
    Deno.env.get('RECAP_ARTICLE_MODEL') ?? edgeEnv.anthropicModelPrimary,
    'claude-sonnet-4-6',
  );
  const articleFallbackModel = normalizeAnthropicModel(
    edgeEnv.anthropicModelFallback,
    'claude-haiku-4-5',
  );
  const summaryModel = Deno.env.get('RECAP_SUMMARY_MODEL')?.trim() || 'gemini-3-flash';
  const sendFoxListId = requiredEnv('SENDFOX_LIST_ID');
  const sendFoxTestListId = Deno.env.get('SENDFOX_TEST_LIST_ID')?.trim() || undefined;
  const sendFoxFromName = Deno.env.get('SENDFOX_FROM_NAME')?.trim() || 'KODE01';
  const sendFoxFromEmail =
    normalizeEmailAddress(Deno.env.get('SENDFOX_FROM_EMAIL')) ??
    normalizeEmailAddress(Deno.env.get('RESEND_FROM_EMAIL')) ??
    'news@kode01.com';
  return {
    firecrawlApiKey,
    googleApiKey: optionalEnvOneOf(['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']),
    summaryModel,
    anthropicApiKey: requiredEnv('ANTHROPIC_API_KEY'),
    articleModel,
    articleFallbackModel,
    sendFoxApiToken: requiredEnv('SENDFOX_API_TOKEN'),
    sendFoxListId,
    sendFoxTestListId,
    sendFoxBaseUrl: (Deno.env.get('SENDFOX_API_BASE_URL') ?? 'https://api.sendfox.com').replace(/\/+$/, ''),
    sendFoxFromName,
    sendFoxFromEmail,
    maxSources: boundedNumberEnv('RECAP_MAX_SOURCES', 12, 1, 30),
    targetSuccessfulScrapes: boundedNumberEnv('RECAP_TARGET_SUCCESSFUL_SCRAPES', 4, 1, 12),
    articleHour: boundedNumberEnv('RECAP_ARTICLE_HOUR', 6, 0, 23),
    newsletterHour: boundedNumberEnv('RECAP_NEWSLETTER_HOUR', 12, 0, 23),
    articleMaxTokens: boundedNumberEnv('RECAP_ARTICLE_MAX_TOKENS', 6500, 1000, 8192),
    articleSourceCharLimit: boundedNumberEnv('RECAP_ARTICLE_SOURCE_CHAR_LIMIT', 16000, 1500, 28000),
    evidenceSnippetMaxChars: boundedNumberEnv('RECAP_EVIDENCE_SNIPPET_MAX_CHARS', 1800, 400, 5000),
    evidenceClaimsMaxPerStory: boundedNumberEnv('RECAP_EVIDENCE_CLAIMS_MAX_PER_STORY', 8, 2, 20),
    evidencePackMaxChars: boundedNumberEnv('RECAP_EVIDENCE_PACK_MAX_CHARS', 12000, 3000, 30000),
    scrapeMinWords: boundedNumberEnv('RECAP_SCRAPE_MIN_WORDS', 120, 40, 1200),
    briefQualityThreshold: boundedNumberEnv('RECAP_BRIEF_QUALITY_THRESHOLD', 80, 40, 100),
    timezone: Deno.env.get('RECAP_TIMEZONE') ?? 'America/Toronto',
    appBaseUrl: edgeEnv.appBaseUrl,
  };
}

async function writeAuditLog(eventType: string, metadata: Record<string, unknown>) {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      event_type: eventType,
      metadata,
    });
  } catch (error) {
    console.error('weekly-ai-recap-cron audit log insert failed:', error);
  }
}

async function getSchedule(config: RecapConfig): Promise<RecapSchedule> {
  const fallback: RecapSchedule = {
    isEnabled: true,
    timezone: config.timezone,
    slots: [
      { day: 1, hour: 6, minute: 0 },
      { day: 2, hour: 6, minute: 0 },
      { day: 3, hour: 6, minute: 0 },
      { day: 4, hour: 6, minute: 0 },
      { day: 5, hour: 6, minute: 0 },
    ],
  };

  const { data, error } = await supabaseAdmin
    .from('ai_recap_schedule_settings')
    .select('is_enabled, timezone, slot_a_day, slot_a_hour, slot_a_minute, slot_b_day, slot_b_hour, slot_b_minute, slot_c_day, slot_c_hour, slot_c_minute, slot_d_day, slot_d_hour, slot_d_minute, slot_e_day, slot_e_hour, slot_e_minute')
    .eq('id', true)
    .maybeSingle();

  if (error || !data) {
    return fallback;
  }

  const timezone = typeof data.timezone === 'string' && isValidTimeZone(data.timezone)
    ? data.timezone
    : fallback.timezone;

  const slots: RecapSchedule['slots'] = [
    { day: Number(data.slot_a_day), hour: Number(data.slot_a_hour), minute: Number(data.slot_a_minute) },
    { day: Number(data.slot_b_day), hour: Number(data.slot_b_hour), minute: Number(data.slot_b_minute) },
  ];

  // Add slots C-E if they exist (5-day schedule)
  if (data.slot_c_day != null) {
    slots.push({ day: Number(data.slot_c_day), hour: Number(data.slot_c_hour), minute: Number(data.slot_c_minute) });
  }
  if (data.slot_d_day != null) {
    slots.push({ day: Number(data.slot_d_day), hour: Number(data.slot_d_hour), minute: Number(data.slot_d_minute) });
  }
  if (data.slot_e_day != null) {
    slots.push({ day: Number(data.slot_e_day), hour: Number(data.slot_e_hour), minute: Number(data.slot_e_minute) });
  }

  return {
    isEnabled: data.is_enabled !== false,
    timezone,
    slots,
  };
}

function weekdayToDayIndex(weekdayIndex: number): number | null {
  // Convert JS weekday (0=Sun...6=Sat) to day_index (1=Mon...5=Fri)
  if (weekdayIndex >= 1 && weekdayIndex <= 5) return weekdayIndex;
  return null; // Weekend
}

async function getDayTheme(weekdayIndex: number): Promise<DayTheme | null> {
  const dayIndex = weekdayToDayIndex(weekdayIndex);
  if (dayIndex === null) return null;

  const { data, error } = await supabaseAdmin
    .from('ai_recap_day_themes')
    .select('*')
    .eq('day_index', dayIndex)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as DayTheme;
}

function getDateParts(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const entries = formatter.formatToParts(now);
  const get = (type: string) => entries.find((part) => part.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const weekday = get('weekday');

  return { year, month, day, hour, minute, weekday };
}

function getWeekdayToken(now: Date, timezone: string) {
  const { year, month, day } = getDateParts(now, timezone);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const tokens = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return tokens[localDate.getUTCDay()] ?? '';
}

function weekdayToIndex(weekdayToken: string) {
  const map: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  };

  return map[weekdayToken] ?? -1;
}

function getIsoWeekKey(now: Date, timezone: string) {
  const { year, month, day } = getDateParts(now, timezone);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const isoYear = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function getEditionKey(now: Date, timezone: string) {
  const weekKey = getIsoWeekKey(now, timezone);
  const weekdayToken = getWeekdayToken(now, timezone);
  return `${weekKey}-${weekdayToken}`;
}

function normalizeEditionKey(editionKey: string) {
  return editionKey.trim().toUpperCase();
}

function extractEditionWeekdayToken(editionKey: string) {
  const normalized = normalizeEditionKey(editionKey);
  const parts = normalized.split('-');
  const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return parts.find((p) => weekdays.includes(p)) ?? null;
}

function resolveNewsletterSendSlot(schedule: RecapSchedule, editionKey: string): NewsletterSendSlot {
  const weekdayToken = extractEditionWeekdayToken(editionKey);
  const weekdayIndex = weekdayToken ? weekdayToIndex(weekdayToken) : -1;

  const slotLabels: NewsletterSendSlot[] = ['A', 'B', 'C', 'D', 'E'];
  for (let i = 0; i < schedule.slots.length && i < slotLabels.length; i++) {
    if (schedule.slots[i] && schedule.slots[i].day === weekdayIndex) return slotLabels[i];
  }

  // Fallback for manual retries: deterministic split by edition key hash parity.
  let hash = 0;
  for (let i = 0; i < editionKey.length; i += 1) {
    hash = ((hash << 5) - hash + editionKey.charCodeAt(i)) | 0;
  }
  return slotLabels[Math.abs(hash) % Math.max(1, schedule.slots.length)];
}

function getLocalWeekdayIndex(now: Date, timezone: string) {
  const token = getWeekdayToken(now, timezone);
  return weekdayToIndex(token);
}

function matchesClock(parts: ReturnType<typeof getDateParts>, hour: number, minute: number) {
  return parts.hour === hour && parts.minute === minute;
}

function isTickDay(slot: RecapSchedule['slots'][number], weekdayIndex: number) {
  return slot.day === weekdayIndex;
}

function hashToIndex(seed: string, modulo: number) {
  if (modulo <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0) % modulo;
}

function getWeekBounds(now: Date, timezone: string) {
  const { year, month, day } = getDateParts(now, timezone);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const weekdayIndex = (localDate.getUTCDay() + 6) % 7;
  const monday = new Date(localDate);
  monday.setUTCDate(monday.getUTCDate() - weekdayIndex);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  const toIsoDate = (value: Date) =>
    `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(
      value.getUTCDate(),
    ).padStart(2, '0')}`;

  return {
    weekStart: toIsoDate(monday),
    weekEnd: toIsoDate(sunday),
  };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70);
}

function cleanMarkdown(markdown: string) {
  if (!markdown) return '';

  // Patterns that indicate boilerplate navigation/UI lines (only applied to short lines)
  const noisePattern =
    /(cookie|privacy|terms|advert|sponsor|sponsored|subscribe|sign in|log in|menu|navigation|javascript|accept all)/i;

  // Patterns that are always noise regardless of line length
  const alwaysNoisePattern =
    /^\[skip to|^accept cookies|^share this|^follow us|^related articles|^read more|^advertisement|^!\[\]\(/i;

  const lines = markdown
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      // Always remove pure noise lines
      if (alwaysNoisePattern.test(line)) return false;
      // Only apply general noise filter to short lines (< 80 chars)
      // to avoid removing legitimate content like "privacy implications of AI"
      if (line.length < 80 && noisePattern.test(line)) return false;
      return true;
    })
    .filter((line) => line.length > 15 || line.startsWith('#'));

  const joined = lines.join('\n');
  return joined.replace(/\n{3,}/g, '\n\n').trim();
}

function scoreContentQuality(cleanedText: string): { score: number; wordCount: number; dataPoints: number } {
  if (!cleanedText) return { score: 0, wordCount: 0, dataPoints: 0 };

  const wordCount = cleanedText.split(/\s+/).length;
  // Count numbers, percentages, dates, dollar amounts
  const dataPointMatches = cleanedText.match(/\b\d[\d,.]*%|\$[\d,.]+[BMK]?|\b\d{4}\b|\b\d+\.\d+\b|\b\d{2,}\b/g);
  const dataPoints = dataPointMatches?.length ?? 0;

  // Score: prioritize content with both length and data richness
  const score = Math.min(wordCount, 2000) + dataPoints * 50;
  return { score, wordCount, dataPoints };
}

function extractTitle(markdown: string, fallback: string) {
  const line = markdown
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.startsWith('#') && value.length > 3);

  if (!line) return fallback;
  return line.replace(/^#+\s*/, '').slice(0, 180);
}

function extractSnippet(cleanedText: string) {
  if (!cleanedText) return '';
  const compact = cleanedText.replace(/\s+/g, ' ').trim();
  const sentences = compact.match(/[^.!?]+[.!?]/g) ?? [];
  if (sentences.length >= 2) {
    return `${sentences[0].trim()} ${sentences[1].trim()}`.slice(0, 500);
  }
  return compact.slice(0, 500);
}

function truncateForPrompt(value: string, maxChars: number) {
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Content truncated for context window safety.]`;
}

function buildExcerpt(options: {
  introduction?: string;
  fallback?: string;
  articleMarkdown?: string;
  maxLength?: number;
}) {
  const maxLength = options.maxLength ?? 220;
  const firstChoice = options.introduction?.replace(/\s+/g, ' ').trim() ?? '';
  if (firstChoice.length > 0) {
    return firstChoice.slice(0, maxLength);
  }

  const markdownCompact = options.articleMarkdown
    ?.replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim() ?? '';
  if (markdownCompact.length > 0) {
    return markdownCompact.slice(0, maxLength);
  }

  const fallback = options.fallback?.replace(/\s+/g, ' ').trim() ?? '';
  return fallback.slice(0, maxLength);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(response: Response) {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

function getSecureRandomInt(maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 1) return 0;
  // Rejection sampling avoids modulo bias when mapping Uint32 to a smaller range.
  const fullRange = 0x1_0000_0000;
  const upperBound = fullRange - (fullRange % maxExclusive);
  const random = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(random);
    const candidate = random[0];
    if (candidate < upperBound) {
      return candidate % maxExclusive;
    }
  }
}

function getBackoffMs(attempt: number) {
  const baseMs = 400 * (2 ** (attempt - 1));
  const jitterMs = getSecureRandomInt(250);
  return baseMs + jitterMs;
}

function toAbsoluteUrl(candidate: string, baseUrl: string) {
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (/^(mailto|tel|javascript):/i.test(trimmed)) return null;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyArticleUrl(candidateUrl: string, sourceUrl: string) {
  try {
    const candidate = new URL(candidateUrl);
    const source = new URL(sourceUrl);
    if (candidate.hostname !== source.hostname) return false;
    const path = candidate.pathname.toLowerCase();
    return /(blog|news|article|post|research|release|updates|announc|202[0-9]|\/p\/)/.test(path);
  } catch {
    return false;
  }
}

function scoreArticleCandidate(candidateUrl: string, sourceUrl: string) {
  let score = 0;
  try {
    const candidate = new URL(candidateUrl);
    const source = new URL(sourceUrl);
    if (candidate.hostname === source.hostname) score += 20;
    const path = candidate.pathname.toLowerCase();
    if (/(blog|news|article|post|research|release|updates|announc)/.test(path)) score += 30;
    if (/202[0-9]/.test(path)) score += 20;
    if (path.split('/').filter(Boolean).length >= 2) score += 10;
    if (candidate.search.length === 0) score += 5;
    if (path.length > 10) score += 5;
  } catch {
    return 0;
  }
  return score;
}

function collectCheerioArticleCandidates(html: string, sourceUrl: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    const absolute = toAbsoluteUrl(href, sourceUrl);
    if (!absolute) return;
    if (!isLikelyArticleUrl(absolute, sourceUrl)) return;
    out.add(absolute);
  });

  return [...out];
}

async function fetchHtmlWithTimeout(targetUrl: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KODE01-AI-Recap/1.0; +https://kode01.com)',
      },
    });
    const html = await response.text();
    return { response, html };
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverBestArticleUrlFromSource(source: SourceRow) {
  try {
    const { response, html } = await fetchHtmlWithTimeout(source.url, CHEERIO_FETCH_TIMEOUT_MS);
    if (!response.ok || !html) return source.url;
    const candidates = collectCheerioArticleCandidates(html, source.url);
    if (candidates.length === 0) return source.url;

    const ranked = candidates
      .map((url) => ({ url, score: scoreArticleCandidate(url, source.url) }))
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.url ?? source.url;
  } catch {
    return source.url;
  }
}

function scrapeQualityMetrics(cleanedText: string, minWords: number) {
  const contentQuality = scoreContentQuality(cleanedText);
  return {
    wordCount: contentQuality.wordCount,
    dataPoints: contentQuality.dataPoints,
    score: contentQuality.score,
    sufficient: contentQuality.wordCount >= minWords && contentQuality.score >= minWords,
  };
}

function extractMainContentWithCheerio(html: string, source: SourceRow, targetUrl: string) {
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('article h1').first().text().trim() ||
    $('main h1').first().text().trim() ||
    $('h1').first().text().trim() ||
    $('title').first().text().trim() ||
    source.name;

  $('script,style,noscript,nav,footer,header,aside,form,button').remove();

  const candidateRoots = ['article', 'main', '[role="main"]', '.post', '.article', '.content', '#content'];
  let paragraphs: string[] = [];

  for (const selector of candidateRoots) {
    const nodes = $(selector).find('p');
    const extracted = nodes
      .map((_, node) => $(node).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((line) => line.length >= 30);
    if (extracted.length >= 3) {
      paragraphs = extracted;
      break;
    }
  }

  if (paragraphs.length === 0) {
    paragraphs = $('p')
      .map((_, node) => $(node).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((line) => line.length >= 30)
      .slice(0, 60);
  }

  const rawMarkdown = [`# ${title}`, ...paragraphs].join('\n\n').trim();
  const cleanedText = cleanMarkdown(rawMarkdown);

  return {
    sourceUrl: targetUrl,
    rawMarkdown,
    cleanedText,
    title: extractTitle(rawMarkdown, source.name),
    snippet: extractSnippet(cleanedText),
  };
}

async function scrapeWithCheerio(
  source: SourceRow,
  targetUrl: string,
  config: RecapConfig,
): Promise<ScrapeResult> {
  const { response, html } = await fetchHtmlWithTimeout(targetUrl, CHEERIO_FETCH_TIMEOUT_MS);
  const extracted = extractMainContentWithCheerio(html, source, targetUrl);
  const quality = scrapeQualityMetrics(extracted.cleanedText, config.scrapeMinWords);

  return {
    sourceUrl: targetUrl,
    status: response.status,
    rawMarkdown: extracted.rawMarkdown,
    cleanedText: extracted.cleanedText,
    title: extracted.title,
    snippet: extracted.snippet,
    scrapeMethod: 'cheerio',
    scrapeOk: response.ok && quality.sufficient && extracted.cleanedText.length > 0,
  };
}

async function fetchFirecrawlWithRetry(sourceUrl: string, apiKey: string) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= FIRECRAWL_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FIRECRAWL_TIMEOUT_MS);

    try {
      const response = await fetch(FIRECRAWL_SCRAPE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: sourceUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          blockAds: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (FIRECRAWL_RETRYABLE_STATUS.has(response.status) && attempt < FIRECRAWL_MAX_ATTEMPTS) {
        const retryAfterMs = getRetryAfterMs(response) ?? getBackoffMs(attempt);
        await sleep(retryAfterMs);
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= FIRECRAWL_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(getBackoffMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Firecrawl request failed');
}

function decodeXmlEntities(value: string) {
  if (!value) return '';
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCharCode(Number(decimal)));
}

function stripCdata(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTagValue(content: string, tagNames: string[]) {
  for (const tag of tagNames) {
    const pattern = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i');
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function getFeedLink(itemContent: string) {
  const rssLinkMatch = itemContent.match(/<link>(https?:\/\/[^<]+)<\/link>/i);
  if (rssLinkMatch?.[1]) return rssLinkMatch[1].trim();

  const atomLinkMatch = itemContent.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/i);
  if (atomLinkMatch?.[1]) return atomLinkMatch[1].trim();

  const guidLinkMatch = itemContent.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i);
  if (guidLinkMatch?.[1]) return guidLinkMatch[1].trim();

  return null;
}

function parseLatestFeedEntry(xml: string) {
  const itemMatch = xml.match(/<(?:item|entry)\b[\s\S]*?>([\s\S]*?)<\/(?:item|entry)>/i);
  if (!itemMatch) return null;

  const itemContent = itemMatch[1];
  const titleRaw = getTagValue(itemContent, ['title']) ?? '';
  const bodyRaw = getTagValue(itemContent, ['content:encoded', 'content', 'summary', 'description']) ?? '';
  const title = normalizeText(stripHtml(decodeXmlEntities(stripCdata(titleRaw))));
  const body = normalizeText(stripHtml(decodeXmlEntities(stripCdata(bodyRaw))));
  const link = getFeedLink(itemContent);

  return {
    link,
    title,
    body,
  };
}

function formatFeedEntryMarkdown(entry: { title: string; body: string }, fallbackTitle: string) {
  const lines: string[] = [];
  const title = entry.title || fallbackTitle;
  if (title) lines.push(`# ${title}`);
  if (entry.body) lines.push(entry.body);
  return lines.join('\n\n').trim();
}

function buildFailedScrapeResult(sourceUrl: string, status: number, title: string): ScrapeResult {
  return {
    sourceUrl,
    status,
    rawMarkdown: '',
    cleanedText: '',
    title,
    snippet: '',
    scrapeOk: false,
    scrapeMethod: 'rss',
  };
}

async function findDuplicateScrape(sourceUrl: string, fallbackTitle: string): Promise<ScrapeResult | null> {
  const { data: existingDoc } = await supabaseAdmin
    .from('ai_recap_documents')
    .select('id, raw_markdown, cleaned_text')
    .eq('source_url', sourceUrl)
    .eq('scrape_ok', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existingDoc) return null;

  console.log(`[Dedupe] Skipping already processed article: ${sourceUrl}`);
  return {
    sourceUrl,
    status: 208,
    rawMarkdown: '',
    cleanedText: '',
    title: fallbackTitle,
    snippet: '',
    scrapeOk: false,
    scrapeMethod: 'rss',
    isDuplicate: true,
  };
}

async function scrapeWithFirecrawl(source: SourceRow, targetUrl: string, apiKey?: string): Promise<ScrapeResult> {
  if (!apiKey) {
    throw new Error(`[Firecrawl] Missing FIRECRAWL_API_KEY for source "${source.name}" (${targetUrl})`);
  }

  const response = await fetchFirecrawlWithRetry(targetUrl, apiKey);
  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const data = (payload.data as Record<string, unknown> | undefined) ?? {};
  const markdownCandidate = (data.markdown as string | undefined) ?? (payload.markdown as string | undefined) ?? '';
  const explicitFailure = payload.success === false;

  const cleanedText = cleanMarkdown(markdownCandidate);
  const title = extractTitle(markdownCandidate || cleanedText, source.name);
  const snippet = extractSnippet(cleanedText);

  return {
    sourceUrl: targetUrl,
    status: response.status,
    rawMarkdown: markdownCandidate,
    cleanedText,
    title,
    snippet,
    scrapeMethod: 'firecrawl',
    scrapeOk: response.ok && !explicitFailure && cleanedText.length > 0,
  };
}

async function fallbackToFirecrawlIfAllowed(args: {
  source: SourceRow;
  targetUrl: string;
  apiKey?: string;
  reason: string;
  status: number;
  priorMethod?: 'rss' | 'cheerio';
}): Promise<ScrapeResult> {
  const { source, targetUrl, apiKey, reason, status, priorMethod } = args;
  if (!source.rss_allow_firecrawl_fallback) {
    console.warn(`[RSS] ${reason}. Firecrawl fallback disabled for ${source.name}.`);
    return buildFailedScrapeResult(targetUrl, status, source.name);
  }

  console.warn(`[RSS] ${reason}. Trying Firecrawl fallback for ${source.name} -> ${targetUrl}`);
  const fallback = await scrapeWithFirecrawl(source, targetUrl, apiKey);
  if (!fallback.scrapeOk) return fallback;
  return {
    ...fallback,
    scrapeMethod:
      priorMethod === 'rss'
        ? 'rss+firecrawl'
        : priorMethod === 'cheerio'
          ? 'cheerio+firecrawl'
          : fallback.scrapeMethod,
  };
}

async function scrapeViaRss(source: SourceRow, config: RecapConfig): Promise<ScrapeResult> {
  const feedUrl = source.feed_url?.trim();
  if (!feedUrl) {
    throw new Error(`[RSS] Source "${source.name}" is configured with rss route but has no feed_url`);
  }

  const feedController = new AbortController();
  const feedTimeout = setTimeout(() => feedController.abort(), RSS_FETCH_TIMEOUT_MS);
  let rssStatus = 500;
  try {
    const rssResponse = await fetch(feedUrl, {
      signal: feedController.signal,
    });
    rssStatus = rssResponse.status;
    if (!rssResponse.ok) {
      return fallbackToFirecrawlIfAllowed({
        source,
        targetUrl: source.url,
        apiKey: config.firecrawlApiKey,
        reason: `Feed request failed with status ${rssResponse.status}`,
        status: rssResponse.status,
        priorMethod: 'rss',
      });
    }

    const xml = await rssResponse.text();
    const entry = parseLatestFeedEntry(xml);
    if (!entry) {
      return fallbackToFirecrawlIfAllowed({
        source,
        targetUrl: source.url,
        apiKey: config.firecrawlApiKey,
        reason: 'No <item>/<entry> found in feed',
        status: rssResponse.status,
        priorMethod: 'rss',
      });
    }

    const targetUrl = entry.link?.trim() || source.url;
    if (entry.link && targetUrl !== source.url) {
      console.log(`[RSS] Resolved link for ${source.name}: ${targetUrl}`);
      const deduped = await findDuplicateScrape(targetUrl, entry.title || source.name);
      if (deduped) {
        return deduped;
      }
    }

    const rawMarkdown = formatFeedEntryMarkdown(entry, source.name);
    const cleanedText = cleanMarkdown(rawMarkdown);
    let cheerioResult: ScrapeResult | null = null;
    try {
      cheerioResult = await scrapeWithCheerio(source, targetUrl, config);
      if (cheerioResult.scrapeOk) {
        return {
          ...cheerioResult,
          scrapeMethod: 'rss+cheerio',
        };
      }
    } catch (error) {
      console.warn(`[RSS] Cheerio extraction failed for ${source.name} (${targetUrl}):`, error);
    }

    if (source.rss_allow_firecrawl_fallback) {
      return fallbackToFirecrawlIfAllowed({
        source,
        targetUrl,
        apiKey: config.firecrawlApiKey,
        reason: 'Cheerio extraction not sufficient for RSS story',
        status: cheerioResult?.status ?? rssResponse.status,
        priorMethod: 'rss',
      });
    }

    if (cleanedText.length > 0) {
      const title = entry.title || extractTitle(rawMarkdown || cleanedText, source.name);
      const quality = scrapeQualityMetrics(cleanedText, config.scrapeMinWords);
      return {
        sourceUrl: targetUrl,
        status: rssResponse.status,
        rawMarkdown,
        cleanedText,
        title,
        snippet: extractSnippet(cleanedText),
        scrapeMethod: 'rss',
        scrapeOk: quality.sufficient,
      };
    }

    return fallbackToFirecrawlIfAllowed({
      source,
      targetUrl,
      apiKey: config.firecrawlApiKey,
      reason: 'Feed entry has no usable text content',
      status: rssResponse.status,
      priorMethod: 'rss',
    });
  } catch (error) {
    console.error(`[RSS] Failed to parse feed for ${source.name} (${feedUrl}):`, error);
    return fallbackToFirecrawlIfAllowed({
      source,
      targetUrl: source.url,
      apiKey: config.firecrawlApiKey,
      reason: 'Feed request failed with network/parsing error',
      status: rssStatus,
      priorMethod: 'rss',
    });
  } finally {
    clearTimeout(feedTimeout);
  }
}

async function scrapeSource(source: SourceRow, config: RecapConfig): Promise<ScrapeResult> {
  const route = source.scrape_route === 'rss' ? 'rss' : 'firecrawl';
  if (route === 'rss') {
    return scrapeViaRss(source, config);
  }

  const discoveredTargetUrl = await discoverBestArticleUrlFromSource(source);
  try {
    const cheerioResult = await scrapeWithCheerio(source, discoveredTargetUrl, config);
    if (cheerioResult.scrapeOk) {
      return cheerioResult;
    }
  } catch (error) {
    console.warn(`[Cheerio] Extraction failed for ${source.name} (${discoveredTargetUrl}):`, error);
  }

  const fallback = await scrapeWithFirecrawl(source, discoveredTargetUrl, config.firecrawlApiKey);
  if (!fallback.scrapeOk) return fallback;

  return {
    ...fallback,
    scrapeMethod: 'cheerio+firecrawl',
  };
}

async function persistDocument(runId: string, source: SourceRow, scrape: {
  sourceUrl: string;
  status: number;
  rawMarkdown: string;
  cleanedText: string;
  scrapeOk: boolean;
  scrapeMethod?: ScrapeResult['scrapeMethod'];
}) {
  await supabaseAdmin.from('ai_recap_documents').insert({
    run_id: runId,
    source_id: source.id,
    source_url: scrape.sourceUrl,
    raw_markdown: scrape.rawMarkdown || null,
    cleaned_text: scrape.cleanedText || null,
    http_status: Number.isFinite(scrape.status) ? scrape.status : null,
    scrape_ok: scrape.scrapeOk,
    scrape_method: scrape.scrapeMethod ?? null,
  });
}

function pickStories(documents: ScrapedDocument[]) {
  const ranked = [...documents]
    .filter((doc) => doc.scrapeOk && doc.cleanedText.length > 0)
    .sort((a, b) => {
      if (b.source.priority !== a.source.priority) {
        return b.source.priority - a.source.priority;
      }
      // Break ties by content quality score (data-rich content preferred)
      const scoreA = scoreContentQuality(a.cleanedText).score;
      const scoreB = scoreContentQuality(b.cleanedText).score;
      return scoreB - scoreA;
    });

  return ranked.map((doc) => ({
    sourceId: doc.source.id,
    sourceUrl: doc.sourceUrl,
    sourceName: doc.source.name,
    title: doc.title,
    snippet: doc.snippet,
    priority: doc.source.priority,
  })) as Story[];
}

function extractEvidenceClaims(cleanedText: string, maxClaims: number) {
  if (!cleanedText) return [] as string[];
  const compact = cleanedText.replace(/\s+/g, ' ').trim();
  const sentenceMatches = compact.match(/[^.!?]+[.!?]/g) ?? [];
  const scored = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25)
    .map((sentence) => ({
      sentence,
      score:
        (/\d/.test(sentence) ? 3 : 0) +
        (/(%|\$|€|£|million|billion|bn|m\b|x\b|latency|accuracy|benchmark|date)/i.test(sentence) ? 2 : 0) +
        (sentence.length > 80 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.sentence.length - a.sentence.length);

  const unique = new Set<string>();
  const claims: string[] = [];
  for (const row of scored) {
    const normalized = row.sentence.toLowerCase();
    if (unique.has(normalized)) continue;
    unique.add(normalized);
    claims.push(row.sentence);
    if (claims.length >= maxClaims) break;
  }

  return claims;
}

function buildEvidencePack(args: {
  stories: Story[];
  docs: ScrapedDocument[];
  config: RecapConfig;
}) {
  const storyByUrl = new Map(args.docs.map((doc) => [doc.sourceUrl, doc]));
  const sourceUrls = Array.from(new Set(args.stories.map((story) => story.sourceUrl)));
  const evidenceStories: EvidenceStory[] = [];
  let totalChars = 0;
  let truncatedStories = 0;

  for (const story of args.stories) {
    const doc = storyByUrl.get(story.sourceUrl) ?? args.docs.find((item) => item.source.id === story.sourceId) ?? null;
    const baseText = doc?.cleanedText || `${story.title}\n\n${story.snippet}`;
    const normalizedText = baseText.replace(/\s+/g, ' ').trim();
    const truncatedText = normalizedText.slice(0, args.config.evidenceSnippetMaxChars);
    const truncated = truncatedText.length < normalizedText.length;
    if (truncated) truncatedStories += 1;

    const quality = scoreContentQuality(normalizedText);
    const claims = extractEvidenceClaims(truncatedText, args.config.evidenceClaimsMaxPerStory);
    const entry: EvidenceStory = {
      sourceId: story.sourceId,
      sourceUrl: story.sourceUrl,
      sourceName: story.sourceName,
      title: story.title,
      snippet: truncatedText || story.snippet,
      claims,
      wordCount: quality.wordCount,
      dataPoints: quality.dataPoints,
      qualityScore: quality.score,
      truncated,
    };

    const projectedChars =
      totalChars +
      entry.title.length +
      entry.snippet.length +
      entry.claims.join(' ').length +
      entry.sourceName.length +
      entry.sourceUrl.length;
    if (projectedChars > args.config.evidencePackMaxChars && evidenceStories.length > 0) {
      break;
    }

    evidenceStories.push(entry);
    totalChars = projectedChars;
  }

  return {
    stories: evidenceStories,
    sourceUrls,
    totalChars,
    truncatedStories,
    tokenEstimate: Math.ceil(totalChars / 4),
  } as EvidencePack;
}

function stripJsonCodeFence(value: string) {
  return value
    .replace(/^```(?:json|xml|markdown|md|txt)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function escapeControlCharsInJsonStrings(value: string) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];

    if (!inString) {
      if (char === '"') {
        inString = true;
      }
      output += char;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char === '\n') {
      output += '\\n';
      continue;
    }
    if (char === '\r') {
      output += '\\r';
      continue;
    }
    if (char === '\t') {
      output += '\\t';
      continue;
    }
    if (char === '\b') {
      output += '\\b';
      continue;
    }
    if (char === '\f') {
      output += '\\f';
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 0x20) {
      output += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }

    output += char;
  }

  return output;
}

function parseModelJson(value: string, contextLabel: string) {
  const cleaned = stripJsonCodeFence(value);
  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');

  const candidates: string[] = [cleaned];
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1).trim());
  }

  let parseError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch (error) {
      parseError = error;
      const escaped = escapeControlCharsInJsonStrings(candidate);
      if (escaped !== candidate) {
        try {
          return JSON.parse(escaped) as unknown;
        } catch (escapeError) {
          parseError = escapeError;
        }
      }
    }
  }

  const reason = parseError instanceof Error ? parseError.message : String(parseError);
  throw new Error(`Invalid ${contextLabel} JSON payload: ${reason}`);
}

function parseDraftJson(
  value: string,
  options: {
    allowedUrls: string[];
    maxQuickHits: number;
  },
): BilingualDraft {
  const payload = parseModelJson(value, 'LLM draft');
  const parsed = parseWithSchema(draftSchema, payload);
  if (!parsed.success) {
    throw new Error(`Invalid LLM draft payload: ${JSON.stringify(parsed.details)}`);
  }

  const allowedUrlSet = new Set(options.allowedUrls);
  if (allowedUrlSet.size === 0) {
    throw new Error('Invalid draft validation config: no allowed URLs');
  }

  const validateLocale = (locale: 'fr' | 'en', draft: LocaleDraft) => {
    if (!allowedUrlSet.has(draft.bigNews.source_url)) {
      throw new Error(`${locale}.bigNews.source_url is outside allowed URLs`);
    }
    if (draft.quickHits.length > options.maxQuickHits) {
      throw new Error(`${locale}.quickHits exceeds max allowed count (${options.maxQuickHits})`);
    }
    for (let i = 0; i < draft.quickHits.length; i += 1) {
      const hit = draft.quickHits[i];
      if (!allowedUrlSet.has(hit.source_url)) {
        throw new Error(`${locale}.quickHits[${i}].source_url is outside allowed URLs`);
      }
    }
  };

  validateLocale('fr', parsed.data.fr);
  validateLocale('en', parsed.data.en);
  return parsed.data;
}

async function generateDraftOnce(stories: Story[], editionKey: string, config: RecapConfig, evidencePack?: EvidencePack) {
  const googleApiKey = config.googleApiKey?.trim();
  if (!googleApiKey) {
    throw new Error('Missing required environment variable: GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY');
  }

  const allowedUrls = stories.map((story) => story.sourceUrl);
  const maxQuickHits = Math.max(0, stories.length - 1);
  const serializedStories = stories.map((story, index) => ({
    index: index + 1,
    source_url: story.sourceUrl,
    source_name: story.sourceName,
    title: story.title,
    snippet: story.snippet,
  }));
  const serializedEvidence = evidencePack?.stories.map((story, index) => ({
    index: index + 1,
    source_url: story.sourceUrl,
    source_name: story.sourceName,
    title: story.title,
    snippet: truncateForPrompt(story.snippet, 700),
    claims: story.claims.slice(0, 6),
    word_count: story.wordCount,
    data_points: story.dataPoints,
    quality_score: story.qualityScore,
  })) ?? [];

  const system = [
    'You are a technology editor specialized in artificial intelligence news.',
    'Your task is to transform extracted AI news stories into a concise weekly newsletter summary in a 30-second bullet-point format.',
    'Focus on important AI developments, product launches, research breakthroughs, and industry moves.',
    'Prioritize stories with the largest impact on businesses, developers, or society.',
    'Write in a clear, modern, professional tech-news tone.',
    'Avoid hype and marketing language.',
    'Output JSON format ONLY.',
    'For tags, you MUST pick 1 to 3 items from this allowed list (EXACT STRINGS ONLY): AI & LLM, Automation, SaaS & Tools, Open Source, Development, Productivity, Future & Research, Ethics & Policy, Tech Industry, Hardware & GPUs.',
  ].join(' ');

  const userPrompt = `
Edition key: ${editionKey}

Allowed source URLs (exact set):
${allowedUrls.map((url) => `- ${url}`).join('\n')}

Stories extracted:
${JSON.stringify(serializedStories, null, 2)}

Evidence pack (bounded context):
${JSON.stringify(serializedEvidence, null, 2)}

Your goal is to produce a structured bilingual AI news digest.

Editorial guidelines:
- Summaries must be concise and informative and readable in under 30 seconds.
- Select the single most important story as "bigNews".
- Remaining stories become "quickHits".
- Maximum quickHits count: ${maxQuickHits}.
- Preserve the same story order and meaning in FR and EN.
- Titles must be engaging but factual.
- Avoid mentioning any URL in the text; use the source_url field for them.
- Do not invent information not present in the extracted stories.
- Do not repeat identical phrases between sections.
- Use short paragraphs suitable for newsletters.

Output JSON format ONLY:

{
  "tags": ["Tag1", "Tag2"],
  "fr": {
    "title": "string",
    "introduction": "1 to 2 French sentences summarizing the week's AI news",
    "bigNews": {
      "name": "short headline",
      "impact": "max 2 French sentences explaining why this matters now",
      "source_url": "exact URL from the allowed set"
    },
    "quickHits": [
      {
        "topic": "short headline",
        "summary": "max 2 French sentences",
        "source_url": "exact URL from the allowed set"
      }
    ],
    "lookingAhead": "one short French sentence about what this trend suggests for the near future"
  },
  "en": {
    "title": "string",
    "introduction": "1 to 2 English sentences summarizing the week's AI news",
    "bigNews": {
      "name": "short headline",
      "impact": "max 2 English sentences explaining why this matters now",
      "source_url": "exact URL from the allowed set"
    },
    "quickHits": [
      {
        "topic": "short headline",
        "summary": "max 2 English sentences",
        "source_url": "exact URL from the allowed set"
      }
    ],
    "lookingAhead": "one short English sentence about what this trend suggests for the near future"
  }
}
`.trim();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.summaryModel)}:generateContent?key=${encodeURIComponent(googleApiKey)}`;
  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: system }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1800,
      responseMimeType: 'application/json',
    },
  });

  let response: Response | null = null;
  let rawBody = '';

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });

    rawBody = await response.text();

    if (response.ok) {
      break;
    }

    if (GEMINI_RETRYABLE_STATUS.has(response.status) && attempt < GEMINI_MAX_ATTEMPTS) {
      const retryAfterMs = getRetryAfterMs(response) ?? getBackoffMs(attempt) * 3;
      console.warn(
        `weekly-ai-recap-cron: Gemini API returned ${response.status} on attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}, retrying in ${retryAfterMs}ms`,
      );
      await sleep(retryAfterMs);
      continue;
    }

    throw new Error(`Gemini API error ${response.status}: ${rawBody}`);
  }

  if (!response || !response.ok) {
    throw new Error(`Gemini API error: no successful response after ${GEMINI_MAX_ATTEMPTS} attempts`);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates as Array<Record<string, unknown>>
    : [];

  const text = candidates
    .flatMap((candidate) => {
      const content = candidate.content;
      if (!content || typeof content !== 'object') return [];
      const parts = (content as Record<string, unknown>).parts;
      if (!Array.isArray(parts)) return [];
      return parts
        .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : null))
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    })
    .join('\n')
    .trim();

  if (!text) {
    throw new Error(`Empty Gemini output for model ${config.summaryModel}`);
  }

  return parseDraftJson(text, { allowedUrls, maxQuickHits });
}

function evaluateBriefQuality(args: {
  draft: BilingualDraft;
  stories: Story[];
  evidencePack: EvidencePack;
  threshold: number;
}): Omit<BriefQualityReport, 'attempts'> {
  const allowed = new Set(args.stories.map((story) => story.sourceUrl));
  const usedUrls = new Set<string>();

  usedUrls.add(args.draft.fr.bigNews.source_url);
  usedUrls.add(args.draft.en.bigNews.source_url);
  for (const hit of args.draft.fr.quickHits) usedUrls.add(hit.source_url);
  for (const hit of args.draft.en.quickHits) usedUrls.add(hit.source_url);

  const requiredSources = Math.min(Math.max(2, args.stories.length > 0 ? 2 : 1), Math.max(1, args.stories.length));
  const hasNumericSignal = [
    args.draft.fr.bigNews.impact,
    args.draft.en.bigNews.impact,
    ...args.draft.fr.quickHits.map((hit) => hit.summary),
    ...args.draft.en.quickHits.map((hit) => hit.summary),
  ].some((text) => /\d|%|\$|€|£/.test(text));

  const checks: Record<string, boolean> = {
    urls_allowed: [...usedUrls].every((url) => allowed.has(url)),
    source_diversity: usedUrls.size >= requiredSources,
    intro_density:
      args.draft.fr.introduction.trim().length >= 40 &&
      args.draft.en.introduction.trim().length >= 40,
    numeric_signal: hasNumericSignal,
    bilingual_structure:
      args.draft.fr.quickHits.length === args.draft.en.quickHits.length &&
      args.draft.fr.quickHits.length > 0,
    evidence_presence: args.evidencePack.stories.length > 0,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(checks).length) * 100);
  const failures = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { score, threshold: args.threshold, checks, failures };
}

async function generateRecapBriefWithQualityGate(args: {
  stories: Story[];
  editionKey: string;
  config: RecapConfig;
  evidencePack: EvidencePack;
}) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= BRIEF_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      const draft = await generateDraftOnce(args.stories, args.editionKey, args.config, args.evidencePack);
      const quality = evaluateBriefQuality({
        draft,
        stories: args.stories,
        evidencePack: args.evidencePack,
        threshold: args.config.briefQualityThreshold,
      });

      if (quality.score >= args.config.briefQualityThreshold) {
        return {
          draft,
          quality: {
            ...quality,
            attempts: attempt,
          } as BriefQualityReport,
        };
      }

      lastError = new Error(
        `Brief quality score ${quality.score} below threshold ${args.config.briefQualityThreshold}. Failed checks: ${quality.failures.join(', ')}`,
      );
      if (attempt < BRIEF_GENERATION_MAX_ATTEMPTS) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
    } catch (error) {
      lastError = error;
      if (attempt < BRIEF_GENERATION_MAX_ATTEMPTS) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('brief_quality_failed');
}

function parseWebArticleJson(value: string): BilingualWebArticleDraft {
  const payload = parseModelJson(value, 'LLM web article');
  return parseWebArticlePayload(payload);
}

function parseWebArticlePayload(payload: unknown): BilingualWebArticleDraft {
  const parsed = parseWithSchema(webArticleSchema, payload);
  if (!parsed.success) {
    throw new Error(`Invalid LLM web article payload: ${JSON.stringify(parsed.details)}`);
  }
  return parsed.data;
}

function parseWebArticleLocaleJson(value: string): WebLocaleDraft {
  const payload = parseModelJson(value, 'LLM web article locale');
  const parsed = parseWithSchema(webArticleLocaleSchema, payload);
  if (!parsed.success) {
    throw new Error(`Invalid locale web article payload: ${JSON.stringify(parsed.details)}`);
  }
  return parsed.data;
}

function parseWebArticleLocaleXml(value: string): WebLocaleDraft | null {
  const normalized = stripJsonCodeFence(value);
  const titleRaw = getTagValue(normalized, ['title', 'titre']);
  const introRaw = getTagValue(normalized, ['introduction', 'intro']);
  const markdownRaw = getTagValue(normalized, ['article_markdown', 'article-markdown', 'articleMarkdown']);

  if (!titleRaw || !introRaw || !markdownRaw) {
    return null;
  }

  const candidate = {
    title: normalizeText(decodeXmlEntities(stripCdata(titleRaw))),
    introduction: normalizeText(decodeXmlEntities(stripCdata(introRaw))),
    article_markdown: decodeXmlEntities(stripCdata(markdownRaw)).replace(/\r/g, '\n').trim(),
  };

  const parsed = parseWithSchema(webArticleLocaleSchema, candidate);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

function parseWebArticleLocaleFlexible(value: string): WebLocaleDraft {
  try {
    return parseWebArticleLocaleJson(value);
  } catch (jsonError) {
    const xmlPayload = parseWebArticleLocaleXml(value);
    if (xmlPayload) {
      return xmlPayload;
    }

    throw jsonError;
  }
}

function parseSummary30Json(
  value: string,
  allowedUrls: string[],
): Summary30Payload {
  const payload = parseModelJson(value, 'LLM 30-second summary');
  const parsed = parseWithSchema(summary30Schema, payload);
  if (!parsed.success) {
    throw new Error(`Invalid summary30 payload: ${JSON.stringify(parsed.details)}`);
  }

  const allowed = new Set(allowedUrls);
  const validateLocale = (locale: 'fr' | 'en', draft: Summary30Locale) => {
    if (!allowed.has(draft.primary_source_url)) {
      throw new Error(`${locale}.primary_source_url is outside allowed URLs`);
    }
    for (const sourceUrl of draft.source_urls) {
      if (!allowed.has(sourceUrl)) {
        throw new Error(`${locale}.source_urls contains URL outside allowed set`);
      }
    }

    const deduped = Array.from(new Set(draft.bullets.map((line) => line.trim()).filter(Boolean)));
    if (deduped.length === 0) {
      throw new Error(`${locale}.bullets cannot be empty`);
    }
    draft.bullets = deduped.slice(0, 3);
  };

  validateLocale('fr', parsed.data.fr);
  validateLocale('en', parsed.data.en);
  return parsed.data;
}

async function generateSummary30sWithQualityGate(args: {
  editionKey: string;
  stories: Story[];
  article: BilingualWebArticleDraft;
  config: RecapConfig;
}): Promise<{ payload: Summary30Payload; attempts: number }> {
  const googleApiKey = args.config.googleApiKey?.trim();
  if (!googleApiKey) {
    throw new Error('Missing required environment variable: GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY');
  }

  const allowedUrls = Array.from(new Set(args.stories.map((story) => story.sourceUrl)));
  if (allowedUrls.length === 0) {
    throw new Error('summary30s generation requires at least one source URL');
  }

  const sourceContext = args.stories.map((story, index) => ({
    index: index + 1,
    source_url: story.sourceUrl,
    source_name: story.sourceName,
    title: story.title,
    snippet: story.snippet,
  }));

  const systemPrompt = [
    'You are an AI news editor writing an ultra-concise executive summary in French and English.',
    'Output JSON ONLY.',
    'Use factual, clean bullet points. No markdown headings, no links embedded inside bullet text.',
    'Use only URLs from the allowed set.',
  ].join(' ');

  const userPrompt = `
Edition key: ${args.editionKey}
Allowed source URLs:
${allowedUrls.map((url) => `- ${url}`).join('\n')}

Stories used for this edition:
${JSON.stringify(sourceContext, null, 2)}

Article FR intro:
${truncateForPrompt(args.article.fr.introduction, 500)}

Article EN intro:
${truncateForPrompt(args.article.en.introduction, 500)}

Return strict JSON:
{
  "fr": {
    "bullets": ["...", "...", "..."],
    "primary_source_url": "url from allowed set",
    "source_urls": ["url1", "url2"]
  },
  "en": {
    "bullets": ["...", "...", "..."],
    "primary_source_url": "url from allowed set",
    "source_urls": ["url1", "url2"]
  }
}
`.trim();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.config.summaryModel)}:generateContent?key=${encodeURIComponent(googleApiKey)}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= SUMMARY30_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
            responseMimeType: 'application/json',
          },
        }),
      });

      const rawBody = await response.text();
      if (!response.ok) {
        if (GEMINI_RETRYABLE_STATUS.has(response.status) && attempt < SUMMARY30_MAX_ATTEMPTS) {
          await sleep(getRetryAfterMs(response) ?? getBackoffMs(attempt) * 3);
          continue;
        }
        throw new Error(`summary30 Gemini API error ${response.status}: ${rawBody}`);
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        payload = {};
      }

      const candidates = Array.isArray(payload.candidates)
        ? payload.candidates as Array<Record<string, unknown>>
        : [];
      const text = candidates
        .flatMap((candidate) => {
          const content = candidate.content;
          if (!content || typeof content !== 'object') return [];
          const parts = (content as Record<string, unknown>).parts;
          if (!Array.isArray(parts)) return [];
          return parts
            .map((part) => (part && typeof part === 'object' ? (part as Record<string, unknown>).text : null))
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
        })
        .join('\n')
        .trim();

      if (!text) {
        throw new Error('summary30 empty Gemini output');
      }

      return {
        payload: parseSummary30Json(text, allowedUrls),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt < SUMMARY30_MAX_ATTEMPTS) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('summary_30s_failed');
}

function shouldFallbackToTwoPass(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  if (!message) {
    return false;
  }

  return (
    parseAnthropicMaxTokensLimit(error) !== null ||
    /maximum allowed number of output tokens|max_tokens|context length|prompt is too long|input is too long/i.test(
      message,
    ) ||
    /Unexpected end of JSON input|Invalid LLM web article payload|Bad control character in string literal|Invalid LLM web article JSON payload/i.test(message)
  );
}

async function requestAnthropicArticleJson(args: {
  client: Anthropic;
  models: string[];
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
}) {
  let lastError: unknown = null;

  for (const model of args.models) {
    try {
      let maxTokens = args.maxTokens;
      let message: Awaited<ReturnType<typeof args.client.messages.create>> | null = null;
      let rateLimitAttempts = 0;

      while (!message) {
        try {
          message = await args.client.messages.create({
            model,
            max_tokens: maxTokens,
            temperature: 0.2,
            system: args.systemPrompt,
            messages: [{ role: 'user', content: args.userPrompt }],
          });
        } catch (error) {
          const strictLimit = parseAnthropicMaxTokensLimit(error);
          if (strictLimit && strictLimit < maxTokens) {
            console.warn(
              `weekly-ai-recap-cron: lowering max_tokens for ${model} from ${maxTokens} to ${strictLimit}`,
            );
            maxTokens = strictLimit;
            continue;
          }

          if (isAnthropicRateLimitError(error) && rateLimitAttempts < ANTHROPIC_RATE_LIMIT_MAX_ATTEMPTS) {
            rateLimitAttempts += 1;
            const retryAfterMs = extractAnthropicRetryAfterMs(error) ?? getBackoffMs(rateLimitAttempts) * 5;
            console.warn(
              `weekly-ai-recap-cron: Anthropic rate limit hit for ${model}, attempt ${rateLimitAttempts}/${ANTHROPIC_RATE_LIMIT_MAX_ATTEMPTS}, retrying in ${retryAfterMs}ms`,
            );
            await sleep(retryAfterMs);
            continue;
          }

          throw error;
        }
      }

      const text = message.content.find((entry) => entry.type === 'text')?.text ?? '';
      if (!text) {
        throw new Error(`Empty web article LLM output for model ${model}`);
      }
      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to generate full web article');
}

type FactCheckIssue = {
  claim: string;
  severity: 'minor' | 'major';
  reason: string;
  suggestion: string;
};

type FactCheckResult = {
  status: 'pass' | 'warn' | 'fail';
  issues: FactCheckIssue[];
};

async function factCheckArticle(args: {
  sourceContent: string;
  articleFr: string;
  articleEn: string;
  config: RecapConfig;
}): Promise<FactCheckResult> {
  const googleApiKey = args.config.googleApiKey?.trim();
  if (!googleApiKey) {
    throw new Error('fact_check_failed: missing GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY');
  }

  const systemText = [
    'You are a specialized fact-checker for AI news articles.',
    'Compare the article below against the source content.',
    'Identify EVERY number, benchmark, price, date, quote, or technical claim that does not appear in the source or has been distorted.',
    'Do NOT flag editorial analysis, opinions, context added by the author, or general knowledge statements - only verifiable facts that should trace back to the source.',
    'Output JSON ONLY.',
  ].join(' ');

  const userText = `
--- SOURCE CONTENT (ground truth) ---
${truncateForPrompt(args.sourceContent, 12000)}

--- FRENCH ARTICLE TO VERIFY ---
${truncateForPrompt(args.articleFr, 8000)}

--- ENGLISH ARTICLE TO VERIFY ---
${truncateForPrompt(args.articleEn, 8000)}

Respond in JSON ONLY with this exact format:
{
  "issues": [
    {
      "claim": "the specific claim from the article",
      "severity": "minor" or "major",
      "reason": "why this is suspect - e.g. not found in source, number differs",
      "suggestion": "suggested correction or removal"
    }
  ]
}

If everything checks out, return: { "issues": [] }
`.trim();

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.config.summaryModel)}:generateContent?key=${encodeURIComponent(googleApiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    }),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new Error(`fact_check_failed: Gemini API ${response.status}: ${rawBody.slice(0, 500)}`);
  }

  const geminiPayload = JSON.parse(rawBody) as Record<string, unknown>;
  const candidates = geminiPayload.candidates as Array<Record<string, unknown>> | undefined;
  const text = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
  const jsonText = text?.[0]?.text as string | undefined;

  if (!jsonText) {
    throw new Error('fact_check_failed: empty Gemini response');
  }

  const parsed = JSON.parse(jsonText) as { issues?: FactCheckIssue[] };
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];

  const majorCount = issues.filter((i) => i.severity === 'major').length;
  const status: FactCheckResult['status'] = majorCount > 0 ? 'fail' : issues.length > 0 ? 'warn' : 'pass';

  console.log(`weekly-ai-recap-cron: fact-check result: ${status} (${issues.length} issues, ${majorCount} major)`);
  return { status, issues };
}

type DraftBrief = {
  bigNewsName: string;
  bigNewsImpact: string;
  lookingAhead: string;
};

async function generateWebArticle(args: {
  editionKey: string;
  sourceStory: Story;
  sourceContent: string;
  relatedStories: Story[];
  config: RecapConfig;
  dayTheme?: DayTheme | null;
  draftBrief?: DraftBrief | null;
  evidencePack?: EvidencePack;
}) {
  const relatedStoriesContext = args.relatedStories.map((story, index) => ({
    index: index + 1,
    source_url: story.sourceUrl,
    source_name: story.sourceName,
    title: story.title,
    snippet: story.snippet,
  }));
  const evidencePackContext = args.evidencePack
    ? args.evidencePack.stories.map((story, index) => ({
      index: index + 1,
      source_url: story.sourceUrl,
      title: story.title,
      claims: story.claims.slice(0, 6),
      data_points: story.dataPoints,
      quality_score: story.qualityScore,
    }))
    : [];

  const systemPrompt = [
    'You are the lead editor of a premier francophone AI news site.',
    'Produce premium bilingual articles (French + English) with total factual rigor, analytical depth, and editorial quality on par with MIT Technology Review.',
    'Your editorial voice is direct, analytical, and precise. Name specific numbers. Challenge conventional narratives. Never use filler phrases like "it remains to be seen" or "only time will tell". Every sentence must earn its place.',
    'NEVER invent data, citations, or statistics. The final text must remain faithful to the information provided in the source and context.',
    'You are writing ORIGINAL journalism — never copy sentences from the source. Rewrite every fact in your own editorial voice with added analysis and context.',
    'Reply in JSON ONLY in the requested format.',
  ].join(' ');

  const baseEditorialPrompt = `
You are the lead editor of a premier francophone AI news site. Your mission is to produce bilingual articles (French + English) that combine three qualities: (1) total factual rigor, (2) analytical value for non-researcher readers, and (3) premium editorial presentation comparable to the best tech media (MIT Technology Review, The Verge, Wired).

--- SOURCE ---
Source URL: ${args.sourceStory.sourceUrl}
Analyze the entirety of the source content provided below before writing. If it is an academic article, treat it as a primary research paper.

--- ARTICLE STRUCTURE (6-9 sections, adapt to the story) ---
[A] EDITORIAL HEADER
- Category/section (e.g., Research - Jobs - Generative AI)
- Main headline (max 12 words) — choose the most original angle, not the most obvious
- Explanatory subtitle (1-2 sentences) providing immediate context
- Date - Source - Reading level (Beginner / Intermediate / Advanced)
- Executive summary in 3 bullet points ("What to know in 30 seconds")

[B] ARTICLE BODY (6-9 thematic sections)
Each section must follow this pattern:
- Section title (question or strong assertion), numbered: ## 1. Title Here
- 2-3 substantive paragraphs (150-200 words each)
- 1 callout box per section using blockquote format (2-3 sentences max)

Choose the most relevant sections from this pool based on the source content.
A research paper needs methodology/results. A product launch needs features/market impact.
A funding round needs financials/strategy. Do NOT force sections that don't fit.

Section pool:
1. The Problem / The Question
2. The Approach / Methodology
3. Key Results (with mandatory bold data points)
4. What This Changes (vs prior assumptions)
5. Who's Most Affected (demographic/sector breakdown)
6. Real-World Impact (concrete examples)
7. The Surprising Finding (counterintuitive angle)
8. Limitations Worth Knowing
9. What Coverage Missed (under-reported angle)
10. Open Questions (2-3 unresolved)
11. Editorial Analysis (our take, backed by data)

[C] DATA VISUALIZATION BLOCKS (mandatory)
- "Key Figures" table (stat + one-line context each)
- Comparative table "Before vs After" (beliefs vs new data)
- Progress indicators for percentages (ASCII data bars)

[D] EDITORIAL VALUE-ADD (differentiators)
- "What coverage missed" — 1 under-reported angle
- "Questions researchers haven't resolved yet" — 2-3 open questions
- "What this means for you" — 2-3 everyday/society situations affected
- "Express glossary" — define 3-5 technical terms in accessible language

[E] ARTICLE FOOTER
- Editorial rating: Methodological rigor (1-5), Potential impact (1-5), Reading urgency (1-5)
- Next steps to watch
- Thematic links to related topics

--- MARKDOWN FORMAT ---
NUMBERED SECTIONS: Use ## for main sections, numbered sequentially:
  ## 1. Section Title Here
  ## 2. Another Section

DATA HIGHLIGHTS: Bold ALL specific numbers, percentages, and data points:
  **94%** theoretical capacity vs **33%** observed in practice

CALLOUT BOXES: Use blockquotes with emoji prefix for special callouts:
  > 💡 Key insight text here
  > ⚠️ Warning or caveat text here
  > 📊 Data methodology note here

DATA VISUALIZATION: For percentage comparisons, use ASCII progress bars:
  Computer & Math (theoretical) ██████████████████████████████████████░░ **94%**
  Computer & Math (observed)    █████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ **33%**

KEY FIGURES: Use markdown tables for structured data:
  | Metric | Value | Context |
  |--------|-------|---------|
  | Job-finding rate drop | **14%** | Ages 22-25 in exposed roles |

EMPHASIS: Use **bold** for key terms and data. Use bullet points for lists of findings.

--- STYLE EXAMPLE (condensed) ---
## 3. The Deployment Gap: Vast Potential, Limited Reality
The result is a striking gap between what AI could do and what it does. In Computer & Math occupations, **94%** of tasks are theoretically realizable by an LLM. But observed Claude usage covers only **33%** of these tasks.

> 💡 The gap between what AI can do and what it actually does creates a dangerous blind spot: public policy is calibrated to an overstated near-term threat — while potentially underestimating the long-term trajectory.

--- CRITICAL RULES ---
DATA EXTRACTION: Before writing, extract ALL numbers, percentages, dates, and quantitative claims from the source. Every data point found in the source MUST appear in the article in bold. If the source contains fewer than 3 data points, state this limitation explicitly.

COPYRIGHT & ORIGINALITY: You are writing ORIGINAL journalism, not summarizing or paraphrasing.
- NEVER copy sentences or paragraphs from the source, even partially.
- Rewrite every fact in your own editorial voice with added analysis.
- Your article must pass a plagiarism check — no sentence should match the source verbatim beyond common proper nouns or technical terms.
- Add context, comparisons, and implications that the source does not provide.
- Credit the source for its findings but write the article as YOUR analysis.

EDITORIAL RULES:
X Never invent data, citations, or statistics
X Never paraphrase without adding supplementary analysis
X Never use jargon without immediate definition
OK Every paragraph must answer: "So what? What does this change?"
OK Write for someone curious, tech or non-tech — no jargon without explanation, no condescension
OK Tone: serious but direct, never condescending, never sensationalist

--- BILINGUAL FORMAT ---
Produce the French version COMPLETE first, then the English version COMPLETE.
Both versions must be equivalent in depth — not a simple translation.
Adapt cultural references and examples to each linguistic audience.
FR version: formal-accessible register (style Le Monde / Numerama)
EN version: professional direct register (style MIT Tech Review / The Information)

--- TARGET LENGTH ---
French version: 1,200 to 1,800 words
English version: 1,000 to 1,500 words
Total article: 2,500 to 3,500 words (excluding visual blocks)

Additional editorial context:
- Edition key: ${args.editionKey}
- Primary source (URL): ${args.sourceStory.sourceUrl}
- Source title: ${args.sourceStory.title}
- Source publisher: ${args.sourceStory.sourceName}

Other stories this week (for context only, do not dilute the main article):
${JSON.stringify(relatedStoriesContext, null, 2)}

Evidence pack (claims already extracted and bounded):
${JSON.stringify(evidencePackContext, null, 2)}

Extracted source content (cleaned markdown):
${truncateForPrompt(args.sourceContent, args.config.articleSourceCharLimit)}
${args.dayTheme ? `
--- TODAY'S THEME ---
Section: ${args.dayTheme.theme_name_en}
Editorial angle: ${args.dayTheme.theme_description_en}
Focus the article on this thematic angle. The French section name is "${args.dayTheme.theme_name_fr}".
` : ''}${args.draftBrief ? `
--- EDITORIAL BRIEF (preliminary analysis) ---
Selected story: ${args.draftBrief.bigNewsName}
Why it matters: ${args.draftBrief.bigNewsImpact}
Trends this week: ${args.draftBrief.lookingAhead}
Use this editorial brief to guide your angle. The brief was generated from a preliminary analysis of all stories.
` : ''}
`.trim();

  const fullPrompt = `
${baseEditorialPrompt}

Reponds en JSON STRICTEMENT dans ce format:
{
  "fr": {
    "title": "string",
    "introduction": "1-2 phrases d'intro",
    "article_markdown": "article complet FR en markdown"
  },
  "en": {
    "title": "string",
    "introduction": "1-2 sentence intro",
    "article_markdown": "full EN article in markdown"
  }
}
`.trim();

  const frOnlyPrompt = `
${baseEditorialPrompt}

Important: produce ONLY the French version.
Do NOT return the English version.
Do not use markdown code fences.

Reply in STRICT XML with this exact shape:
<article>
  <title>string</title>
  <introduction>1-2 phrases d'intro</introduction>
  <article_markdown>article complet FR en markdown</article_markdown>
</article>
`.trim();

  const enOnlyPrompt = `
${baseEditorialPrompt}

Important: produce ONLY the English version.
Do NOT return the French version.
Do not use markdown code fences.

Reply in STRICT XML with this exact shape:
<article>
  <title>string</title>
  <introduction>1-2 sentence intro</introduction>
  <article_markdown>full EN article in markdown</article_markdown>
</article>
`.trim();

  const client = new Anthropic({
    apiKey: args.config.anthropicApiKey,
    maxRetries: 0,
  });

  const models = [args.config.articleModel, args.config.articleFallbackModel].filter(
    (value, index, list): value is string => !!value && list.indexOf(value) === index,
  );

  try {
    const raw = await requestAnthropicArticleJson({
      client,
      models,
      maxTokens: args.config.articleMaxTokens,
      systemPrompt,
      userPrompt: fullPrompt,
    });
    return parseWebArticleJson(raw);
  } catch (error) {
    if (!shouldFallbackToTwoPass(error)) {
      throw error;
    }
    console.warn('weekly-ai-recap-cron: switching to two-pass web article generation due to token/context limits');
  }

  const frRaw = await requestAnthropicArticleJson({
    client,
    models,
    maxTokens: args.config.articleMaxTokens,
    systemPrompt,
    userPrompt: frOnlyPrompt,
  });
  const enRaw = await requestAnthropicArticleJson({
    client,
    models,
    maxTokens: args.config.articleMaxTokens,
    systemPrompt,
    userPrompt: enOnlyPrompt,
  });

  return parseWebArticlePayload({
    fr: parseWebArticleLocaleFlexible(frRaw),
    en: parseWebArticleLocaleFlexible(enRaw),
  });
}

async function sendFoxRequest(
  config: RecapConfig,
  path: string,
  payload: Record<string, unknown>,
  method: 'POST' | 'GET' = 'POST',
) {
  const baseUrl = `${config.sendFoxBaseUrl}${path}`;

  const requestWithBearer = async () =>
    fetch(baseUrl, {
      method,
      headers: {
        Authorization: `Bearer ${config.sendFoxApiToken}`,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(payload) : undefined,
    });

  const requestWithQueryToken = async () => {
    const url = new URL(baseUrl);
    url.searchParams.set('api_key', config.sendFoxApiToken);
    return fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(payload) : undefined,
    });
  };

  let response = await requestWithBearer();
  if ([401, 403].includes(response.status)) {
    response = await requestWithQueryToken();
  }

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(`SendFox API error ${response.status}: ${text}`);
  }

  return body;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type SendFoxContact = {
  id: number;
  email?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseSendFoxListId(listId: string): number {
  const parsed = Number(listId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid SendFox list id "${listId}"`);
  }
  return parsed;
}

function getRequiredTestSendFoxList(config: RecapConfig): { listId: string; parsedListId: number } {
  const listId = config.sendFoxTestListId?.trim();
  if (!listId) {
    throw new Error('Missing required environment variable: SENDFOX_TEST_LIST_ID (required for test sends)');
  }

  return {
    listId,
    parsedListId: parseSendFoxListId(listId),
  };
}

function parseSendFoxContactId(payload: unknown): number | null {
  const body = asObject(payload);
  if (!body) return null;

  if (typeof body.id === 'number' && Number.isInteger(body.id) && body.id > 0) {
    return body.id;
  }

  const contact = asObject(body.contact);
  if (contact && typeof contact.id === 'number' && Number.isInteger(contact.id) && contact.id > 0) {
    return contact.id;
  }

  return null;
}

function parseSendFoxContact(payload: unknown): SendFoxContact | null {
  const row = asObject(payload);
  if (!row) return null;

  const id =
    typeof row.id === 'number'
      ? row.id
      : typeof row.id === 'string'
        ? Number(row.id)
        : NaN;

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const email = typeof row.email === 'string' ? normalizeEmail(row.email) : undefined;
  return { id, email };
}

function isLikelySendFoxDuplicateContactError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const hasDuplicateStatus =
    message.includes('sendfox api error 400') ||
    message.includes('sendfox api error 409') ||
    message.includes('sendfox api error 422');
  const hasDuplicateHint =
    message.includes('already') ||
    message.includes('taken') ||
    message.includes('exists') ||
    message.includes('duplicate');

  return hasDuplicateStatus && hasDuplicateHint;
}

async function getSendFoxContactByEmail(config: RecapConfig, email: string): Promise<SendFoxContact | null> {
  const normalizedEmail = normalizeEmail(email);
  const encodedEmail = encodeURIComponent(normalizedEmail);
  const payload = await sendFoxRequest(config, `/contacts?email=${encodedEmail}`, {}, 'GET');
  const body = asObject(payload);
  if (!body || !Array.isArray(body.data)) return null;

  const contacts = body.data
    .map((entry) => parseSendFoxContact(entry))
    .filter((entry): entry is SendFoxContact => entry !== null);

  if (contacts.length === 0) return null;
  const exact = contacts.find((entry) => entry.email === normalizedEmail);
  return exact ?? contacts[0] ?? null;
}

async function createSendFoxContact(config: RecapConfig, listId: string, email: string): Promise<number> {
  const parsedListId = parseSendFoxListId(listId);
  const payload = await sendFoxRequest(config, '/contacts', {
    email: normalizeEmail(email),
    lists: [parsedListId],
  });

  const contactId = parseSendFoxContactId(payload);
  if (!contactId) {
    throw new Error('SendFox contact creation returned an invalid response');
  }
  return contactId;
}

async function addSendFoxContactToList(config: RecapConfig, listId: string, contactId: number) {
  await sendFoxRequest(config, `/lists/${listId}/contacts`, {
    contact_id: contactId,
  });
}

async function ensureSendFoxContactInList(config: RecapConfig, listId: string, email: string): Promise<number> {
  const normalizedEmail = normalizeEmail(email);
  let contact = await getSendFoxContactByEmail(config, normalizedEmail);

  if (!contact) {
    try {
      const contactId = await createSendFoxContact(config, listId, normalizedEmail);
      await addSendFoxContactToList(config, listId, contactId);
      return contactId;
    } catch (error) {
      if (!isLikelySendFoxDuplicateContactError(error)) {
        throw error;
      }
      contact = await getSendFoxContactByEmail(config, normalizedEmail);
      if (!contact) {
        throw error;
      }
    }
  }

  await addSendFoxContactToList(config, listId, contact.id);
  return contact.id;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

type AdminRecipient = {
  userId: string;
  email: string | null;
};

async function resolveAdminRecipients(): Promise<AdminRecipient[]> {
  const { data: adminRows, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (error || !adminRows) {
    console.error('Failed to resolve admin recipients:', error);
    return [];
  }

  const recipients: AdminRecipient[] = [];
  for (const row of adminRows) {
    const userId = typeof row.id === 'string' ? row.id : '';
    if (!userId) continue;
    try {
      const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError) {
        console.error(`Failed to load admin user ${userId}:`, userError);
        recipients.push({ userId, email: null });
        continue;
      }
      recipients.push({ userId, email: data.user?.email ?? null });
    } catch (adminError) {
      console.error(`Failed to resolve admin email for ${userId}:`, adminError);
      recipients.push({ userId, email: null });
    }
  }

  return recipients;
}

function buildAdminFailureAlertContent(args: {
  editionKey: string;
  mode: RunMode;
  failureReason: string;
  errorMessage: string;
  config: RecapConfig;
}) {
  const adminPath = '/en/admin/ai-recap';
  const adminUrl = `${args.config.appBaseUrl}${adminPath}`;
  const timestamp = new Date().toISOString();
  const title = 'AI Recap Pipeline Failure / Echec pipeline AI Recap';
  const message =
    `EN: The AI recap pipeline failed.` +
    ` Mode=${args.mode}; Edition=${args.editionKey}; Reason=${args.failureReason}.` +
    ` Error=${args.errorMessage}.` +
    `\nFR: Le pipeline AI recap a echoue.` +
    ` Mode=${args.mode}; Edition=${args.editionKey}; Motif=${args.failureReason}.` +
    ` Erreur=${args.errorMessage}.`;

  const subject = `[ALERT] AI recap failure ${args.editionKey} (${args.mode})`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
      <h2 style="margin-bottom:8px;">AI Recap failure / Echec AI Recap</h2>
      <p style="margin-top:0;color:#4b5563;">Timestamp: ${timestamp}</p>
      <p><strong>Edition:</strong> ${args.editionKey}</p>
      <p><strong>Mode:</strong> ${args.mode}</p>
      <p><strong>Failure reason:</strong> ${args.failureReason}</p>
      <p><strong>Error:</strong> ${args.errorMessage}</p>
      <p><a href="${adminUrl}">Open AI recap admin runs</a></p>
      <hr style="margin:24px 0;border:0;border-top:1px solid #e5e7eb;" />
      <p style="font-size:12px;color:#6b7280;">This is an automated bilingual alert.</p>
    </div>
  `.trim();

  return { adminUrl, title, message, subject, html };
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<string | null> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'KODE01 <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Resend API error (${response.status}): ${raw}`);
  }

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const id = payload.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

async function notifyAdminsOnFailure(args: {
  editionKey: string;
  mode: RunMode;
  failureReason: string;
  errorMessage: string;
  config: RecapConfig;
}) {
  const recipients = await resolveAdminRecipients();
  if (recipients.length === 0) {
    return {
      notified: false,
      recipients: 0,
      sent: 0,
    };
  }

  const content = buildAdminFailureAlertContent(args);
  let sent = 0;

  for (const recipient of recipients) {
    const emailTo = recipient.email;
    const initialStatus = emailTo ? 'pending' : 'failed';

    const { data: created, error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: recipient.userId,
        template_key: 'ai_recap_failure_alert',
        title: content.title,
        message: content.message,
        link: '/admin/ai-recap',
        metadata: {
          edition_key: args.editionKey,
          mode: args.mode,
          failure_reason: args.failureReason,
          error_message: args.errorMessage,
        },
        is_read: false,
        email_to: emailTo,
        email_subject: content.subject,
        email_status: initialStatus,
        email_provider: initialStatus === 'pending' ? 'resend' : 'resend',
        email_error: emailTo ? null : 'Missing admin email',
      })
      .select('id')
      .maybeSingle();

    if (notificationError || !created) {
      console.error(`Failed to insert admin notification for ${recipient.userId}:`, notificationError);
      continue;
    }

    if (!emailTo) {
      continue;
    }

    try {
      const messageId = await sendResendEmail(emailTo, content.subject, content.html);
      sent += 1;
      await supabaseAdmin
        .from('notifications')
        .update({
          email_status: 'sent',
          email_provider: 'resend',
          email_provider_message_id: messageId,
          email_error: null,
          email_sent_at: new Date().toISOString(),
        })
        .eq('id', created.id);
    } catch (emailError) {
      const emailMessage = emailError instanceof Error ? emailError.message : 'Unknown admin alert email error';
      await supabaseAdmin
        .from('notifications')
        .update({
          email_status: 'failed',
          email_provider: 'resend',
          email_error: emailMessage,
        })
        .eq('id', created.id);
    }
  }

  return {
    notified: true,
    recipients: recipients.length,
    sent,
  };
}

function extractNewsletterBullets(contentJson: unknown, fallbackExcerpt: string, locale: 'fr' | 'en') {
  const content = asObject(contentJson);
  const bullets: string[] = [];
  const summary30 = content ? asObject(content.summary30s ?? content.summary_30s) : null;
  const summaryLocale = summary30 ? asObject(summary30[locale]) : null;
  const summaryBulletsRaw = summaryLocale?.bullets;
  if (Array.isArray(summaryBulletsRaw)) {
    for (const item of summaryBulletsRaw) {
      if (bullets.length >= 3) break;
      const normalized = asNonEmptyString(item);
      if (!normalized) continue;
      bullets.push(normalized.slice(0, 280));
    }
  }

  if (bullets.length > 0) {
    return bullets.slice(0, 3);
  }

  const bigNews = content ? asObject(content.bigNews ?? content.big_news) : null;
  const bigNewsName = bigNews ? asNonEmptyString(bigNews.name) : null;
  const bigNewsImpact = bigNews ? asNonEmptyString(bigNews.impact) : null;
  if (bigNewsName || bigNewsImpact) {
    bullets.push(
      [bigNewsName, bigNewsImpact].filter(Boolean).join(': ').slice(0, 280),
    );
  }

  const quickHitsRaw = content?.quickHits ?? content?.quick_hits;
  if (Array.isArray(quickHitsRaw)) {
    for (const hit of quickHitsRaw) {
      if (bullets.length >= 3) break;
      const row = asObject(hit);
      if (!row) continue;
      const topic = asNonEmptyString(row.topic);
      const summary = asNonEmptyString(row.summary);
      if (!topic && !summary) continue;
      bullets.push([topic, summary].filter(Boolean).join(': ').slice(0, 280));
    }
  }

  if (bullets.length === 0) {
    const fallback = asNonEmptyString(fallbackExcerpt);
    if (fallback) {
      bullets.push(fallback.slice(0, 280));
    }
  }

  return bullets.slice(0, 3);
}

function buildNewsletterPayload(options: {
  editionKey: string;
  fr: { title: string; excerpt: string; bullets: string[]; slug: string };
  en: { title: string; excerpt: string; bullets: string[]; slug: string };
  siteUrl: string;
  listId: string;
  fromName: string;
  fromEmail: string;
  sponsoredBlocksHtml?: string[];
}) {
  const frUrl = `${options.siteUrl}/news/${options.fr.slug}`;
  const enUrl = `${options.siteUrl}/news/${options.en.slug}`;
  const parsedListId = parseSendFoxListId(options.listId);
  const subject = `AI Weekly Recap / Le Recap IA - ${options.editionKey}`;
  const renderBulletList = (items: string[]) =>
    items.length > 0
      ? `<ul style="margin:10px 0 24px 20px;padding:0;color:#555555;font-size:16px;line-height:26px;">${items
        .map((item) => `<li style="margin:0 0 8px;">${item}</li>`)
        .join('')}</ul>`
      : '';
  const html = `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background-color:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif;padding:40px 0;">
      <tbody>
        <tr>
          <td align="center">
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background-color:#FFFFFF;margin:0 auto;border-radius:0;border:3px solid #1A1A1A;box-shadow:6px 6px 0 #1A1A1A;overflow:hidden;">
              <tbody>
                <tr>
                  <td>
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#1A1A1A;padding:24px 48px;text-align:center;">
                      <tbody>
                        <tr>
                          <td>
                            <img src="${options.siteUrl}/logo_v2.png" alt="KODE01" width="140" style="display:block;margin:0 auto;height:auto;border:0;outline:none;text-decoration:none;" />
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 48px 32px;">
                      <tbody>
                        <tr>
                          <td>
                            <h1 style="color:#1A1A1A;font-size:28px;font-weight:900;line-height:1.3;text-align:center;margin:0 0 12px;letter-spacing:-0.5px;">AI Weekly Recap</h1>
                            <p style="font-size:16px;line-height:26px;color:#555555;text-align:center;margin:0 0 6px;">${options.en.title}</p>
                            <p style="font-size:16px;line-height:26px;color:#555555;text-align:left;margin:0 0 12px;">${options.en.excerpt}</p>
                            ${renderBulletList(options.en.bullets)}
                            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="text-align:center;margin:0 0 32px;">
                              <tbody>
                                <tr>
                                  <td>
                                    <a href="${enUrl}" style="color:#1A1A1A;text-decoration:none;background-color:#F291C8;font-size:16px;font-weight:800;text-align:center;display:inline-block;padding:14px 28px;border-radius:0;border:2px solid #1A1A1A;box-shadow:3px 3px 0 #1A1A1A;text-transform:uppercase;letter-spacing:0.5px;" target="_blank">Read Full Version</a>
                                  </td>
                                </tr>
                              </tbody>
                            </table>

                            <hr style="width:100%;border:none;border-top:1px solid #E5E5E5;margin:0 0 32px;" />

                            <h1 style="color:#1A1A1A;font-size:28px;font-weight:900;line-height:1.3;text-align:center;margin:0 0 12px;letter-spacing:-0.5px;">Le Recap IA de la semaine</h1>
                            <p style="font-size:16px;line-height:26px;color:#555555;text-align:center;margin:0 0 6px;">${options.fr.title}</p>
                            <p style="font-size:16px;line-height:26px;color:#555555;text-align:left;margin:0 0 12px;">${options.fr.excerpt}</p>
                            ${renderBulletList(options.fr.bullets)}
                            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="text-align:center;margin:0 0 32px;">
                              <tbody>
                                <tr>
                                  <td>
                                    <a href="${frUrl}" style="color:#1A1A1A;text-decoration:none;background-color:#F291C8;font-size:16px;font-weight:800;text-align:center;display:inline-block;padding:14px 28px;border-radius:0;border:2px solid #1A1A1A;box-shadow:3px 3px 0 #1A1A1A;text-transform:uppercase;letter-spacing:0.5px;" target="_blank">Lire la version complete</a>
                                  </td>
                                </tr>
                              </tbody>
                            </table>

                            ${(options.sponsoredBlocksHtml ?? []).join('\n')}

                            <hr style="width:100%;border:none;border-top:1px solid #E5E5E5;margin:0 0 24px;" />
                            <p style="font-size:16px;line-height:24px;color:#1A1A1A;margin:0;">Best, / Cordialement,</p>
                            <p style="font-size:16px;line-height:24px;color:#2B463C;font-weight:700;margin:4px 0 0;">KODE01</p>
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F4F1EA;padding:24px 48px;border-top:2px solid #1A1A1A;">
                      <tbody>
                        <tr>
                          <td>
                            <p style="font-size:13px;line-height:24px;color:#888888;text-align:center;margin:0 0 8px;font-weight:600;">© 2026 KODE01. All rights reserved. / Tous droits reserves.</p>
                            <p style="font-size:12px;line-height:18px;color:#aaaaaa;text-align:center;margin:0 0 8px;">
                              You received this email because you subscribed to KODE01 AI News.
                              <br />
                              Vous avez recu cet e-mail car vous etes inscrit(e) a AI News KODE01.
                            </p>
                            <p style="font-size:12px;line-height:18px;color:#888888;text-align:center;margin:0;">
                              <a href="{{unsubscribe_url}}" style="color:#666666;text-decoration:underline;">Unsubscribe / Se desinscrire</a>
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  `.trim();

  return {
    title: `KODE01 AI recap ${options.editionKey}`,
    subject,
    subject_line: subject,
    from_name: options.fromName,
    from_email: options.fromEmail,
    html,
    body: html,
    list_id: parsedListId,
    list_ids: [parsedListId],
    lists: [parsedListId],
  };
}

function buildSimpleTestNewsletterPayload(options: {
  editionKey: string;
  siteUrl: string;
  listId: string;
  fromName: string;
  fromEmail: string;
}) {
  const subject = `[TEST] KODE01 AI recap ${options.editionKey}`;
  const parsedListId = parseSendFoxListId(options.listId);
  const html = `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation" style="background-color:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif;padding:40px 0;">
      <tbody>
        <tr>
          <td align="center">
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background-color:#FFFFFF;margin:0 auto;border-radius:0;border:3px solid #1A1A1A;box-shadow:6px 6px 0 #1A1A1A;overflow:hidden;">
              <tbody>
                <tr>
                  <td>
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#1A1A1A;padding:24px 48px;text-align:center;">
                      <tbody>
                        <tr>
                          <td>
                            <img src="${options.siteUrl}/logo_v2.png" alt="KODE01" width="140" style="display:block;margin:0 auto;height:auto;border:0;outline:none;text-decoration:none;" />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 48px 32px;">
                      <tbody>
                        <tr>
                          <td>
                            <h1 style="color:#1A1A1A;font-size:28px;font-weight:900;line-height:1.3;text-align:center;margin:0 0 12px;letter-spacing:-0.5px;">TEST - AI News</h1>
                            <p style="font-size:16px;line-height:26px;color:#555555;text-align:center;margin:0 0 24px;">This validates KODE01 AI News delivery. Edition key: ${options.editionKey}</p>
                            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="text-align:center;margin:0 0 24px;">
                              <tbody>
                                <tr>
                                  <td>
                                    <a href="${options.siteUrl}/en/admin/ai-recap" style="color:#1A1A1A;text-decoration:none;background-color:#F291C8;font-size:16px;font-weight:800;text-align:center;display:inline-block;padding:14px 28px;border-radius:0;border:2px solid #1A1A1A;box-shadow:3px 3px 0 #1A1A1A;text-transform:uppercase;letter-spacing:0.5px;" target="_blank">Open AI Recap Admin</a>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            <p style="font-size:12px;line-height:18px;color:#888888;text-align:center;margin:0;">
                              <a href="{{unsubscribe_url}}" style="color:#666666;text-decoration:underline;">Unsubscribe / Se desinscrire</a>
                            </p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  `.trim();

  return {
    title: subject,
    subject,
    subject_line: subject,
    from_name: options.fromName,
    from_email: options.fromEmail,
    html,
    body: html,
    list_id: parsedListId,
    list_ids: [parsedListId],
    lists: [parsedListId],
  };
}

function buildNewsletterTrackingUrl(args: {
  siteUrl: string;
  ad: SponsoredEmailAd;
  sendSlot: NewsletterSendSlot;
  newsletterSlot: 'monthly' | 'weekly';
  servedFromPool: 'monthly' | 'weekly' | 'fallback';
}) {
  const trackingUrl = new URL(`${args.siteUrl}/api/ads/click`);
  trackingUrl.searchParams.set('campaignId', args.ad.campaignId);
  trackingUrl.searchParams.set('creativeId', args.ad.creativeId);
  trackingUrl.searchParams.set('placement', 'newsletter_footer');
  trackingUrl.searchParams.set('channel', 'email');
  trackingUrl.searchParams.set('target', args.ad.destinationUrl);
  trackingUrl.searchParams.set('sendSlot', args.sendSlot);
  trackingUrl.searchParams.set('newsletterSlot', args.newsletterSlot);
  trackingUrl.searchParams.set('servedFromPool', args.servedFromPool);
  return trackingUrl.toString();
}

function renderSponsoredEmailBannerBlock(args: {
  ad: SponsoredEmailAd;
  sendSlot: NewsletterSendSlot;
  newsletterSlot: 'monthly' | 'weekly';
  servedFromPool: 'monthly' | 'weekly' | 'fallback';
  siteUrl: string;
}) {
  const trackingUrl = buildNewsletterTrackingUrl({
    siteUrl: args.siteUrl,
    ad: args.ad,
    sendSlot: args.sendSlot,
    newsletterSlot: args.newsletterSlot,
    servedFromPool: args.servedFromPool,
  });
  const slotLabel = args.newsletterSlot === 'monthly' ? 'Mensuel / Monthly' : 'Hebdo / Weekly';

  return `
    <div style="margin:20px 0 4px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;background:#f9fafb;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">Sponsorise / Sponsored - ${slotLabel}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td style="width:34%;padding-right:12px;vertical-align:middle;">
            <img src="${args.ad.imageUrl}" alt="${args.ad.title}" style="width:100%;height:auto;max-height:92px;object-fit:cover;border-radius:10px;display:block;" />
          </td>
          <td style="vertical-align:middle;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:700;line-height:1.4;color:#111827;">${args.ad.title}</p>
            <a href="${trackingUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:9px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em;">
              ${args.ad.ctaText}
            </a>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function renderNewsletterHouseBlock(args: {
  newsletterSlot: 'monthly' | 'weekly';
  siteUrl: string;
}) {
  const slotLabel = args.newsletterSlot === 'monthly' ? 'Mensuel / Monthly' : 'Hebdo / Weekly';
  return `
    <div style="margin:20px 0 4px;border:1px dashed #d1d5db;border-radius:14px;padding:14px;background:#fff;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">Sponsor Slot Open - ${slotLabel}</p>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.45;color:#374151;">This sponsored spot is available for upcoming editions.</p>
      <a href="${args.siteUrl}/en/advertise" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:9px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em;">
        Become a sponsor
      </a>
    </div>
  `.trim();
}

function pickFromPool(args: {
  pool: SponsoredEmailAd[];
  usedCampaignIds: Set<string>;
  seed: string;
}) {
  const available = args.pool.filter((item) => !args.usedCampaignIds.has(item.campaignId));
  if (available.length === 0) return null;
  const index = hashToIndex(args.seed, available.length);
  return available[index];
}

async function resolveNewsletterFooterAds(params: {
  siteUrl: string;
  editionKey: string;
  sendSlot: NewsletterSendSlot;
}): Promise<NewsletterSlotRender[]> {
  const nowIso = new Date().toISOString();
  const { data: placement } = await supabaseAdmin
    .from('ad_placements')
    .select('id')
    .eq('slug', 'newsletter_footer')
    .eq('is_active', true)
    .maybeSingle();

  if (!placement?.id) {
    return [
      { slot: 'monthly', servedFromPool: 'fallback', ad: null },
      { slot: 'weekly', servedFromPool: 'fallback', ad: null },
    ];
  }

  const { data: links } = await supabaseAdmin
    .from('ad_campaign_placements')
    .select('campaign_id')
    .eq('placement_id', placement.id);

  const campaignIds = (links ?? []).map((entry) => entry.campaign_id as string).filter(Boolean);
  if (campaignIds.length === 0) {
    return [
      { slot: 'monthly', servedFromPool: 'fallback', ad: null },
      { slot: 'weekly', servedFromPool: 'fallback', ad: null },
    ];
  }

  const { data: campaigns } = await supabaseAdmin
    .from('ad_campaigns')
    .select('id, status, is_paid, start_at, end_at, pricing_plan_id, created_at')
    .in('id', campaignIds)
    .in('status', ['approved', 'active'])
    .eq('is_paid', true)
    .order('created_at', { ascending: true });

  const eligibleCampaigns = (campaigns ?? []).filter((item) => {
    if (item.start_at && item.start_at > nowIso) return false;
    if (item.end_at && item.end_at < nowIso) return false;
    return true;
  });
  if (eligibleCampaigns.length === 0) {
    return [
      { slot: 'monthly', servedFromPool: 'fallback', ad: null },
      { slot: 'weekly', servedFromPool: 'fallback', ad: null },
    ];
  }

  const planIds = Array.from(new Set(eligibleCampaigns.map((item) => item.pricing_plan_id as string).filter(Boolean)));
  const { data: plans } = await supabaseAdmin
    .from('ad_pricing_plans')
    .select('id, code')
    .in('id', planIds);
  const planCodeById = new Map<string, string>();
  for (const plan of plans ?? []) {
    planCodeById.set(String(plan.id), String(plan.code));
  }

  const eligibleCampaignIds = eligibleCampaigns.map((item) => String(item.id));
  const { data: creatives } = await supabaseAdmin
    .from('ad_creatives')
    .select('campaign_id, id, title, cta_text, image_url, destination_url')
    .in('campaign_id', eligibleCampaignIds)
    .eq('validation_status', 'approved')
    .order('created_at', { ascending: false });

  const creativeByCampaign = new Map<string, { id: string; title: string; cta_text: string; image_url: string; destination_url: string }>();
  for (const creative of creatives ?? []) {
    const campaignId = String(creative.campaign_id);
    if (!creativeByCampaign.has(campaignId)) {
      creativeByCampaign.set(campaignId, {
        id: String(creative.id),
        title: String(creative.title),
        cta_text: String(creative.cta_text),
        image_url: String(creative.image_url),
        destination_url: String(creative.destination_url),
      });
    }
  }

  const monthlyPool: SponsoredEmailAd[] = [];
  const weeklyPool: SponsoredEmailAd[] = [];
  for (const campaign of eligibleCampaigns) {
    const campaignId = String(campaign.id);
    const creative = creativeByCampaign.get(campaignId);
    if (!creative) continue;

    const planCode = planCodeById.get(String(campaign.pricing_plan_id)) ?? '';
    const poolType: 'monthly' | 'weekly' = planCode === 'ads_30d' ? 'monthly' : 'weekly';
    const item: SponsoredEmailAd = {
      campaignId,
      creativeId: creative.id,
      title: creative.title,
      ctaText: creative.cta_text,
      imageUrl: creative.image_url,
      destinationUrl: creative.destination_url,
      trackingUrl: '',
      poolType,
    };

    if (poolType === 'monthly') {
      monthlyPool.push(item);
    } else {
      weeklyPool.push(item);
    }
  }

  const orderedSlots: Array<'monthly' | 'weekly'> = params.sendSlot === 'A'
    ? ['monthly', 'weekly']
    : ['weekly', 'monthly'];

  const usedCampaignIds = new Set<string>();
  const resolvedSlots: NewsletterSlotRender[] = [];

  for (const slot of orderedSlots) {
    const targetPool = slot === 'monthly' ? monthlyPool : weeklyPool;
    const fallbackPool = slot === 'monthly' ? weeklyPool : monthlyPool;

    const primaryPick = pickFromPool({
      pool: targetPool,
      usedCampaignIds,
      seed: `${params.editionKey}:${params.sendSlot}:${slot}:primary`,
    });

    let servedFromPool: 'monthly' | 'weekly' | 'fallback' = slot;
    let selectedAd = primaryPick;
    if (!selectedAd) {
      selectedAd = pickFromPool({
        pool: fallbackPool,
        usedCampaignIds,
        seed: `${params.editionKey}:${params.sendSlot}:${slot}:fallback`,
      });
      servedFromPool = selectedAd ? 'fallback' : 'fallback';
    }

    if (selectedAd) {
      usedCampaignIds.add(selectedAd.campaignId);
    }

    resolvedSlots.push({
      slot,
      servedFromPool,
      ad: selectedAd,
    });
  }

  // Ensure output always includes monthly then weekly blocks in payload rendering.
  resolvedSlots.sort((a, b) => {
    if (a.slot === b.slot) return 0;
    return a.slot === 'monthly' ? -1 : 1;
  });
  return resolvedSlots;
}

type RecapPostRow = {
  id: string;
  locale: 'fr' | 'en';
  slug: string;
  title: string;
  intro: string;
  excerpt: string | null;
  content_json: unknown;
  content_markdown: string;
};

const MISSING_BILINGUAL_POSTS_ERROR = 'Cannot send newsletter without both FR and EN posts';

function isMissingBilingualPostsError(error: unknown): boolean {
  return error instanceof Error && error.message === MISSING_BILINGUAL_POSTS_ERROR;
}

async function fetchEditionPostsForNewsletter(editionId: string): Promise<{ fr: RecapPostRow; en: RecapPostRow }> {
  const { data: posts, error: postsError } = await supabaseAdmin
    .from('ai_recap_posts')
    .select('id, locale, slug, title, intro, excerpt, content_json, content_markdown')
    .eq('edition_id', editionId)
    .eq('is_published', true);

  if (postsError || !posts) {
    throw new Error(`Unable to fetch posts for newsletter: ${postsError?.message ?? 'not found'}`);
  }

  const fr = (posts as RecapPostRow[]).find((item) => item.locale === 'fr');
  const en = (posts as RecapPostRow[]).find((item) => item.locale === 'en');
  if (!fr || !en) {
    throw new Error(MISSING_BILINGUAL_POSTS_ERROR);
  }

  return { fr, en };
}

function hasReadyArticle(post: RecapPostRow) {
  return post.content_markdown.trim().length >= 500;
}

async function sendNewsletterForEdition(params: {
  editionId: string;
  editionKey: string;
  siteUrl: string;
  config: RecapConfig;
  sendSlot: NewsletterSendSlot;
  testEmail?: string;
  testMode?: boolean;
}) {
  const parsedMainListId = parseSendFoxListId(params.config.sendFoxListId);
  const requiredTestList = params.testMode || params.testEmail ? getRequiredTestSendFoxList(params.config) : null;

  if (params.testMode) {
    if (!requiredTestList) {
      throw new Error('Test mode requires SENDFOX_TEST_LIST_ID');
    }

    const payload = buildSimpleTestNewsletterPayload({
      editionKey: params.editionKey,
      siteUrl: params.siteUrl,
      listId: requiredTestList.listId,
      fromName: params.config.sendFoxFromName,
      fromEmail: params.config.sendFoxFromEmail,
    });
    console.log(`[TestMode] Sending simple TEST newsletter to SendFox list ${requiredTestList.listId}`);

    try {
      if (params.testEmail) {
        await ensureSendFoxContactInList(params.config, requiredTestList.listId, params.testEmail);
      }

      const campaign = await sendFoxRequest(params.config, '/campaigns', payload);
      const campaignId =
        String(campaign.id ?? '') ||
        String((campaign.campaign as Record<string, unknown> | undefined)?.id ?? '');

      if (!campaignId) {
        throw new Error('SendFox campaign id is missing in test mode response');
      }

      await sendFoxRequest(params.config, `/campaigns/${campaignId}/send`, {
        list_id: requiredTestList.parsedListId,
        list_ids: [requiredTestList.parsedListId],
        lists: [requiredTestList.parsedListId],
      });

      console.log(`[TestMode] TEST campaign sent for list ${requiredTestList.listId}, campaignId=${campaignId}`);
      return {
        success: true as const,
        campaignId,
        sponsoredAdCampaignIds: [],
        sendSlot: params.sendSlot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SendFox test error';
      console.error(`[TestMode] Failed to send TEST newsletter: ${message}`);
      return { success: false as const, error: message };
    }
  }

  const sponsoredSlots = await resolveNewsletterFooterAds({
    siteUrl: params.siteUrl,
    editionKey: params.editionKey,
    sendSlot: params.sendSlot,
  });
  const { data: posts, error: postsError } = await supabaseAdmin
    .from('ai_recap_posts')
    .select('locale, slug, title, excerpt, content_json')
    .eq('edition_id', params.editionId)
    .eq('is_published', true);

  if (postsError || !posts) {
    throw new Error(`Unable to fetch posts for newsletter: ${postsError?.message ?? 'not found'}`);
  }

  const fr = posts.find((item) => item.locale === 'fr');
  const en = posts.find((item) => item.locale === 'en');
  if (!fr || !en) {
    throw new Error(MISSING_BILINGUAL_POSTS_ERROR);
  }
  const frBullets = extractNewsletterBullets(fr.content_json, fr.excerpt ?? '', 'fr');
  const enBullets = extractNewsletterBullets(en.content_json, en.excerpt ?? '', 'en');

  const sponsoredBlocksHtml = sponsoredSlots.map((slot) => {
    if (!slot.ad) {
      return renderNewsletterHouseBlock({
        newsletterSlot: slot.slot,
        siteUrl: params.siteUrl,
      });
    }

    return renderSponsoredEmailBannerBlock({
      ad: slot.ad,
      sendSlot: params.sendSlot,
      newsletterSlot: slot.slot,
      servedFromPool: slot.servedFromPool,
      siteUrl: params.siteUrl,
    });
  });

  const isTestSend = Boolean(params.testEmail);
  if (isTestSend && !requiredTestList) {
    throw new Error('Test send requires SENDFOX_TEST_LIST_ID');
  }
  const listIdForPayload = isTestSend ? requiredTestList!.listId : params.config.sendFoxListId;

  const payload = buildNewsletterPayload({
    editionKey: params.editionKey,
    fr: {
      title: fr.title,
      excerpt: fr.excerpt ?? '',
      bullets: frBullets,
      slug: fr.slug,
    },
    en: {
      title: en.title,
      excerpt: en.excerpt ?? '',
      bullets: enBullets,
      slug: en.slug,
    },
    siteUrl: params.siteUrl,
    listId: listIdForPayload,
    fromName: params.config.sendFoxFromName,
    fromEmail: params.config.sendFoxFromEmail,
    sponsoredBlocksHtml,
  });

  if (isTestSend) {
    const testList = requiredTestList!;
    console.log(`[TestMode] Sending newsletter to SendFox list ${testList.listId}`);
    try {
      if (params.testEmail) {
        await ensureSendFoxContactInList(params.config, testList.listId, params.testEmail);
      }

      const campaign = await sendFoxRequest(params.config, '/campaigns', {
        ...payload,
        title: `[TEST] ${payload.title}`,
      });
      const campaignId =
        String(campaign.id ?? '') ||
        String((campaign.campaign as Record<string, unknown> | undefined)?.id ?? '');

      if (!campaignId) {
        throw new Error('SendFox campaign id is missing in test mode response');
      }

      await sendFoxRequest(params.config, `/campaigns/${campaignId}/send`, {
        list_id: testList.parsedListId,
        list_ids: [testList.parsedListId],
        lists: [testList.parsedListId],
      });

      console.log(`[TestMode] SendFox campaign sent for list ${testList.listId}, campaignId=${campaignId}`);
      return {
        success: true as const,
        campaignId,
        sponsoredAdCampaignIds: [],
        sendSlot: params.sendSlot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SendFox test error';
      console.error(`[TestMode] Failed to send test newsletter: ${message}`);
      return { success: false as const, error: message };
    }
  }

  await supabaseAdmin.from('ai_recap_newsletter_dispatches').upsert(
    {
      edition_id: params.editionId,
      provider: 'sendfox',
      status: 'pending',
      payload_json: payload,
      error_message: null,
      sent_at: null,
    },
    { onConflict: 'edition_id,provider' },
  );

  try {
    const campaign = await sendFoxRequest(params.config, '/campaigns', payload);
    const campaignId =
      String(campaign.id ?? '') ||
      String((campaign.campaign as Record<string, unknown> | undefined)?.id ?? '');

    if (campaignId) {
      await sendFoxRequest(params.config, `/campaigns/${campaignId}/send`, {
        list_id: parsedMainListId,
        list_ids: [parsedMainListId],
        lists: [parsedMainListId],
      });
    }

    await supabaseAdmin
      .from('ai_recap_newsletter_dispatches')
      .update({
        sendfox_campaign_id: campaignId || null,
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('edition_id', params.editionId)
      .eq('provider', 'sendfox');

    const deliveredEvents = sponsoredSlots
      .filter((slot) => Boolean(slot.ad))
      .map((slot) => ({
        campaign_id: slot.ad?.campaignId as string,
        creative_id: slot.ad?.creativeId as string,
        placement_id: null,
        event_type: 'email_delivered',
        channel: 'email',
        quantity: 1,
        metadata: {
          provider: 'sendfox',
          edition_id: params.editionId,
          edition_key: params.editionKey,
          sendfox_campaign_id: campaignId || null,
          send_slot: params.sendSlot,
          newsletter_slot: slot.slot,
          served_from_pool: slot.servedFromPool,
        },
      }));

    if (deliveredEvents.length > 0) {
      await supabaseAdmin.from('ad_events').insert(deliveredEvents);
    }

    return {
      success: true as const,
      campaignId: campaignId || null,
      sponsoredAdCampaignIds: sponsoredSlots
        .filter((slot) => Boolean(slot.ad))
        .map((slot) => slot.ad?.campaignId as string),
      sendSlot: params.sendSlot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SendFox error';
    await supabaseAdmin
      .from('ai_recap_newsletter_dispatches')
      .update({
        status: 'failed',
        error_message: message,
      })
      .eq('edition_id', params.editionId)
      .eq('provider', 'sendfox');
    return { success: false as const, error: message };
  }
}

async function createRun(editionKey: string, triggerType: 'cron' | 'manual' | 'retry', mode: RunMode) {
  const normalizedEditionKey = normalizeEditionKey(editionKey);
  const { data: existingRunning } = await supabaseAdmin
    .from('ai_recap_runs')
    .select('id, attempt')
    .eq('edition_key', normalizedEditionKey)
    .eq('trigger_type', triggerType)
    .eq('mode', mode)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRunning) {
    return existingRunning;
  }

  const { data: latestRun } = await supabaseAdmin
    .from('ai_recap_runs')
    .select('attempt')
    .eq('edition_key', normalizedEditionKey)
    .order('attempt', { ascending: false })
    .limit(1)
    .maybeSingle();

  const attempt = (latestRun?.attempt ?? 0) + 1;
  const { data: run, error } = await supabaseAdmin
    .from('ai_recap_runs')
    .insert({
      edition_key: normalizedEditionKey,
      trigger_type: triggerType,
      mode,
      attempt,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id, attempt')
    .single();

  if (error || !run) {
    const duplicateViolation = error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate');
    if (duplicateViolation) {
      const { data: activeRun } = await supabaseAdmin
        .from('ai_recap_runs')
        .select('id, attempt')
        .eq('edition_key', normalizedEditionKey)
        .eq('trigger_type', triggerType)
        .eq('mode', mode)
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeRun) {
        return activeRun;
      }
    }
    throw new Error(`Unable to create ai recap run: ${error?.message ?? 'unknown error'}`);
  }

  return run;
}

async function markRun(
  runId: string,
  status: 'succeeded' | 'partial' | 'failed' | 'skipped',
  metrics: Record<string, unknown>,
  errorMessage?: string,
  failureReason?: string,
) {
  await supabaseAdmin
    .from('ai_recap_runs')
    .update({
      status,
      metrics_json: metrics,
      error_message: errorMessage ?? null,
      failure_reason: failureReason ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

async function ensureEdition(editionKey: string, runId: string, weekStart: string, weekEnd: string) {
  const { data: existing } = await supabaseAdmin
    .from('ai_recap_editions')
    .select('id, status, edition_key')
    .eq('edition_key', editionKey)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('ai_recap_editions')
      .update({
        run_id: runId,
        status: existing.status === 'published' ? 'published' : 'draft',
      })
      .eq('id', existing.id);

    return existing;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('ai_recap_editions')
    .insert({
      edition_key: editionKey,
      run_id: runId,
      status: 'draft',
      week_start: weekStart,
      week_end: weekEnd,
    })
    .select('id, status, edition_key')
    .single();

  if (error || !inserted) {
    throw new Error(`Unable to create edition ${editionKey}: ${error?.message ?? 'unknown error'}`);
  }

  return inserted;
}

async function collectStoriesForRun(runId: string, config: RecapConfig, dayTheme?: DayTheme | null) {
  const sourceSelect =
    'id, name, url, feed_url, scrape_route, rss_allow_firecrawl_fallback, domain, priority, is_active, locale_hint';

  let query = supabaseAdmin
    .from('ai_recap_sources')
    .select(sourceSelect)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(config.maxSources);

  // If day theme has specific source_ids, filter by them
  if (dayTheme && dayTheme.source_ids.length > 0) {
    query = query.in('id', dayTheme.source_ids);
  }

  const { data: sourceData, error: sourceError } = await query;

  if (sourceError) {
    throw new Error(`Unable to load ai recap sources: ${sourceError.message}`);
  }

  const sourceRows = (sourceData ?? []) as SourceRow[];
  if (sourceRows.length === 0) {
    throw new Error('No active ai recap sources configured');
  }

  const docs: ScrapedDocument[] = [];
  const failedSourceIds = new Set<string>();

  for (const source of sourceRows) {
    try {
      const scrape = await scrapeSource(source, config);
      await persistDocument(runId, source, scrape);

      docs.push({
        source,
        sourceUrl: scrape.sourceUrl,
        rawMarkdown: scrape.rawMarkdown,
        cleanedText: scrape.cleanedText,
        status: scrape.status,
        scrapeOk: scrape.scrapeOk,
        title: scrape.title,
        snippet: scrape.snippet,
        scrapeMethod: scrape.scrapeMethod,
      });
      if (!scrape.scrapeOk && !scrape.isDuplicate) {
        failedSourceIds.add(source.id);
      }

      const successfulScrapes = docs.filter((doc) => doc.scrapeOk).length;
      if (successfulScrapes >= config.targetSuccessfulScrapes) {
        break;
      }
    } catch (error) {
      failedSourceIds.add(source.id);
      await persistDocument(runId, source, {
        sourceUrl: source.url,
        status: 500,
        rawMarkdown: '',
        cleanedText: '',
        scrapeOk: false,
        scrapeMethod: 'firecrawl',
      });
      console.error(`Failed scraping source ${source.url}:`, error);
    }
  }

  let stories = pickStories(docs);

  if (stories.length === 0) {
    const retrySources = sourceRows.filter((source) => failedSourceIds.has(source.id));
    for (const source of retrySources) {
      try {
        const scrape = await scrapeSource(source, config);
        await persistDocument(runId, source, scrape);
        if (scrape.scrapeOk) {
          failedSourceIds.delete(source.id);
          docs.push({
            source,
            sourceUrl: scrape.sourceUrl,
            rawMarkdown: scrape.rawMarkdown,
            cleanedText: scrape.cleanedText,
            status: scrape.status,
            scrapeOk: scrape.scrapeOk,
            title: scrape.title,
            snippet: scrape.snippet,
            scrapeMethod: scrape.scrapeMethod,
          });
        }
      } catch (error) {
        console.error(`Extended recrawl failed for source ${source.url}:`, error);
      }
    }
    stories = pickStories(docs);
  }

  return {
    sourceRows,
    docs,
    failedSourceIds,
    stories,
  };
}

function buildScrapeMethodsBreakdown(docs: ScrapedDocument[]) {
  const breakdown: Record<string, number> = {};
  for (const doc of docs) {
    const method = doc.scrapeMethod || 'unknown';
    breakdown[method] = (breakdown[method] ?? 0) + 1;
  }
  return breakdown;
}

function hasSummary30Locale(contentJson: unknown, locale: 'fr' | 'en') {
  const content = asObject(contentJson);
  if (!content) return false;

  const summary30 = asObject(content.summary30s ?? content.summary_30s);
  if (!summary30) return false;

  const summaryLocale = asObject(summary30[locale]);
  if (!summaryLocale) return false;

  const bullets = summaryLocale.bullets;
  return Array.isArray(bullets) && bullets.length > 0;
}

function buildSourceManifest(args: {
  primarySourceUrl: string;
  targetStories: Story[];
  summary30: Summary30Payload;
  docs: ScrapedDocument[];
  allowedSourceUrls: string[];
}) {
  const usedSourceUrls = Array.from(
    new Set([
      args.primarySourceUrl,
      ...args.targetStories.map((story) => story.sourceUrl),
      args.summary30.fr.primary_source_url,
      args.summary30.en.primary_source_url,
      ...args.summary30.fr.source_urls,
      ...args.summary30.en.source_urls,
    ].filter(Boolean)),
  );

  return {
    primary_source_url: args.primarySourceUrl,
    used_source_urls: usedSourceUrls,
    allowed_source_urls: Array.from(new Set(args.allowedSourceUrls)),
    scrape_methods_breakdown: buildScrapeMethodsBreakdown(args.docs),
    generated_at: new Date().toISOString(),
    generated_by: 'weekly-ai-recap-cron',
  };
}

async function dispatchNewsletterAfterPublication(args: {
  editionId: string;
  editionKey: string;
  trigger: 'cron' | 'manual' | 'retry';
  force: boolean;
  schedule: RecapSchedule;
  config: RecapConfig;
}) {
  if (args.trigger === 'manual' && !args.force) {
    return { status: 'skipped' as const, reason: 'manual_build_no_auto_dispatch' };
  }

  const { data: existingDispatch } = await supabaseAdmin
    .from('ai_recap_newsletter_dispatches')
    .select('status, sent_at')
    .eq('edition_id', args.editionId)
    .eq('provider', 'sendfox')
    .eq('status', 'sent')
    .maybeSingle();

  if (existingDispatch) {
    return { status: 'skipped' as const, reason: 'newsletter_already_sent' };
  }

  const posts = await fetchEditionPostsForNewsletter(args.editionId);
  if (!hasReadyArticle(posts.fr) || !hasReadyArticle(posts.en)) {
    return { status: 'failed' as const, reason: 'article_not_ready', error: 'Article is not ready for newsletter dispatch' };
  }

  if (!hasSummary30Locale(posts.fr.content_json, 'fr') || !hasSummary30Locale(posts.en.content_json, 'en')) {
    return { status: 'failed' as const, reason: 'summary30_missing', error: 'summary30s is missing from published posts' };
  }

  const sendSlot = resolveNewsletterSendSlot(args.schedule, args.editionKey);
  const newsletter = await sendNewsletterForEdition({
    editionId: args.editionId,
    editionKey: args.editionKey,
    siteUrl: args.config.appBaseUrl,
    config: args.config,
    sendSlot,
  });

  if (!newsletter.success) {
    return {
      status: 'failed' as const,
      reason: 'newsletter_send_failed',
      error: newsletter.error ?? 'Unknown newsletter send error',
      sendSlot,
    };
  }

  return {
    status: 'sent' as const,
    reason: 'newsletter_sent',
    campaignId: newsletter.campaignId ?? null,
    sendSlot,
  };
}

async function buildArticlePipeline(payload: {
  trigger: 'cron' | 'manual' | 'retry';
  force: boolean;
  editionKey?: string;
}) {
  const config = getConfig();
  const schedule = await getSchedule(config);
  const now = new Date();
  const editionKey = payload.editionKey ? normalizeEditionKey(payload.editionKey) : getEditionKey(now, schedule.timezone);
  const run = await createRun(editionKey, payload.trigger, 'build_article');
  const { weekStart, weekEnd } = getWeekBounds(now, schedule.timezone);
  const edition = await ensureEdition(editionKey, run.id, weekStart, weekEnd);

  try {
    // Load day theme for today's weekday
    const weekdayIndex = getLocalWeekdayIndex(now, schedule.timezone);
    const dayTheme = await getDayTheme(weekdayIndex);
    const isWeekdayRun = weekdayIndex >= 1 && weekdayIndex <= 5;
    if (isWeekdayRun && (!dayTheme || !dayTheme.is_active || dayTheme.source_ids.length === 0)) {
      const message = 'Day theme configuration is missing or has no source_ids for this weekday';
      await supabaseAdmin
        .from('ai_recap_editions')
        .update({ status: 'failed', run_id: run.id })
        .eq('id', edition.id);

      await notifyAdminsOnFailure({
        editionKey,
        mode: 'build_article',
        failureReason: 'day_theme_missing',
        errorMessage: message,
        config,
      });

      await markRun(
        run.id,
        'failed',
        {
          mode: 'build_article',
          editionKey,
          article_ready: false,
        },
        message,
        'day_theme_missing',
      );

      return json(
        {
          runId: run.id,
          editionId: edition.id,
          editionKey,
          status: 'failed',
          reason: 'day_theme_missing',
          error: message,
        },
        500,
      );
    }

    const collected = await collectStoriesForRun(run.id, config, dayTheme);
    const { sourceRows, docs, failedSourceIds, stories } = collected;
    const scrapeMethodsBreakdown = buildScrapeMethodsBreakdown(docs);
    const successfulScrapes = docs.filter((doc) => doc.scrapeOk).length;

    // Skip if quiet day: theme says skip and total content is too thin
    if (dayTheme?.skip_if_quiet && stories.length > 0) {
      const totalCleanedWords = docs
        .filter((doc) => doc.scrapeOk)
        .reduce((sum, doc) => sum + doc.cleanedText.split(/\s+/).length, 0);

      if (totalCleanedWords < 500) {
        console.log(`weekly-ai-recap-cron: skipping quiet day (${totalCleanedWords} words, theme: ${dayTheme.theme_key})`);
        await markRun(run.id, 'skipped', {
          mode: 'build_article',
          editionKey,
          reason: 'quiet_day',
          totalWords: totalCleanedWords,
          theme: dayTheme.theme_key,
          scrape_methods_breakdown: scrapeMethodsBreakdown,
        });
        return json({ runId: run.id, editionKey, status: 'skipped', reason: 'quiet_day' });
      }
    }

    if (stories.length === 0) {
      const failMessage = 'No reliable stories after scrape and recrawl';
      await supabaseAdmin
        .from('ai_recap_editions')
        .update({ status: 'failed', run_id: run.id })
        .eq('id', edition.id);

      await notifyAdminsOnFailure({
        editionKey,
        mode: 'build_article',
        failureReason: 'no_reliable_stories',
        errorMessage: failMessage,
        config,
      });

      await markRun(
        run.id,
        'failed',
        {
          mode: 'build_article',
          editionKey,
          sourcesConfigured: sourceRows.length,
          sourcesScraped: successfulScrapes,
          sourcesFailed: failedSourceIds.size,
          scrape_methods_breakdown: scrapeMethodsBreakdown,
          article_ready: false,
        },
        failMessage,
        'no_reliable_stories',
      );

      return json({
        runId: run.id,
        editionId: edition.id,
        editionKey,
        status: 'failed',
        reason: 'no_reliable_stories',
      }, 500);
    }

    const targetStories = stories.slice(0, 4);
    const evidencePack = buildEvidencePack({
      stories: targetStories,
      docs,
      config,
    });
    const packTruncationStats = {
      total_chars: evidencePack.totalChars,
      max_chars: config.evidencePackMaxChars,
      truncated_stories: evidencePack.truncatedStories,
      total_stories: evidencePack.stories.length,
    };

    let draft: BilingualDraft;
    let briefQuality: BriefQualityReport;
    try {
      const recapBrief = await generateRecapBriefWithQualityGate({
        stories: targetStories,
        editionKey,
        config,
        evidencePack,
      });
      draft = recapBrief.draft;
      briefQuality = recapBrief.quality;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'brief_quality_failed';
      const qualityReport = {
        generated_at: new Date().toISOString(),
        generated_by: 'weekly-ai-recap-cron',
        stage: 'brief_quality',
        status: 'failed',
        error: message,
        evidence_pack: {
          story_count: evidencePack.stories.length,
          source_urls: evidencePack.sourceUrls,
          token_estimate: evidencePack.tokenEstimate,
          truncation: packTruncationStats,
        },
      };

      await supabaseAdmin
        .from('ai_recap_editions')
        .update({
          status: 'failed',
          run_id: run.id,
          quality_report: qualityReport,
        })
        .eq('id', edition.id);

      await notifyAdminsOnFailure({
        editionKey,
        mode: 'build_article',
        failureReason: 'brief_quality_failed',
        errorMessage: message,
        config,
      });

      await markRun(
        run.id,
        'failed',
        {
          mode: 'build_article',
          editionKey,
          sourcesConfigured: sourceRows.length,
          sourcesScraped: successfulScrapes,
          sourcesFailed: failedSourceIds.size,
          scrape_methods_breakdown: scrapeMethodsBreakdown,
          brief_quality_score: null,
          brief_attempts: BRIEF_GENERATION_MAX_ATTEMPTS,
          token_usage_estimate: evidencePack.tokenEstimate,
          pack_truncation_stats: packTruncationStats,
          article_ready: false,
        },
        message,
        'brief_quality_failed',
      );

      return json(
        {
          runId: run.id,
          editionId: edition.id,
          editionKey,
          status: 'failed',
          reason: 'brief_quality_failed',
          error: message,
        },
        500,
      );
    }

    const storyByUrl = new Map(targetStories.map((story) => [story.sourceUrl, story]));
    const fallbackPrimaryStory = targetStories[0];
    const bigStory =
      storyByUrl.get(draft.en.bigNews.source_url) ??
      storyByUrl.get(draft.fr.bigNews.source_url) ??
      fallbackPrimaryStory;

    const quickStoryUrls = [
      ...draft.en.quickHits.map((hit) => hit.source_url),
      ...draft.fr.quickHits.map((hit) => hit.source_url),
    ];
    const quickStories: Story[] = [];
    for (const sourceUrl of quickStoryUrls) {
      const story = storyByUrl.get(sourceUrl);
      if (!story) continue;
      if (story.sourceUrl === bigStory.sourceUrl) continue;
      if (quickStories.some((row) => row.sourceUrl === story.sourceUrl)) continue;
      quickStories.push(story);
      if (quickStories.length >= 3) break;
    }
    if (quickStories.length === 0) {
      for (const story of targetStories) {
        if (story.sourceUrl === bigStory.sourceUrl) continue;
        quickStories.push(story);
        if (quickStories.length >= 3) break;
      }
    }
    const selectedStories = [bigStory, ...quickStories];

    const primaryStoryDoc =
      docs.find((doc) => doc.scrapeOk && doc.sourceUrl === bigStory.sourceUrl) ??
      docs.find((doc) => doc.scrapeOk && doc.source.id === bigStory.sourceId) ??
      null;

    const sourceContentForArticle = primaryStoryDoc?.cleanedText || `${bigStory.title}\n\n${bigStory.snippet}`;
    const draftBrief: DraftBrief = {
      bigNewsName: draft.en.bigNews.name,
      bigNewsImpact: draft.en.bigNews.impact,
      lookingAhead: draft.en.lookingAhead,
    };

    const webDraft = await generateWebArticle({
      editionKey,
      sourceStory: bigStory,
      sourceContent: sourceContentForArticle,
      relatedStories: selectedStories,
      config,
      dayTheme,
      draftBrief,
      evidencePack,
    });

    // Fact-check the generated article against source content
    const factCheckSource = evidencePack.stories
      .map((story, index) =>
        `Source ${index + 1}: ${story.sourceUrl}\nTitle: ${story.title}\nClaims:\n- ${story.claims.join('\n- ')}`.trim()
      )
      .join('\n\n');
    const factCheckResult = await factCheckArticle({
      sourceContent: factCheckSource || sourceContentForArticle,
      articleFr: webDraft.fr.article_markdown,
      articleEn: webDraft.en.article_markdown,
      config,
    });

    if (factCheckResult.status !== 'pass') {
      await supabaseAdmin
        .from('ai_recap_editions')
        .update({
          status: 'failed',
          run_id: run.id,
          fact_check_result: factCheckResult,
          quality_report: {
            generated_at: new Date().toISOString(),
            generated_by: 'weekly-ai-recap-cron',
            stage: 'fact_check',
            status: 'failed',
            brief_quality: briefQuality,
            fact_check: {
              status: factCheckResult.status,
              issues: factCheckResult.issues,
              issues_count: factCheckResult.issues.length,
            },
          },
        })
        .eq('id', edition.id);

      const message = `Fact-check blocked publication with status "${factCheckResult.status}"`;
      await notifyAdminsOnFailure({
        editionKey,
        mode: 'build_article',
        failureReason: 'fact_check_failed',
        errorMessage: message,
        config,
      });
      await markRun(
        run.id,
        'failed',
        {
          mode: 'build_article',
          editionKey,
          sourcesConfigured: sourceRows.length,
          sourcesScraped: successfulScrapes,
          sourcesFailed: failedSourceIds.size,
          scrape_methods_breakdown: scrapeMethodsBreakdown,
          brief_quality_score: briefQuality.score,
          brief_attempts: briefQuality.attempts,
          fact_check_status: factCheckResult.status,
          fact_check_issues: factCheckResult.issues.length,
          fact_check_issues_detail: factCheckResult.issues,
          token_usage_estimate: evidencePack.tokenEstimate,
          pack_truncation_stats: packTruncationStats,
          article_ready: false,
        },
        message,
        'fact_check_failed',
      );

      return json(
        {
          runId: run.id,
          editionId: edition.id,
          editionKey,
          status: 'failed',
          reason: 'fact_check_failed',
          error: message,
          factCheck: factCheckResult,
        },
        409,
      );
    }

    let summary30Payload: Summary30Payload;
    let summary30Attempts = 0;
    try {
      const summaryResult = await generateSummary30sWithQualityGate({
        editionKey,
        stories: selectedStories,
        article: webDraft,
        config,
      });
      summary30Payload = summaryResult.payload;
      summary30Attempts = summaryResult.attempts;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'summary_30s_failed';
      await supabaseAdmin
        .from('ai_recap_editions')
        .update({
          status: 'failed',
          run_id: run.id,
          fact_check_result: factCheckResult,
          quality_report: {
            generated_at: new Date().toISOString(),
            generated_by: 'weekly-ai-recap-cron',
            stage: 'summary30s',
            status: 'failed',
            brief_quality: briefQuality,
            fact_check: {
              status: factCheckResult.status,
              issues: factCheckResult.issues,
              issues_count: factCheckResult.issues.length,
            },
            summary30s: {
              status: 'failed',
              attempts: SUMMARY30_MAX_ATTEMPTS,
              error: message,
            },
          },
        })
        .eq('id', edition.id);

      await notifyAdminsOnFailure({
        editionKey,
        mode: 'build_article',
        failureReason: 'summary_30s_failed',
        errorMessage: message,
        config,
      });

      await markRun(
        run.id,
        'failed',
        {
          mode: 'build_article',
          editionKey,
          sourcesConfigured: sourceRows.length,
          sourcesScraped: successfulScrapes,
          sourcesFailed: failedSourceIds.size,
          scrape_methods_breakdown: scrapeMethodsBreakdown,
          brief_quality_score: briefQuality.score,
          brief_attempts: briefQuality.attempts,
          fact_check_status: factCheckResult.status,
          fact_check_issues: factCheckResult.issues.length,
          fact_check_issues_detail: factCheckResult.issues,
          summary30s_status: 'failed',
          summary30s_attempts: SUMMARY30_MAX_ATTEMPTS,
          token_usage_estimate: evidencePack.tokenEstimate,
          pack_truncation_stats: packTruncationStats,
          article_ready: false,
        },
        message,
        'summary_30s_failed',
      );

      return json(
        {
          runId: run.id,
          editionId: edition.id,
          editionKey,
          status: 'failed',
          reason: 'summary_30s_failed',
          error: message,
        },
        500,
      );
    }

    const frTitle = webDraft.fr.title.trim() || bigStory.title;
    const enTitle = webDraft.en.title.trim() || bigStory.title;
    const frIntro = webDraft.fr.introduction.trim() || bigStory.snippet;
    const enIntro = webDraft.en.introduction.trim() || bigStory.snippet;
    const frMarkdown = webDraft.fr.article_markdown.trim();
    const enMarkdown = webDraft.en.article_markdown.trim();
    const sourceStories = selectedStories.map((story, index) => ({
      rank: index + 1,
      source_id: story.sourceId,
      source_url: story.sourceUrl,
      source_name: story.sourceName,
      title: story.title,
      snippet: story.snippet,
    }));
    const nowIso = new Date().toISOString();
    const summary30WithMeta = {
      ...summary30Payload,
      generated_at: nowIso,
      generated_by: config.summaryModel,
    };
    const sourceManifest = buildSourceManifest({
      primarySourceUrl: bigStory.sourceUrl,
      targetStories: selectedStories,
      summary30: summary30Payload,
      docs,
      allowedSourceUrls: targetStories.map((story) => story.sourceUrl),
    });
    const tags = Array.from(new Set(draft.tags)).slice(0, 3);

    const frContentJson = {
      title: frTitle,
      introduction: frIntro,
      bigNews: {
        name: draft.fr.bigNews.name || bigStory.title,
        impact: draft.fr.bigNews.impact || bigStory.snippet || frIntro,
        source_url: draft.fr.bigNews.source_url || bigStory.sourceUrl,
      },
      quickHits: draft.fr.quickHits,
      lookingAhead: draft.fr.lookingAhead,
      tags,
      summary30s: summary30WithMeta,
      source_manifest: sourceManifest,
      sourceStories,
    };

    const enContentJson = {
      title: enTitle,
      introduction: enIntro,
      bigNews: {
        name: draft.en.bigNews.name || bigStory.title,
        impact: draft.en.bigNews.impact || bigStory.snippet || enIntro,
        source_url: draft.en.bigNews.source_url || bigStory.sourceUrl,
      },
      quickHits: draft.en.quickHits,
      lookingAhead: draft.en.lookingAhead,
      tags,
      summary30s: summary30WithMeta,
      source_manifest: sourceManifest,
      sourceStories,
    };

    const editionSlugToken = slugify(editionKey) || run.id.slice(0, 8);
    const frSlug = `recap-ia-${editionSlugToken}`;
    const enSlug = `ai-weekly-recap-${editionSlugToken}`;

    const { data: posts, error: postsError } = await supabaseAdmin
      .from('ai_recap_posts')
      .upsert(
        [
          {
            edition_id: edition.id,
            locale: 'fr',
            slug: frSlug,
            title: frTitle,
            intro: frIntro,
            excerpt: buildExcerpt({ introduction: frIntro, articleMarkdown: frMarkdown, fallback: bigStory.snippet }),
            content_json: frContentJson,
            content_markdown: frMarkdown,
            tags,
            is_published: true,
            published_at: nowIso,
          },
          {
            edition_id: edition.id,
            locale: 'en',
            slug: enSlug,
            title: enTitle,
            intro: enIntro,
            excerpt: buildExcerpt({ introduction: enIntro, articleMarkdown: enMarkdown, fallback: bigStory.snippet }),
            content_json: enContentJson,
            content_markdown: enMarkdown,
            tags,
            is_published: true,
            published_at: nowIso,
          },
        ],
        { onConflict: 'edition_id,locale' },
      )
      .select('id, locale, slug, title');

    if (postsError || !posts) {
      throw new Error(`Unable to save article posts: ${postsError?.message ?? 'unknown error'}`);
    }

    await supabaseAdmin
      .from('ai_recap_editions')
      .update({
        status: 'published',
        run_id: run.id,
        published_at: nowIso,
        fact_check_result: factCheckResult,
        quality_report: {
          generated_at: nowIso,
          generated_by: 'weekly-ai-recap-cron',
          stage: 'completed',
          status: 'pass',
          brief_quality: briefQuality,
          evidence_pack: {
            story_count: evidencePack.stories.length,
            source_urls: evidencePack.sourceUrls,
            token_estimate: evidencePack.tokenEstimate,
            truncation: packTruncationStats,
          },
          fact_check: {
            status: factCheckResult.status,
            issues: factCheckResult.issues,
            issues_count: factCheckResult.issues.length,
          },
          summary30s: {
            status: 'pass',
            attempts: summary30Attempts,
            source_urls: sourceManifest.used_source_urls,
          },
        },
      })
      .eq('id', edition.id);

    const newsletterAfterPublish = await dispatchNewsletterAfterPublication({
      editionId: edition.id,
      editionKey,
      trigger: payload.trigger,
      force: payload.force,
      schedule,
      config,
    });

    if (newsletterAfterPublish.status === 'failed') {
      await notifyAdminsOnFailure({
        editionKey,
        mode: 'build_article',
        failureReason: 'newsletter_failed',
        errorMessage: newsletterAfterPublish.error ?? newsletterAfterPublish.reason ?? 'Unknown newsletter failure',
        config,
      });
    }

    const runMetrics = {
      mode: 'build_article',
      editionKey,
      sourcesConfigured: sourceRows.length,
      sourcesScraped: successfulScrapes,
      sourcesFailed: failedSourceIds.size,
      storiesSelected: selectedStories.length,
      scrape_methods_breakdown: scrapeMethodsBreakdown,
      brief_quality_score: briefQuality.score,
      brief_attempts: briefQuality.attempts,
      fact_check_status: factCheckResult.status,
      fact_check_issues: factCheckResult.issues.length,
      fact_check_issues_detail: factCheckResult.issues,
      summary30s_status: 'pass',
      summary30s_attempts: summary30Attempts,
      newsletter_after_publish_status: newsletterAfterPublish.status,
      newsletter_after_publish_reason: newsletterAfterPublish.reason ?? null,
      newsletter_after_publish_campaign_id: newsletterAfterPublish.campaignId ?? null,
      token_usage_estimate: evidencePack.tokenEstimate,
      pack_truncation_stats: packTruncationStats,
      article_ready: true,
    };

    if (newsletterAfterPublish.status === 'failed') {
      await markRun(
        run.id,
        'partial',
        runMetrics,
        newsletterAfterPublish.error ?? newsletterAfterPublish.reason ?? 'Newsletter failed after publication',
        'newsletter_failed',
      );
    } else {
      await markRun(
        run.id,
        'succeeded',
        runMetrics,
      );
    }

    await revalidateCache(['news']);

    return json({
      runId: run.id,
      editionId: edition.id,
      editionKey,
      status: newsletterAfterPublish.status === 'failed' ? 'partial' : 'succeeded',
      posts,
      newsletter_after_publish: newsletterAfterPublish,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown build article error';
    const lower = message.toLowerCase();
    const failureReason =
      lower.includes('brief_quality') ? 'brief_quality_failed'
        : lower.includes('fact_check') ? 'fact_check_failed'
          : lower.includes('summary_30s') || lower.includes('summary30') ? 'summary_30s_failed'
            : 'build_article_failed';

    await supabaseAdmin
      .from('ai_recap_editions')
      .update({ status: 'failed', run_id: run.id })
      .eq('id', edition.id);

    await notifyAdminsOnFailure({
      editionKey,
      mode: 'build_article',
      failureReason,
      errorMessage: message,
      config,
    });

    await markRun(
      run.id,
      'failed',
      {
        mode: 'build_article',
        editionKey,
        article_ready: false,
      },
      message,
      failureReason,
    );

    return json(
      {
        runId: run.id,
        editionId: edition.id,
        editionKey,
        status: 'failed',
        error: message,
      },
      500,
    );
  }
}

async function sendNewsletterPipeline(payload: {
  trigger: 'cron' | 'manual' | 'retry';
  force: boolean;
  editionKey?: string;
  testEmail?: string;
  testMode?: boolean;
}) {
  const config = getConfig();
  const schedule = await getSchedule(config);
  const now = new Date();
  const editionKey = payload.editionKey ? normalizeEditionKey(payload.editionKey) : getEditionKey(now, schedule.timezone);
  const run = await createRun(editionKey, payload.trigger, 'send_newsletter');
  const { weekStart, weekEnd } = getWeekBounds(now, schedule.timezone);
  const edition = await ensureEdition(editionKey, run.id, weekStart, weekEnd);
  const effectiveTestMode = payload.testMode ?? payload.trigger === 'manual';

  try {
    if (!effectiveTestMode && !payload.testEmail && !payload.force) {
      const { data: existingDispatch } = await supabaseAdmin
        .from('ai_recap_newsletter_dispatches')
        .select('status, sent_at')
        .eq('edition_id', edition.id)
        .eq('provider', 'sendfox')
        .eq('status', 'sent')
        .maybeSingle();

      if (existingDispatch) {
        await markRun(
          run.id,
          'skipped',
          {
            mode: 'send_newsletter',
            editionKey,
            reason: 'newsletter_already_sent',
          },
        );

        return json({
          runId: run.id,
          editionId: edition.id,
          editionKey,
          status: 'skipped',
          reason: 'newsletter_already_sent',
        });
      }
    }

    let articleReady: boolean | null = null;
    if (!effectiveTestMode) {
      const { fr, en } = await fetchEditionPostsForNewsletter(edition.id);
      if (!hasReadyArticle(fr) || !hasReadyArticle(en)) {
        const failureReason = 'article_not_ready';
        const message = 'Newsletter blocked because FR/EN article is not ready';

        const alert = await notifyAdminsOnFailure({
          editionKey,
          mode: 'send_newsletter',
          failureReason,
          errorMessage: message,
          config,
        });

        await markRun(
          run.id,
          'failed',
          {
            mode: 'send_newsletter',
            editionKey,
            article_ready: false,
            admin_alert_sent: alert.sent > 0,
          },
          message,
          failureReason,
        );

        return json(
          {
            runId: run.id,
            editionId: edition.id,
            editionKey,
            status: 'failed',
            reason: failureReason,
            error: message,
          },
          409,
        );
      }

      if (!hasSummary30Locale(fr.content_json, 'fr') || !hasSummary30Locale(en.content_json, 'en')) {
        throw new Error('Newsletter blocked because summary30s is missing from published posts');
      }

      articleReady = true;
    }

    const sendSlot = resolveNewsletterSendSlot(schedule, editionKey);
    const newsletter = await sendNewsletterForEdition({
      editionId: edition.id,
      editionKey,
      siteUrl: config.appBaseUrl,
      config,
      sendSlot,
      testEmail: payload.testEmail,
      testMode: effectiveTestMode,
    });

    if (!newsletter.success) {
      const failureReason = 'newsletter_send_failed';
      const message = newsletter.error ?? 'Unknown newsletter send error';
      const alert = await notifyAdminsOnFailure({
        editionKey,
        mode: 'send_newsletter',
        failureReason,
        errorMessage: message,
        config,
      });

      await markRun(
        run.id,
        'failed',
        {
          mode: 'send_newsletter',
          editionKey,
          article_ready: articleReady,
          admin_alert_sent: alert.sent > 0,
        },
        message,
        failureReason,
      );

      return json(
        {
          runId: run.id,
          editionId: edition.id,
          editionKey,
          status: 'failed',
          reason: failureReason,
          error: message,
        },
        500,
      );
    }

    await markRun(
      run.id,
      'succeeded',
      {
        mode: 'send_newsletter',
        editionKey,
        article_ready: articleReady,
        newsletterSent: true,
        newsletterCampaignId: newsletter.campaignId ?? null,
        newsletterSendSlot: newsletter.sendSlot ?? null,
      },
    );

    return json({
      runId: run.id,
      editionId: edition.id,
      editionKey,
      status: 'succeeded',
      newsletter,
    });
  } catch (error) {
    const isArticleNotReady = isMissingBilingualPostsError(error);
    const failureReason = isArticleNotReady ? 'article_not_ready' : 'send_newsletter_failed';
    const message = isArticleNotReady
      ? 'Newsletter blocked because FR/EN article is not ready'
      : error instanceof Error
        ? error.message
        : 'Unknown newsletter pipeline error';
    const alert = await notifyAdminsOnFailure({
      editionKey,
      mode: 'send_newsletter',
      failureReason,
      errorMessage: message,
      config,
    });

    await markRun(
      run.id,
      'failed',
      {
        mode: 'send_newsletter',
        editionKey,
        admin_alert_sent: alert.sent > 0,
      },
      message,
      failureReason,
    );

    return json(
      {
        runId: run.id,
        editionId: edition.id,
        editionKey,
        status: 'failed',
        error: message,
        reason: failureReason,
      },
      isArticleNotReady ? 409 : 500,
    );
  }
}

async function tickPipeline(payload: { trigger: 'cron' | 'manual' | 'retry'; force: boolean }) {
  const config = getConfig();
  const schedule = await getSchedule(config);
  const now = new Date();
  if (!schedule.isEnabled) {
    return json({ skipped: true, reason: 'schedule_disabled' });
  }

  const parts = getDateParts(now, schedule.timezone);
  const weekdayIndex = getLocalWeekdayIndex(now, schedule.timezone);
  const matchingSlots = schedule.slots.filter((slot) => isTickDay(slot, weekdayIndex));
  if (matchingSlots.length === 0) {
    return json({ skipped: true, reason: 'outside_scheduled_day' });
  }

  const editionKey = getEditionKey(now, schedule.timezone);
  const slot = matchingSlots.find((item) => matchesClock(parts, item.hour, item.minute));
  if (!slot) {
    return json({ skipped: true, reason: 'outside_scheduled_window', editionKey });
  }

  if (!payload.force) {
    try {
      const { data: edition } = await supabaseAdmin
        .from('ai_recap_editions')
        .select('id')
        .eq('edition_key', editionKey)
        .maybeSingle();

      if (edition?.id) {
        const posts = await fetchEditionPostsForNewsletter(edition.id).catch(() => null);
        if (posts && hasReadyArticle(posts.fr) && hasReadyArticle(posts.en)) {
          const { data: existingDispatch } = await supabaseAdmin
            .from('ai_recap_newsletter_dispatches')
            .select('status')
            .eq('edition_id', edition.id)
            .eq('provider', 'sendfox')
            .eq('status', 'sent')
            .maybeSingle();

          if (existingDispatch) {
            return json({ skipped: true, reason: 'article_and_newsletter_already_ready', editionKey });
          }

          return await sendNewsletterPipeline({
            trigger: payload.trigger,
            force: false,
            editionKey,
          });
        }
      }
    } catch {
      // Ignore readiness lookup failures and continue with article build.
    }
  }

  return await buildArticlePipeline({
    trigger: payload.trigger,
    force: payload.force,
    editionKey,
  });
}

async function runPipeline(payload: {
  trigger: 'cron' | 'manual' | 'retry';
  force: boolean;
  editionKey?: string;
  testEmail?: string;
  testMode?: boolean;
}) {
  return await buildArticlePipeline({
    trigger: payload.trigger,
    force: payload.force,
    editionKey: payload.editionKey,
  });
}

async function retryNewsletter(editionKey?: string, testEmail?: string, testMode?: boolean) {
  const config = getConfig();
  const schedule = await getSchedule(config);
  const normalizedEditionKey = editionKey ? normalizeEditionKey(editionKey) : undefined;

  let edition: { id: string; edition_key: string } | null = null;
  if (normalizedEditionKey) {
    const { data } = await supabaseAdmin
      .from('ai_recap_editions')
      .select('id, edition_key')
      .eq('edition_key', normalizedEditionKey)
      .maybeSingle();
    edition = data;
  } else {
    const { data } = await supabaseAdmin
      .from('ai_recap_editions')
      .select('id, edition_key')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    edition = data;
  }

  if (!edition) {
    return badRequest('No edition available for newsletter retry');
  }

  if (!testMode) {
    const posts = await fetchEditionPostsForNewsletter(edition.id).catch(() => null);
    if (!posts || !hasReadyArticle(posts.fr) || !hasReadyArticle(posts.en)) {
      return badRequest('Retry blocked: FR/EN article is not ready yet');
    }
    if (!hasSummary30Locale(posts.fr.content_json, 'fr') || !hasSummary30Locale(posts.en.content_json, 'en')) {
      return badRequest('Retry blocked: summary30s is missing from published posts');
    }
  }

  const result = await sendNewsletterForEdition({
    editionId: edition.id,
    editionKey: edition.edition_key,
    siteUrl: config.appBaseUrl,
    config,
    sendSlot: resolveNewsletterSendSlot(schedule, edition.edition_key),
    testEmail,
    testMode,
  });

  await writeAuditLog(
    result.success ? 'ai_recap.newsletter.retry.success' : 'ai_recap.newsletter.retry.failed',
    {
      editionKey: edition.edition_key,
      editionId: edition.id,
      sendSlot: result.sendSlot ?? null,
      campaignId: result.campaignId ?? null,
      error: result.error ?? null,
    },
  );

  return json({
    editionId: edition.id,
    editionKey: edition.edition_key,
    newsletter: result,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed();
  if (!isCronAuthorized(req)) return unauthorized();

  try {
    const rawBody = req.method === 'POST' ? await req.json().catch(() => null) : null;
    const parsed = parseWithSchema(requestSchema, rawBody ?? {});
    if (!parsed.success) return badRequest('Invalid request payload');

    const payload = parsed.data;
    const mode = payload.mode ?? 'tick';

    if (mode === 'retry_newsletter') {
      return await retryNewsletter(payload.editionKey, payload.testEmail, payload.testMode);
    }

    if (mode === 'build_article' || mode === 'run') {
      return await buildArticlePipeline({
        trigger: payload.trigger ?? 'cron',
        force: payload.force ?? false,
        editionKey: payload.editionKey,
      });
    }

    if (mode === 'send_newsletter') {
      return await sendNewsletterPipeline({
        trigger: payload.trigger ?? 'cron',
        force: payload.force ?? false,
        editionKey: payload.editionKey,
        testEmail: payload.testEmail,
        testMode: payload.testMode,
      });
    }

    if (mode === 'tick') {
      return await tickPipeline({
        trigger: payload.trigger ?? 'cron',
        force: payload.force ?? false,
      });
    }

    return await runPipeline({
      trigger: payload.trigger ?? 'cron',
      force: payload.force ?? false,
      editionKey: payload.editionKey,
      testEmail: payload.testEmail,
      testMode: payload.testMode,
    });
  } catch (error) {
    console.error('weekly-ai-recap-cron fatal error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message || 'Internal Server Error' }, 500);
  }
});

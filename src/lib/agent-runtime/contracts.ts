export const AGENT_FLOWS = ['weekly-ai-recap', 'seo-blog-writer'] as const;
export type AgentFlow = (typeof AGENT_FLOWS)[number];

export const WEEKLY_RECAP_MODES = [
  'tick',
  'build_article',
  'send_newsletter',
  'retry_newsletter',
] as const;
export type WeeklyRecapMode = (typeof WEEKLY_RECAP_MODES)[number];

export const SEO_BLOG_WRITER_MODES = ['generate'] as const;
export type SeoBlogWriterMode = (typeof SEO_BLOG_WRITER_MODES)[number];

export type AgentMode = WeeklyRecapMode | SeoBlogWriterMode;

export const JOB_STATUSES = ['queued', 'running', 'retrying', 'succeeded', 'failed', 'dead_letter'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type EnqueuePayload = {
  flow: AgentFlow;
  mode: AgentMode;
  editionKey?: string;
  profileId?: string;
  input?: Record<string, unknown>;
  saveToCms?: boolean;
  userId?: string;
  force?: boolean;
  testMode?: boolean;
  testEmail?: string;
  requestId?: string;
  idempotencyKey?: string;
  trigger?: 'cron' | 'manual' | 'retry';
};

export type JobResultPayload = {
  status: Extract<JobStatus, 'succeeded' | 'failed' | 'retrying'>;
  flow: AgentFlow;
  mode: AgentMode;
  startedAt: string;
  finishedAt: string;
  summary: Record<string, unknown>;
  output?: unknown;
  error?: string;
};

export type InternalEnqueueResponse = {
  jobId: string;
  status: JobStatus;
};

export type InternalJobStatusResponse = {
  jobId: string;
  status: JobStatus;
  result?: JobResultPayload;
  error?: string;
};

export function isWeeklyRecapMode(mode: AgentMode): mode is WeeklyRecapMode {
  return (WEEKLY_RECAP_MODES as readonly string[]).includes(mode);
}

export function isSeoBlogWriterMode(mode: AgentMode): mode is SeoBlogWriterMode {
  return (SEO_BLOG_WRITER_MODES as readonly string[]).includes(mode);
}

function trimOrNull(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function slugifyToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160);
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0).toString(36);
}

export function resolveIdempotencyKey(payload: EnqueuePayload): string {
  const explicit = trimOrNull(payload.idempotencyKey);
  if (explicit) return slugifyToken(explicit);

  const requestId = trimOrNull(payload.requestId);
  if (requestId) return slugifyToken(`req:${requestId}`);

  if (payload.flow === 'weekly-ai-recap') {
    const edition = trimOrNull(payload.editionKey) ?? 'editionless';
    return slugifyToken(`${payload.flow}:${payload.mode}:${edition}:${payload.trigger ?? 'manual'}`);
  }

  if (payload.flow === 'seo-blog-writer') {
    const profile = trimOrNull(payload.profileId) ?? 'active';
    const input = payload.input && typeof payload.input === 'object' ? payload.input : {};
    const keyword = typeof input.keyword === 'string' ? input.keyword : 'keywordless';
    const locale = typeof input.locale === 'string' ? input.locale : 'locale-less';
    return slugifyToken(`${payload.flow}:${payload.mode}:${profile}:${locale}:${keyword}:${payload.trigger ?? 'manual'}`);
  }

  const seed = JSON.stringify({ flow: payload.flow, mode: payload.mode });
  return slugifyToken(`unsupported:${stableHash(seed)}`);
}

export function withIdempotencyKey<T extends EnqueuePayload>(payload: T): T & { idempotencyKey: string } {
  return {
    ...payload,
    idempotencyKey: resolveIdempotencyKey(payload),
  };
}

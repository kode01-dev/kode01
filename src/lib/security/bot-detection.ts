const DEFAULT_BLOCKED_BOT_PATTERNS = [
  'ahrefsbot',
  'semrushbot',
  'gptbot',
  'claudebot',
  'perplexitybot',
  'petalbot',
  'dotbot',
  'mj12bot',
  'ccbot',
  'bytespider',
  'amazonbot',
];

const BOT_LIKE_HEURISTIC =
  /(bot|crawler|spider|scrapy|headless|selenium|playwright|puppeteer|curl|wget|python-requests|axios|node-fetch|go-http-client)/i;

function getBlockedPatternsFromEnv(): string[] {
  const raw = process.env.BOT_BLOCKED_UA_SUBSTRINGS;
  if (!raw) return DEFAULT_BLOCKED_BOT_PATTERNS;

  const parsed = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_BLOCKED_BOT_PATTERNS;
}

export function isBlockedBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return getBlockedPatternsFromEnv().some((pattern) => ua.includes(pattern));
}

export function isBotLikeUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_LIKE_HEURISTIC.test(userAgent);
}

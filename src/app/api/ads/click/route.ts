import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordAdEvent, resolveCreativeClickTarget } from '@/features/ads/server/repository';
import { hasMarketingConsentFromCcCookie } from '@/features/cookies/lib/consent';

const schema = z.object({
  campaignId: z.string().uuid(),
  creativeId: z.string().uuid(),
  placement: z.enum(['free', 'news', 'newsletter_footer']),
  channel: z.enum(['web', 'email']).default('web'),
  locale: z.string().trim().min(2).max(8).optional(),
  sendSlot: z.enum(['A', 'B']).optional(),
  newsletterSlot: z.enum(['monthly', 'weekly']).optional(),
  servedFromPool: z.enum(['monthly', 'weekly', 'fallback']).optional(),
});

function parseExternalAllowlist(): string[] {
  return (process.env.ADS_CLICK_ALLOWED_EXTERNAL_HOSTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  // SECURE DEFAULT: Deny if allowlist is empty
  if (allowlist.length === 0) return false;

  // BYPASS PROTECTION: Remove trailing dot from hostname normalization
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  return allowlist.some((rule) => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(2);
      return normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`);
    }
    return normalizedHostname === rule;
  });
}

function sanitizeInternalRedirectTarget(target: string): string | null {
  if (!target.startsWith('/')) return null;
  if (target.startsWith('//')) return null;

  try {
    const parsed = new URL(target, 'https://kode01.local');
    if (parsed.origin !== 'https://kode01.local') return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function sanitizeExternalRedirectTarget(target: string): string | null {
  try {
    const url = new URL(target);
    if (url.protocol !== 'https:') return null;

    const allowlist = parseExternalAllowlist();
    if (!hostMatchesAllowlist(url.hostname, allowlist)) return null;

    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeRedirectTarget(
  target: string,
  destinationKind: 'internal' | 'external',
): string | null {
  if (destinationKind === 'internal') {
    return sanitizeInternalRedirectTarget(target);
  }
  return sanitizeExternalRedirectTarget(target);
}

function getCookieValue(cookieHeader: string, cookieName: string): string | undefined {
  const cookieMatch = cookieHeader.match(new RegExp(`${cookieName}=([^;]+)`));
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : undefined;
}

function canRecordWebMarketingClick(req: Request): boolean {
  if (req.headers.get('sec-gpc') === '1') return false;
  const ccCookie = getCookieValue(req.headers.get('cookie') || '', 'cc_cookie');
  return hasMarketingConsentFromCcCookie(ccCookie);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    campaignId: url.searchParams.get('campaignId'),
    creativeId: url.searchParams.get('creativeId'),
    placement: url.searchParams.get('placement'),
    channel: url.searchParams.get('channel') ?? 'web',
    locale: url.searchParams.get('locale') ?? undefined,
    sendSlot: url.searchParams.get('sendSlot') ?? undefined,
    newsletterSlot: url.searchParams.get('newsletterSlot') ?? undefined,
    servedFromPool: url.searchParams.get('servedFromPool') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid click query' }, { status: 400 });
  }

  const clickTarget = await resolveCreativeClickTarget({
    campaignId: parsed.data.campaignId,
    creativeId: parsed.data.creativeId,
    placementSlug: parsed.data.placement,
  });

  if (!clickTarget) {
    return NextResponse.json({ error: 'Creative target not found' }, { status: 404 });
  }

  const safeTarget = sanitizeRedirectTarget(clickTarget.destinationUrl, clickTarget.destinationKind);
  if (!safeTarget) {
    return NextResponse.json({ error: 'Invalid redirect target' }, { status: 400 });
  }

  const shouldRecordClick = parsed.data.channel === 'email' || canRecordWebMarketingClick(req);

  if (shouldRecordClick) {
    try {
      await recordAdEvent({
        campaignId: parsed.data.campaignId,
        creativeId: parsed.data.creativeId,
        placementSlug: parsed.data.placement,
        channel: parsed.data.channel,
        eventType: parsed.data.channel === 'email' ? 'email_ad_click' : 'click',
        pagePath: null,
        locale: parsed.data.locale ?? null,
        metadata: {
          target: safeTarget,
          ...(parsed.data.sendSlot ? { send_slot: parsed.data.sendSlot } : {}),
          ...(parsed.data.newsletterSlot ? { newsletter_slot: parsed.data.newsletterSlot } : {}),
          ...(parsed.data.servedFromPool ? { served_from_pool: parsed.data.servedFromPool } : {}),
        },
      });
    } catch (error) {
      console.error('Ad click tracking error:', error);
    }
  }

  const redirectTarget = safeTarget.startsWith('/') ? new URL(safeTarget, url.origin) : safeTarget;
  return NextResponse.redirect(redirectTarget, { status: 302 });
}

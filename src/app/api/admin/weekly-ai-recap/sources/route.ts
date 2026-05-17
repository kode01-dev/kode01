import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuditContextFromRequest, logAuditEvent } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/auth/roles';
import { validateServerFetchUrl } from '@/lib/security/server-url-safety';

type ScrapeRoute = 'rss' | 'firecrawl';

const sourceSelect =
  'id, name, url, feed_url, domain, priority, is_active, locale_hint, scrape_route, rss_allow_firecrawl_fallback, created_at, updated_at';

function getDomainFromValidatedUrl(url: URL) {
  return url.hostname.toLowerCase().replace(/\.+$/, '').replace(/^www\./, '');
}

async function validateAdminSourceUrl(rawUrl: string) {
  const safeUrl = await validateServerFetchUrl(rawUrl);
  return {
    url: safeUrl.toString(),
    domain: getDomainFromValidatedUrl(safeUrl),
  };
}

function parseScrapeRoute(value: unknown): ScrapeRoute | null {
  if (value === 'rss' || value === 'firecrawl') return value;
  return null;
}

async function getAdminClient(request?: Request) {
  void request;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) return null;
  return { supabase, userId: user.id };
}

export async function GET() {
  try {
    const adminClient = await getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase } = adminClient;

    const { data, error } = await supabase
      .from('ai_recap_sources')
      .select(sourceSelect)
      .order('priority', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Get AI recap sources error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient(req);
    if (!adminClient) {
      await logAuditEvent({
        eventType: 'ai_recap.source.create.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase, userId } = adminClient;

    const payload = await req.json().catch(() => null);
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
    const priority =
      typeof payload?.priority === 'number' && Number.isFinite(payload.priority)
        ? Math.max(0, Math.floor(payload.priority))
        : 100;
    const localeHint = payload?.locale_hint === 'fr' || payload?.locale_hint === 'en' ? payload.locale_hint : 'both';
    const isActive = payload?.is_active !== false;
    const scrapeRoute = parseScrapeRoute(payload?.scrape_route);
    const feedUrl = typeof payload?.feed_url === 'string' ? payload.feed_url.trim() : '';
    const rssAllowFirecrawlFallback = payload?.rss_allow_firecrawl_fallback === true;

    if (!name || !url || !scrapeRoute) {
      await logAuditEvent({
        eventType: 'ai_recap.source.create.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { reason: 'missing_name_or_url_or_scrape_route' },
      });
      return NextResponse.json({ error: 'name, url and scrape_route are required' }, { status: 400 });
    }

    if (scrapeRoute === 'rss' && !feedUrl) {
      await logAuditEvent({
        eventType: 'ai_recap.source.create.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { reason: 'missing_feed_url_for_rss', scrape_route: scrapeRoute },
      });
      return NextResponse.json({ error: 'feed_url is required when scrape_route is rss' }, { status: 400 });
    }

    let safeSourceUrl: Awaited<ReturnType<typeof validateAdminSourceUrl>>;
    try {
      safeSourceUrl = await validateAdminSourceUrl(url);
    } catch (error) {
      await logAuditEvent({
        eventType: 'ai_recap.source.create.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { reason: 'invalid_url', url, error_message: error instanceof Error ? error.message : String(error) },
      });
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    let safeFeedUrl: string | null = null;
    if (feedUrl) {
      try {
        safeFeedUrl = (await validateAdminSourceUrl(feedUrl)).url;
      } catch (error) {
        await logAuditEvent({
          eventType: 'ai_recap.source.create.failed.validation',
          userId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { reason: 'invalid_feed_url', feed_url: feedUrl, error_message: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Invalid feed_url' }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('ai_recap_sources')
      .insert({
        name,
        url: safeSourceUrl.url,
        feed_url: scrapeRoute === 'rss' ? safeFeedUrl : null,
        domain: safeSourceUrl.domain,
        priority,
        is_active: isActive,
        locale_hint: localeHint,
        scrape_route: scrapeRoute,
        rss_allow_firecrawl_fallback: scrapeRoute === 'rss' ? rssAllowFirecrawlFallback : false,
      })
      .select(sourceSelect)
      .single();

    if (error) {
      await logAuditEvent({
        eventType: 'ai_recap.source.create.failed.db_error',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { error_message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'ai_recap.source.create.success',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        source_id: data.id,
        source_name: data.name,
        domain: data.domain,
        priority: data.priority,
        locale_hint: data.locale_hint,
        is_active: data.is_active,
        scrape_route: data.scrape_route,
        rss_allow_firecrawl_fallback: data.rss_allow_firecrawl_fallback,
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Create AI recap source error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.source.create.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient(req);
    if (!adminClient) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase, userId } = adminClient;

    const payload = await req.json().catch(() => null);
    const id = typeof payload?.id === 'string' ? payload.id : '';
    if (!id) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { reason: 'missing_id' },
      });
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data: existingSource, error: existingSourceError } = await supabase
      .from('ai_recap_sources')
      .select('id, feed_url, scrape_route, rss_allow_firecrawl_fallback')
      .eq('id', id)
      .maybeSingle();

    if (existingSourceError) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.db_error',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id, error_message: existingSourceError.message, phase: 'preload' },
      });
      return NextResponse.json({ error: existingSourceError.message }, { status: 500 });
    }

    if (!existingSource) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.not_found',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id },
      });
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (typeof payload?.name === 'string' && payload.name.trim()) {
      updateData.name = payload.name.trim();
    }
    if (typeof payload?.url === 'string' && payload.url.trim()) {
      const rawUrl = payload.url.trim();
      try {
        const safeSourceUrl = await validateAdminSourceUrl(rawUrl);
        updateData.url = safeSourceUrl.url;
        updateData.domain = safeSourceUrl.domain;
      } catch (error) {
        await logAuditEvent({
          eventType: 'ai_recap.source.update.failed.validation',
          userId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { source_id: id, reason: 'invalid_url', url: rawUrl, error_message: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
      }
    }
    if (typeof payload?.feed_url === 'string') {
      const rawFeedUrl = payload.feed_url.trim();
      if (rawFeedUrl) {
        try {
          updateData.feed_url = (await validateAdminSourceUrl(rawFeedUrl)).url;
        } catch (error) {
          await logAuditEvent({
            eventType: 'ai_recap.source.update.failed.validation',
            userId,
            path: auditContext.path,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata: { source_id: id, reason: 'invalid_feed_url', feed_url: rawFeedUrl, error_message: error instanceof Error ? error.message : String(error) },
          });
          return NextResponse.json({ error: 'Invalid feed_url' }, { status: 400 });
        }
      } else {
        updateData.feed_url = null;
      }
    }
    if (typeof payload?.priority === 'number' && Number.isFinite(payload.priority)) {
      updateData.priority = Math.max(0, Math.floor(payload.priority));
    }
    if (typeof payload?.is_active === 'boolean') {
      updateData.is_active = payload.is_active;
    }
    if (payload?.locale_hint === 'fr' || payload?.locale_hint === 'en' || payload?.locale_hint === 'both') {
      updateData.locale_hint = payload.locale_hint;
    }
    if (parseScrapeRoute(payload?.scrape_route)) {
      updateData.scrape_route = payload.scrape_route;
    }
    if (typeof payload?.rss_allow_firecrawl_fallback === 'boolean') {
      updateData.rss_allow_firecrawl_fallback = payload.rss_allow_firecrawl_fallback;
    }

    if (Object.keys(updateData).length === 0) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id, reason: 'empty_update' },
      });
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const finalScrapeRoute =
      (updateData.scrape_route as ScrapeRoute | undefined) ?? parseScrapeRoute(existingSource.scrape_route) ?? 'firecrawl';
    const finalFeedUrl =
      (typeof updateData.feed_url === 'string' ? updateData.feed_url : updateData.feed_url === null ? '' : existingSource.feed_url ?? '').trim();
    const finalRssFallback =
      typeof updateData.rss_allow_firecrawl_fallback === 'boolean'
        ? updateData.rss_allow_firecrawl_fallback
        : existingSource.rss_allow_firecrawl_fallback;

    if (finalScrapeRoute === 'rss' && !finalFeedUrl) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id, reason: 'missing_feed_url_for_rss', scrape_route: finalScrapeRoute },
      });
      return NextResponse.json({ error: 'feed_url is required when scrape_route is rss' }, { status: 400 });
    }

    if (finalScrapeRoute === 'rss') {
      try {
        updateData.feed_url = (await validateAdminSourceUrl(finalFeedUrl)).url;
      } catch (error) {
        await logAuditEvent({
          eventType: 'ai_recap.source.update.failed.validation',
          userId,
          path: auditContext.path,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { source_id: id, reason: 'invalid_feed_url', feed_url: finalFeedUrl, error_message: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Invalid feed_url' }, { status: 400 });
      }
    } else {
      updateData.feed_url = null;
    }

    updateData.rss_allow_firecrawl_fallback = finalScrapeRoute === 'rss' ? finalRssFallback : false;

    const { data, error } = await supabase
      .from('ai_recap_sources')
      .update(updateData)
      .eq('id', id)
      .select(sourceSelect)
      .single();

    if (error) {
      await logAuditEvent({
        eventType: 'ai_recap.source.update.failed.db_error',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id, error_message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      eventType: 'ai_recap.source.update.success',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: {
        source_id: data.id,
        source_name: data.name,
        priority: data.priority,
        locale_hint: data.locale_hint,
        is_active: data.is_active,
        scrape_route: data.scrape_route,
        rss_allow_firecrawl_fallback: data.rss_allow_firecrawl_fallback,
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Update AI recap source error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.source.update.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auditContext = getAuditContextFromRequest(req);
  try {
    const adminClient = await getAdminClient(req);
    if (!adminClient) {
      await logAuditEvent({
        eventType: 'ai_recap.source.delete.failed.forbidden',
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { supabase, userId } = adminClient;

    const payload = await req.json().catch(() => null);
    const queryId = new URL(req.url).searchParams.get('id');
    const id = typeof payload?.id === 'string' ? payload.id : queryId ?? '';

    if (!id) {
      await logAuditEvent({
        eventType: 'ai_recap.source.delete.failed.validation',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { reason: 'missing_id' },
      });
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('ai_recap_sources')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      await logAuditEvent({
        eventType: 'ai_recap.source.delete.failed.db_error',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id, error_message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      await logAuditEvent({
        eventType: 'ai_recap.source.delete.failed.not_found',
        userId,
        path: auditContext.path,
        ipAddress: auditContext.ipAddress,
        userAgent: auditContext.userAgent,
        metadata: { source_id: id },
      });
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    await logAuditEvent({
      eventType: 'ai_recap.source.delete.success',
      userId,
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { source_id: data.id },
    });

    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Delete AI recap source error:', error);
    await logAuditEvent({
      eventType: 'ai_recap.source.delete.failed.internal_error',
      path: auditContext.path,
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
      metadata: { error_message: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


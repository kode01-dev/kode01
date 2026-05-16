import { useMemo, useState } from 'react';
import {
  RETRY_CHOICE_LATEST_FAILED,
  RETRY_CHOICE_LATEST_RUN,
  RETRY_CHOICE_LATEST_SUCCESS,
  RETRY_CHOICE_PREVIOUS_RUN,
} from './constants';
import type {
  BusyAction,
  RetryChoice,
  RunItem,
  ScheduleItem,
  ScrapeRoute,
  SourceItem,
  SourceLocaleHint,
  StatusTone,
} from './types';
import { isValidEditionKey, normalizeEditionKey, parseJsonSafe } from './utils';
import type { AiRecapAdminText } from './text';

type UseAiRecapAdminPanelParams = {
  initialSources: SourceItem[];
  initialRuns: RunItem[];
  initialTotalRuns?: number;
  initialSchedule: ScheduleItem;
  text: AiRecapAdminText;
};

type RunNowOptions = {
  force?: boolean;
  test?: boolean;
};

function scheduleValue(value: number | null | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function schedulePayload(schedule: ScheduleItem) {
  return {
    is_enabled: schedule.is_enabled,
    timezone: (schedule.timezone || 'America/Toronto').trim(),
    slot_a_day: scheduleValue(schedule.slot_a_day, 1),
    slot_a_hour: scheduleValue(schedule.slot_a_hour, 6),
    slot_a_minute: scheduleValue(schedule.slot_a_minute, 0),
    slot_b_day: scheduleValue(schedule.slot_b_day, 2),
    slot_b_hour: scheduleValue(schedule.slot_b_hour, 6),
    slot_b_minute: scheduleValue(schedule.slot_b_minute, 0),
    slot_c_day: scheduleValue(schedule.slot_c_day, 3),
    slot_c_hour: scheduleValue(schedule.slot_c_hour, 6),
    slot_c_minute: scheduleValue(schedule.slot_c_minute, 0),
    slot_d_day: scheduleValue(schedule.slot_d_day, 4),
    slot_d_hour: scheduleValue(schedule.slot_d_hour, 6),
    slot_d_minute: scheduleValue(schedule.slot_d_minute, 0),
    slot_e_day: scheduleValue(schedule.slot_e_day, 5),
    slot_e_hour: scheduleValue(schedule.slot_e_hour, 6),
    slot_e_minute: scheduleValue(schedule.slot_e_minute, 0),
  };
}

export function useAiRecapAdminPanel({
  initialSources,
  initialRuns,
  initialTotalRuns = 0,
  initialSchedule,
  text,
}: UseAiRecapAdminPanelParams) {
  const [sources, setSources] = useState<SourceItem[]>(initialSources);
  const [runs, setRuns] = useState<RunItem[]>(initialRuns);
  const [totalRuns, setTotalRuns] = useState(initialTotalRuns);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [schedule, setSchedule] = useState<ScheduleItem>(initialSchedule);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<StatusTone>('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [scrapeRoute, setScrapeRoute] = useState<ScrapeRoute>('rss');
  const [rssAllowFirecrawlFallback, setRssAllowFirecrawlFallback] = useState(false);
  const [priority, setPriority] = useState(100);
  const [localeHint, setLocaleHint] = useState<SourceLocaleHint>('both');
  const [retryEditionSelection, setRetryEditionSelection] = useState('');
  const [customEditionKey, setCustomEditionKey] = useState('');
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);

  const activeCount = useMemo(() => sources.filter((item) => item.is_active).length, [sources]);

  const retryEditionKeys = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const run of runs) {
      const key = run.edition_key?.trim();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push(key);
    }
    return options;
  }, [runs]);

  const latestSuccessfulEditionKey = useMemo(
    () => runs.find((run) => run.status === 'succeeded' || run.status === 'partial')?.edition_key?.trim() ?? '',
    [runs],
  );

  const latestFailedEditionKey = useMemo(
    () => runs.find((run) => run.status === 'failed')?.edition_key?.trim() ?? '',
    [runs],
  );

  const quickRetryChoices = useMemo<RetryChoice[]>(() => {
    const choices: RetryChoice[] = [];
    if (retryEditionKeys[0]) {
      choices.push({ value: RETRY_CHOICE_LATEST_RUN, label: text.latestRunChoice });
    }
    if (retryEditionKeys[1]) {
      choices.push({ value: RETRY_CHOICE_PREVIOUS_RUN, label: text.previousRunChoice });
    }
    if (latestSuccessfulEditionKey) {
      choices.push({ value: RETRY_CHOICE_LATEST_SUCCESS, label: text.latestSuccessChoice });
    }
    if (latestFailedEditionKey) {
      choices.push({ value: RETRY_CHOICE_LATEST_FAILED, label: text.latestFailedChoice });
    }
    return choices;
  }, [
    retryEditionKeys,
    latestSuccessfulEditionKey,
    latestFailedEditionKey,
    text.latestRunChoice,
    text.previousRunChoice,
    text.latestSuccessChoice,
    text.latestFailedChoice,
  ]);

  const defaultCalculatedKey = useMemo(() => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const year = d.getUTCFullYear();
    const weekStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((d.getTime() - weekStart.getTime()) / 86400000 + 1) / 7);
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const day = dayNames[new Date().getDay()];
    return `${year}-W${String(week).padStart(2, '0')}-${day}`;
  }, []);

  function resolveRetryEditionKey() {
    if (customEditionKey.trim()) {
      return customEditionKey.trim();
    }
    switch (retryEditionSelection) {
      case RETRY_CHOICE_LATEST_RUN:
        return retryEditionKeys[0] || undefined;
      case RETRY_CHOICE_PREVIOUS_RUN:
        return retryEditionKeys[1] || undefined;
      case RETRY_CHOICE_LATEST_SUCCESS:
        return latestSuccessfulEditionKey || undefined;
      case RETRY_CHOICE_LATEST_FAILED:
        return latestFailedEditionKey || undefined;
      default:
        return retryEditionSelection.trim() || undefined;
    }
  }

  function resetSourceForm() {
    setName('');
    setUrl('');
    setFeedUrl('');
    setScrapeRoute('rss');
    setRssAllowFirecrawlFallback(true);
    setPriority(100);
    setLocaleHint('both');
  }

  function startEditing(source: SourceItem) {
    setEditingSourceId(source.id);
    setName(source.name);
    setUrl(source.url);
    setFeedUrl(source.feed_url || '');
    setScrapeRoute(source.scrape_route);
    setRssAllowFirecrawlFallback(source.rss_allow_firecrawl_fallback);
    setPriority(source.priority);
    setLocaleHint(source.locale_hint);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  function cancelEditing() {
    setEditingSourceId(null);
    resetSourceForm();
  }

  async function refreshData(targetPage?: number) {
    const pageToFetch = targetPage ?? currentPage;
    const [sourcesRes, runsRes, scheduleRes] = await Promise.all([
      fetch('/api/admin/weekly-ai-recap/sources', { cache: 'no-store' }),
      fetch(`/api/admin/weekly-ai-recap/runs?page=${pageToFetch}&limit=${pageSize}`, { cache: 'no-store' }),
      fetch('/api/admin/weekly-ai-recap/schedule', { cache: 'no-store' }),
    ]);

    const sourcesBody = await parseJsonSafe(sourcesRes);
    const runsBody = await parseJsonSafe(runsRes);
    const scheduleBody = await parseJsonSafe(scheduleRes);

    if (sourcesRes.ok && Array.isArray(sourcesBody?.data)) {
      setSources(sourcesBody.data);
    }
    if (runsRes.ok && Array.isArray(runsBody?.data)) {
      setRuns(runsBody.data);
      if (typeof runsBody.count === 'number') {
        setTotalRuns(runsBody.count);
      }
    }
    if (scheduleRes.ok && scheduleBody?.data) {
      setSchedule(scheduleBody.data as ScheduleItem);
    }
  }

  function setPage(page: number) {
    setCurrentPage(page);
    void refreshData(page);
  }

  function scheduleRefreshPoll() {
    const intervals = [4000, 8000, 15000];
    for (const delay of intervals) {
      setTimeout(() => {
        void refreshData();
      }, delay);
    }
  }

  async function runNow(options?: RunNowOptions) {
    const force = options?.force ?? false;
    const isTest = options?.test ?? false;
    const normalizedEditionKey = normalizeEditionKey(customEditionKey);

    if (normalizedEditionKey && !isValidEditionKey(normalizedEditionKey)) {
      setStatusTone('error');
      setStatusMessage(text.editionKeyInvalid);
      return;
    }

    setIsBusy(true);
    setBusyAction(isTest ? 'test' : force ? 'force' : 'run');
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const mode: 'build_article' | 'send_newsletter' = isTest ? 'send_newsletter' : 'build_article';
      const res = await fetch('/api/admin/weekly-ai-recap/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          force,
          editionKey: normalizedEditionKey || undefined,
          testMode: isTest || undefined,
        }),
      });
      const body = await parseJsonSafe(res);
      if (res.status === 202) {
        setStatusTone('success');
        setStatusMessage(`Queued on agent runtime (job ${body?.jobId ?? 'n/a'}).`);
        scheduleRefreshPoll();
      } else if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.runFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(`${text.runStatusPrefix}: ${body?.status ?? 'ok'} (${body?.editionKey ?? 'n/a'})`);
      }
      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : text.unknownError;
      setStatusTone('error');
      setStatusMessage(`${text.runFailedPrefix}: ${message}`);
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  async function retryNewsletter() {
    const editionKey = resolveRetryEditionKey();
    const normalizedEditionKey = editionKey ? normalizeEditionKey(editionKey) : undefined;
    if (normalizedEditionKey && !isValidEditionKey(normalizedEditionKey)) {
      setStatusTone('error');
      setStatusMessage(text.editionKeyInvalid);
      return;
    }

    setIsBusy(true);
    setBusyAction('retry');
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/retry-newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editionKey: normalizedEditionKey,
        }),
      });
      const body = await parseJsonSafe(res);
      if (res.status === 202) {
        setStatusTone('success');
        setStatusMessage(`Queued on agent runtime (job ${body?.jobId ?? 'n/a'}).`);
        scheduleRefreshPoll();
      } else if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.retryFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone(body?.newsletter?.success ? 'success' : 'error');
        setStatusMessage(`${text.newsletterRetryPrefix}: ${body?.newsletter?.success ? text.sent : text.failed}`);
      }
      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : text.unknownError;
      setStatusTone('error');
      setStatusMessage(`${text.retryFailedPrefix}: ${message}`);
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  async function runSmoke() {
    setIsBusy(true);
    setBusyAction('smoke');
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/smoke', { cache: 'no-store' });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.smokeFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        const failed = typeof body?.failed === 'number' ? body.failed : 0;
        const warned = typeof body?.warned === 'number' ? body.warned : 0;
        setStatusTone(failed === 0 ? 'success' : 'error');
        setStatusMessage(`${text.smokeStatusPrefix}: ${failed} failed, ${warned} warnings`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : text.unknownError;
      setStatusTone('error');
      setStatusMessage(`${text.smokeFailedPrefix}: ${message}`);
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  async function addOrUpdateSource() {
    if (scrapeRoute === 'rss' && !feedUrl.trim()) {
      setStatusTone('error');
      setStatusMessage(text.rssFeedRequired);
      return;
    }

    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const isEditing = !!editingSourceId;
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSourceId,
          name: name.trim(),
          url: url.trim(),
          feed_url: feedUrl.trim() || null,
          scrape_route: scrapeRoute,
          rss_allow_firecrawl_fallback: rssAllowFirecrawlFallback,
          priority: Math.floor(priority),
          locale_hint: localeHint,
          ...(isEditing ? {} : { is_active: true }),
        }),
      });

      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(
          `${isEditing ? text.updateSourceFailedPrefix : text.createSourceFailedPrefix}: ${body?.error ?? res.statusText}`,
        );
      } else {
        setStatusTone('success');
        setStatusMessage(isEditing ? text.sourceUpdated : text.sourceCreated);
        if (isEditing) {
          setEditingSourceId(null);
        }
        resetSourceForm();
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleSource(source: SourceItem) {
    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          is_active: !source.is_active,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.updateSourceFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.sourceUpdated);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function updatePriority(source: SourceItem, nextPriority: number) {
    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          priority: nextPriority,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.priorityUpdateFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.priorityUpdated);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function updateFeedUrl(source: SourceItem, nextFeedUrlRaw: string) {
    const nextFeedUrl = nextFeedUrlRaw.trim();
    const currentFeedUrl = source.feed_url?.trim() ?? '';
    if (nextFeedUrl === currentFeedUrl) {
      return;
    }
    if (source.scrape_route === 'rss' && !nextFeedUrl) {
      setStatusTone('error');
      setStatusMessage(text.rssFeedRequired);
      return;
    }

    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          feed_url: nextFeedUrl || null,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.updateSourceFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.sourceUpdated);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function updateScrapeRoute(source: SourceItem, nextRoute: ScrapeRoute) {
    if (source.scrape_route === nextRoute) {
      return;
    }
    if (nextRoute === 'rss' && !(source.feed_url ?? '').trim()) {
      setStatusTone('error');
      setStatusMessage(text.rssFeedRequired);
      return;
    }

    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          scrape_route: nextRoute,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.updateSourceFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.sourceUpdated);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function updateRssFallback(source: SourceItem, enabled: boolean) {
    if (source.scrape_route !== 'rss') {
      return;
    }
    if (source.rss_allow_firecrawl_fallback === enabled) {
      return;
    }
    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: source.id,
          rss_allow_firecrawl_fallback: enabled,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.updateSourceFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.sourceUpdated);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteSource(source: SourceItem) {
    const confirmed = window.confirm(`${text.deleteSourceConfirm} "${source.name}"?`);
    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/sources', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: source.id }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.deleteSourceFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.sourceDeleted);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  async function saveSchedule() {
    setIsBusy(true);
    setStatusTone('idle');
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedulePayload(schedule)),
      });

      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setStatusTone('error');
        setStatusMessage(`${text.scheduleUpdateFailedPrefix}: ${body?.error ?? res.statusText}`);
      } else {
        setStatusTone('success');
        setStatusMessage(text.scheduleUpdated);
      }
      await refreshData();
    } finally {
      setIsBusy(false);
    }
  }

  return {
    sources,
    runs,
    totalRuns,
    currentPage,
    pageSize,
    setPage,
    schedule,
    setSchedule,
    statusMessage,
    statusTone,
    isBusy,
    busyAction,
    activeCount,
    retryEditionKeys,
    quickRetryChoices,
    defaultCalculatedKey,
    retryEditionSelection,
    setRetryEditionSelection,
    customEditionKey,
    setCustomEditionKey,
    editingSourceId,
    name,
    setName,
    url,
    setUrl,
    feedUrl,
    setFeedUrl,
    scrapeRoute,
    setScrapeRoute,
    rssAllowFirecrawlFallback,
    setRssAllowFirecrawlFallback,
    priority,
    setPriority,
    localeHint,
    setLocaleHint,
    startEditing,
    cancelEditing,
    runNow,
    runSmoke,
    retryNewsletter,
    addOrUpdateSource,
    toggleSource,
    updatePriority,
    updateFeedUrl,
    updateScrapeRoute,
    updateRssFallback,
    deleteSource,
    saveSchedule,
  };
}

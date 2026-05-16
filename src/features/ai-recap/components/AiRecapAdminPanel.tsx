'use client';

import { useMemo } from 'react';
import { DayThemesSection } from './ai-recap-admin/DayThemesSection';
import { RecentRunsSection } from './ai-recap-admin/RecentRunsSection';
import { RunControlsSection } from './ai-recap-admin/RunControlsSection';
import { ScheduleSection } from './ai-recap-admin/ScheduleSection';
import { SiteTextControlSection } from './ai-recap-admin/SiteTextControlSection';
import { SourcesSection } from './ai-recap-admin/SourcesSection';
import { getAiRecapAdminText } from './ai-recap-admin/text';
import type { RunItem, ScheduleItem, SourceItem } from './ai-recap-admin/types';
import { useAiRecapAdminPanel } from './ai-recap-admin/use-ai-recap-admin-panel';

export type { RunItem, ScheduleItem, SourceItem } from './ai-recap-admin/types';

type PanelProps = {
  locale: string;
  initialSources: SourceItem[];
  initialRuns: RunItem[];
  initialTotalRuns?: number;
  initialSchedule: ScheduleItem;
};

export function AiRecapAdminPanel({
  locale,
  initialSources,
  initialRuns,
  initialTotalRuns,
  initialSchedule,
}: PanelProps) {
  const text = useMemo(() => getAiRecapAdminText(locale), [locale]);
  const panel = useAiRecapAdminPanel({
    initialSources,
    initialRuns,
    initialTotalRuns,
    initialSchedule,
    text,
  });

  return (
    <div className="space-y-8">
      <RunControlsSection
        text={text}
        isBusy={panel.isBusy}
        busyAction={panel.busyAction}
        retryEditionSelection={panel.retryEditionSelection}
        onRetryEditionSelectionChange={panel.setRetryEditionSelection}
        retryEditionKeys={panel.retryEditionKeys}
        quickRetryChoices={panel.quickRetryChoices}
        customEditionKey={panel.customEditionKey}
        onCustomEditionKeyChange={panel.setCustomEditionKey}
        defaultCalculatedKey={panel.defaultCalculatedKey}
        onRunNow={() => panel.runNow({ force: false })}
        onForceRun={() => panel.runNow({ force: true })}
        onRunTest={() => panel.runNow({ force: true, test: true })}
        onRunSmoke={panel.runSmoke}
        onRetryNewsletter={panel.retryNewsletter}
        statusMessage={panel.statusMessage}
        statusTone={panel.statusTone}
      />

      <SiteTextControlSection text={text} locale={locale} />

      <ScheduleSection
        text={text}
        schedule={panel.schedule}
        setSchedule={panel.setSchedule}
        isBusy={panel.isBusy}
        onSaveSchedule={panel.saveSchedule}
      />

      <DayThemesSection text={text} sources={panel.sources} locale={locale} />

      <SourcesSection
        text={text}
        sources={panel.sources}
        activeCount={panel.activeCount}
        isBusy={panel.isBusy}
        editingSourceId={panel.editingSourceId}
        form={{
          name: panel.name,
          setName: panel.setName,
          url: panel.url,
          setUrl: panel.setUrl,
          feedUrl: panel.feedUrl,
          setFeedUrl: panel.setFeedUrl,
          scrapeRoute: panel.scrapeRoute,
          setScrapeRoute: panel.setScrapeRoute,
          rssAllowFirecrawlFallback: panel.rssAllowFirecrawlFallback,
          setRssAllowFirecrawlFallback: panel.setRssAllowFirecrawlFallback,
          priority: panel.priority,
          setPriority: panel.setPriority,
          localeHint: panel.localeHint,
          setLocaleHint: panel.setLocaleHint,
        }}
        actions={{
          onAddOrUpdateSource: panel.addOrUpdateSource,
          onCancelEditing: panel.cancelEditing,
          onStartEditing: panel.startEditing,
          onToggleSource: panel.toggleSource,
          onDeleteSource: panel.deleteSource,
          onUpdateScrapeRoute: panel.updateScrapeRoute,
          onUpdatePriority: panel.updatePriority,
          onUpdateFeedUrl: panel.updateFeedUrl,
          onUpdateRssFallback: panel.updateRssFallback,
        }}
      />

      <RecentRunsSection
        text={text}
        runs={panel.runs}
        totalCount={panel.totalRuns}
        currentPage={panel.currentPage}
        pageSize={panel.pageSize}
        locale={locale}
        onPageChange={panel.setPage}
      />
    </div>
  );
}

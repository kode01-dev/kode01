import { Info, MoreHorizontal, PenLine, Power, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AiRecapAdminText } from './text';
import type { ScrapeRoute, SourceItem, SourceLocaleHint } from './types';

type SourceFormProps = {
  name: string;
  setName: (value: string) => void;
  url: string;
  setUrl: (value: string) => void;
  feedUrl: string;
  setFeedUrl: (value: string) => void;
  scrapeRoute: ScrapeRoute;
  setScrapeRoute: (value: ScrapeRoute) => void;
  rssAllowFirecrawlFallback: boolean;
  setRssAllowFirecrawlFallback: (value: boolean) => void;
  priority: number;
  setPriority: (value: number) => void;
  localeHint: SourceLocaleHint;
  setLocaleHint: (value: SourceLocaleHint) => void;
};

type SourceActions = {
  onAddOrUpdateSource: () => void;
  onCancelEditing: () => void;
  onStartEditing: (source: SourceItem) => void;
  onToggleSource: (source: SourceItem) => void;
  onDeleteSource: (source: SourceItem) => void;
  onUpdateScrapeRoute: (source: SourceItem, route: ScrapeRoute) => void;
  onUpdatePriority: (source: SourceItem, priority: number) => void;
  onUpdateFeedUrl: (source: SourceItem, feedUrl: string) => void;
  onUpdateRssFallback: (source: SourceItem, enabled: boolean) => void;
};

type SourcesSectionProps = {
  text: AiRecapAdminText;
  sources: SourceItem[];
  activeCount: number;
  isBusy: boolean;
  editingSourceId: string | null;
  form: SourceFormProps;
  actions: SourceActions;
};

export function SourcesSection({
  text,
  sources,
  activeCount,
  isBusy,
  editingSourceId,
  form,
  actions,
}: SourcesSectionProps) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-6">
      <h2 className="text-xl font-serif font-black">
        {editingSourceId ? text.editingSource : `${text.sources} (${activeCount} ${text.activePlural})`}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          placeholder={text.sourceNamePlaceholder}
          className="rounded-2xl border border-black/10 px-4 py-3 text-sm"
        />
        <input
          value={form.url}
          onChange={(event) => form.setUrl(event.target.value)}
          placeholder={text.sourceUrlPlaceholder}
          className="rounded-2xl border border-black/10 px-4 py-3 text-sm"
        />
        <select
          value={form.scrapeRoute}
          onChange={(event) => form.setScrapeRoute(event.target.value as ScrapeRoute)}
          className="rounded-2xl border border-black/10 px-4 py-3 text-sm"
        >
          <option value="rss">{text.rss}</option>
          <option value="firecrawl">{text.firecrawl}</option>
        </select>
        <div className="space-y-2">
          <input
            value={form.feedUrl}
            onChange={(event) => form.setFeedUrl(event.target.value)}
            placeholder={text.rssFeedPlaceholder}
            className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm disabled:bg-black/[0.02] disabled:text-kode01-noir/35"
            disabled={form.scrapeRoute !== 'rss'}
          />
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={form.rssAllowFirecrawlFallback}
              onChange={(event) => form.setRssAllowFirecrawlFallback(event.target.checked)}
              disabled={form.scrapeRoute !== 'rss'}
            />
            {text.allowFirecrawlFallback}
          </label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <input
            type="number"
            value={form.priority}
            onChange={(event) => form.setPriority(Number(event.target.value))}
            className="w-24 rounded-2xl border border-black/10 px-3 py-3 text-sm"
          />
          <select
            value={form.localeHint}
            onChange={(event) => form.setLocaleHint(event.target.value as SourceLocaleHint)}
            className="rounded-2xl border border-black/10 px-3 py-3 text-sm"
          >
            <option value="both">both</option>
            <option value="fr">fr</option>
            <option value="en">en</option>
          </select>
          <button
            type="button"
            disabled={isBusy || !form.name.trim() || !form.url.trim() || (form.scrapeRoute === 'rss' && !form.feedUrl.trim())}
            onClick={actions.onAddOrUpdateSource}
            className="flex-1 rounded-2xl bg-kode01-noir px-4 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50 sm:flex-none"
          >
            {editingSourceId ? text.save : text.add}
          </button>
          {editingSourceId ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={actions.onCancelEditing}
              className="flex-1 rounded-2xl border border-black/15 bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-kode01-noir disabled:opacity-50 sm:flex-none"
            >
              {text.cancel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3 lg:hidden">
        {sources.map((source) => (
          <div key={source.id} className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold">{source.name}</p>
                  <span className={`text-[10px] font-bold ${source.is_active ? 'text-kode01-green' : 'text-kode01-noir/40'}`}>
                    {source.is_active ? text.yes : text.no}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-kode01-noir/50">{source.url}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isBusy}
                    className="shrink-0 rounded-full p-1.5 transition-colors hover:bg-black/5 disabled:opacity-50"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => actions.onStartEditing(source)}>
                    <PenLine size={14} />
                    {text.modify}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onToggleSource(source)}>
                    <Power size={14} />
                    {source.is_active ? text.disable : text.enable}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => actions.onDeleteSource(source)}>
                    <Trash2 size={14} />
                    {text.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-kode01-noir/45">{text.route}</span>
                <select
                  value={source.scrape_route}
                  onChange={(event) => actions.onUpdateScrapeRoute(source, event.target.value as ScrapeRoute)}
                  className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs"
                  disabled={isBusy}
                >
                  <option value="rss">{text.rss}</option>
                  <option value="firecrawl">{text.firecrawl}</option>
                </select>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-kode01-noir/45">{text.priority}</span>
                <input
                  type="number"
                  defaultValue={source.priority}
                  onBlur={(event) => actions.onUpdatePriority(source, Number(event.target.value))}
                  className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs"
                />
              </div>
              <div className="col-span-2">
                <span className="text-[10px] uppercase tracking-wider text-kode01-noir/45">{text.rssFeed}</span>
                <input
                  type="url"
                  defaultValue={source.feed_url ?? ''}
                  onBlur={(event) => actions.onUpdateFeedUrl(source, event.target.value)}
                  placeholder={text.rssFeedPlaceholder}
                  className="mt-0.5 w-full rounded-lg border border-black/10 px-2 py-1.5 text-xs disabled:bg-black/[0.02] disabled:text-kode01-noir/35"
                  disabled={isBusy || source.scrape_route !== 'rss'}
                />
              </div>
              <div className="col-span-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={source.rss_allow_firecrawl_fallback}
                    onChange={(event) => actions.onUpdateRssFallback(source, event.target.checked)}
                    disabled={isBusy || source.scrape_route !== 'rss'}
                  />
                  {text.allowFirecrawlFallback}
                </label>
              </div>
              <div className="col-span-2 text-kode01-noir/50">
                {text.domain}: {source.domain}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase tracking-widest text-kode01-noir/45">
              <th className="py-2 pr-3">{text.name}</th>
              <th className="py-2 pr-3">{text.route}</th>
              <th className="py-2 pr-3">{text.rssFeed}</th>
              <th className="py-2 pr-3">{text.allowFirecrawlFallback}</th>
              <th className="py-2 pr-3">{text.domain}</th>
              <th className="py-2 pr-3">{text.priority}</th>
              <th className="py-2 pr-3">{text.active}</th>
              <th className="py-2 pr-3">{text.action}</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-black/5">
                <td className="py-3 pr-3">
                  <p className="font-bold">{source.name}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="max-w-[150px] truncate text-xs text-kode01-noir/50" title={source.url}>
                      {source.url}
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-kode01-noir/30 transition-colors hover:text-kode01-pink">
                          <Info size={12} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs break-all">{source.url}</TooltipContent>
                    </Tooltip>
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <select
                    value={source.scrape_route}
                    onChange={(event) => actions.onUpdateScrapeRoute(source, event.target.value as ScrapeRoute)}
                    className="w-full min-w-[120px] rounded-lg border border-black/10 px-2 py-1 text-xs"
                    disabled={isBusy}
                  >
                    <option value="rss">{text.rss}</option>
                    <option value="firecrawl">{text.firecrawl}</option>
                  </select>
                </td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      defaultValue={source.feed_url ?? ''}
                      onBlur={(event) => actions.onUpdateFeedUrl(source, event.target.value)}
                      placeholder={text.rssFeedPlaceholder}
                      className="w-full min-w-[150px] rounded-lg border border-black/10 px-2 py-1 text-xs disabled:bg-black/[0.02] disabled:text-kode01-noir/35"
                      disabled={isBusy || source.scrape_route !== 'rss'}
                    />
                    {source.feed_url ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0 cursor-help text-kode01-noir/30 transition-colors hover:text-kode01-pink">
                            <Info size={12} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs break-all">{source.feed_url}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pr-3 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={source.rss_allow_firecrawl_fallback}
                      onChange={(event) => actions.onUpdateRssFallback(source, event.target.checked)}
                      disabled={isBusy || source.scrape_route !== 'rss'}
                    />
                    {source.rss_allow_firecrawl_fallback ? text.yes : text.no}
                  </label>
                </td>
                <td className="py-3 pr-3 text-xs">{source.domain}</td>
                <td className="py-3 pr-3">
                  <input
                    type="number"
                    defaultValue={source.priority}
                    onBlur={(event) => actions.onUpdatePriority(source, Number(event.target.value))}
                    className="w-20 rounded-lg border border-black/10 px-2 py-1 text-xs"
                  />
                </td>
                <td className="whitespace-nowrap py-3 pr-3 text-xs font-bold">
                  <span className={source.is_active ? 'text-kode01-green' : 'text-kode01-noir/40'}>
                    {source.is_active ? text.yes : text.no}
                  </span>
                </td>
                <td className="py-3 pr-3">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={isBusy}
                        className="rounded-full p-1.5 transition-colors hover:bg-black/5 disabled:opacity-50"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => actions.onStartEditing(source)}>
                        <PenLine size={14} />
                        {text.modify}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => actions.onToggleSource(source)}>
                        <Power size={14} />
                        {source.is_active ? text.disable : text.enable}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => actions.onDeleteSource(source)}>
                        <Trash2 size={14} />
                        {text.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

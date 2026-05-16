import { Loader2 } from 'lucide-react';
import type { AiRecapAdminText } from './text';
import type { BusyAction, RetryChoice, StatusTone } from './types';

type RunControlsSectionProps = {
  text: AiRecapAdminText;
  isBusy: boolean;
  busyAction: BusyAction;
  retryEditionSelection: string;
  onRetryEditionSelectionChange: (value: string) => void;
  retryEditionKeys: string[];
  quickRetryChoices: RetryChoice[];
  customEditionKey: string;
  onCustomEditionKeyChange: (value: string) => void;
  defaultCalculatedKey: string;
  onRunNow: () => void;
  onForceRun: () => void;
  onRunTest: () => void;
  onRunSmoke: () => void;
  onRetryNewsletter: () => void;
  statusMessage: string;
  statusTone: StatusTone;
};

export function RunControlsSection({
  text,
  isBusy,
  busyAction,
  retryEditionSelection,
  onRetryEditionSelectionChange,
  retryEditionKeys,
  quickRetryChoices,
  customEditionKey,
  onCustomEditionKeyChange,
  defaultCalculatedKey,
  onRunNow,
  onForceRun,
  onRunTest,
  onRunSmoke,
  onRetryNewsletter,
  statusMessage,
  statusTone,
}: RunControlsSectionProps) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={onRunNow}
            className="inline-flex items-center gap-2 rounded-full bg-kode01-noir px-5 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
          >
            {busyAction === 'run' ? <Loader2 size={14} className="animate-spin" /> : null}
            {busyAction === 'run' ? text.runNowPending : text.runNow}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onForceRun}
            className="inline-flex items-center gap-2 rounded-full bg-kode01-pink px-5 py-2 text-xs font-bold uppercase tracking-widest text-kode01-noir disabled:opacity-50"
          >
            {busyAction === 'force' ? <Loader2 size={14} className="animate-spin" /> : null}
            {busyAction === 'force' ? text.forceRunPending : text.forceRun}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onRunTest}
            className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2 text-xs font-bold uppercase tracking-widest text-kode01-noir disabled:opacity-50"
          >
            {busyAction === 'test' ? <Loader2 size={14} className="animate-spin" /> : null}
            {busyAction === 'test' ? text.runTestPending : text.runTest}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onRunSmoke}
            className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2 text-xs font-bold uppercase tracking-widest text-kode01-noir disabled:opacity-50"
          >
            {busyAction === 'smoke' ? <Loader2 size={14} className="animate-spin" /> : null}
            {busyAction === 'smoke' ? text.smokeTestPending : text.smokeTest}
          </button>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[320px]">
          <label className="px-1 text-[10px] font-semibold uppercase tracking-widest text-kode01-noir/50">
            {text.editionKeyLabel}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={retryEditionSelection}
              onChange={(event) => onRetryEditionSelectionChange(event.target.value)}
              className="flex-1 rounded-full border border-black/10 bg-black/[0.02] px-4 py-2 text-xs font-medium"
            >
              <option value="">
                {text.latestEditionOption} {retryEditionKeys.length === 0 ? text.noHistory : ''}
              </option>
              {quickRetryChoices.length > 0 ? (
                <optgroup label={text.quickChoices}>
                  {quickRetryChoices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {retryEditionKeys.length > 0 ? (
                <optgroup label={text.recentEditionKeys}>
                  {retryEditionKeys.map((editionKey) => (
                    <option key={editionKey} value={editionKey}>
                      {editionKey}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>

            <span className="hidden text-[10px] font-black text-black/20 sm:block">{text.orSign}</span>

            <input
              type="text"
              value={customEditionKey}
              onChange={(event) => onCustomEditionKeyChange(event.target.value)}
              placeholder={text.customKeyPlaceholder}
              className="w-full rounded-full border border-black/10 px-4 py-2 text-xs font-medium focus:border-kode01-pink focus:outline-none sm:w-48"
            />
          </div>
          <p className="px-1 text-[10px] text-kode01-noir/40">
            {text.editionKeyHint} <span className="font-bold">[{defaultCalculatedKey}]</span>
          </p>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[260px]">
          <label className="px-1 text-[10px] font-semibold uppercase tracking-widest text-kode01-noir/50">
            {text.testListLabel}
          </label>
          <div className="w-full rounded-full border border-black/10 bg-black/[0.02] px-4 py-2 text-xs font-semibold text-kode01-noir">
            {text.testListValue}
          </div>
          <p className="px-1 text-[10px] text-kode01-noir/40">{text.testListHint}</p>
        </div>
        <button
          type="button"
          disabled={isBusy}
          onClick={onRetryNewsletter}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2 text-xs font-bold uppercase tracking-widest text-kode01-noir disabled:opacity-50 sm:w-auto"
        >
          {busyAction === 'retry' ? <Loader2 size={14} className="animate-spin" /> : null}
          {busyAction === 'retry' ? text.retryNewsletterPending : text.retryNewsletter}
        </button>
      </div>
      {statusMessage ? (
        <p
          className={`mt-4 text-sm font-medium ${
            statusTone === 'error'
              ? 'text-red-600'
              : statusTone === 'success'
                ? 'text-kode01-green'
                : 'text-kode01-noir/70'
          }`}
          role={statusTone === 'error' ? 'alert' : 'status'}
        >
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}

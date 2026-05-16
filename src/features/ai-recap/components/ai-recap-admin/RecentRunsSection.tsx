import type { AiRecapAdminText } from './text';
import type { RunItem } from './types';

type RecentRunsSectionProps = {
  text: AiRecapAdminText;
  runs: RunItem[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  locale: string;
  onPageChange: (page: number) => void;
};

function getStatusBadgeClass(status: RunItem['status']) {
  if (status === 'succeeded') {
    return 'bg-kode01-green/10 text-kode01-green';
  }
  if (status === 'failed') {
    return 'bg-red-50 text-red-600';
  }
  if (status === 'running') {
    return 'bg-blue-50 text-blue-600';
  }
  return 'bg-black/5 text-kode01-noir/60';
}

export function RecentRunsSection({
  text,
  runs,
  totalCount,
  currentPage,
  pageSize,
  locale,
  onPageChange,
}: RecentRunsSectionProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-serif font-black">{text.recentRuns}</h2>
        <p className="text-xs text-kode01-noir/45">{text.showingRange(from, to, totalCount)}</p>
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {runs.map((run) => (
          <div key={run.id} className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-bold">{run.edition_key}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${getStatusBadgeClass(run.status)}`}
              >
                {run.status}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-kode01-noir/60">
              <div>
                <span className="text-kode01-noir/40">{text.trigger}:</span> {run.trigger_type}
              </div>
              <div>
                <span className="text-kode01-noir/40">{text.mode}:</span> {run.mode ?? 'run'}
              </div>
              <div>
                <span className="text-kode01-noir/40">{text.attempt}:</span> {run.attempt}
              </div>
              <div className="col-span-2">
                <span className="text-kode01-noir/40">{text.started}:</span>{' '}
                {run.started_at ? new Date(run.started_at).toLocaleDateString(locale, { dateStyle: 'long' }) : '-'}
              </div>
              {run.error_message ? (
                <div className="col-span-2 text-red-600">
                  <span className="text-kode01-noir/40">{text.error}:</span> {run.error_message}
                  {run.failure_reason ? ` (${run.failure_reason})` : ''}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase tracking-widest text-kode01-noir/45">
              <th className="py-2 pr-3">{text.edition}</th>
              <th className="py-2 pr-3">{text.trigger}</th>
              <th className="py-2 pr-3">{text.mode}</th>
              <th className="py-2 pr-3">{text.attempt}</th>
              <th className="py-2 pr-3">{text.status}</th>
              <th className="py-2 pr-3">{text.started}</th>
              <th className="py-2 pr-3">{text.error}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-black/5">
                <td className="py-3 pr-3 font-mono text-xs">{run.edition_key}</td>
                <td className="py-3 pr-3 text-xs">{run.trigger_type}</td>
                <td className="py-3 pr-3 text-xs">{run.mode ?? 'run'}</td>
                <td className="py-3 pr-3 text-xs">{run.attempt}</td>
                <td className="py-3 pr-3 text-xs font-bold capitalize">{run.status}</td>
                <td className="py-3 pr-3 text-xs">
                  {run.started_at ? new Date(run.started_at).toLocaleDateString(locale, { dateStyle: 'long' }) : '-'}
                </td>
                <td className="py-3 pr-3 text-xs text-red-600">
                  {run.error_message ?? '-'}
                  {run.failure_reason ? ` (${run.failure_reason})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-xl border border-black/10 px-4 py-2 text-xs font-bold transition-colors hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          {text.previous}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">
            {currentPage} / {totalPages || 1}
          </span>
        </div>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-xl border border-black/10 px-4 py-2 text-xs font-bold transition-colors hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          {text.next}
        </button>
      </div>
    </section>
  );
}

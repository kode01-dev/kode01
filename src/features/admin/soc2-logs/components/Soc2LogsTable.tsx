'use client';

import { useTranslations } from 'next-intl';
import { LogRow } from '../types';

interface Soc2LogsTableProps {
  rows: LogRow[];
  profileMap: Map<string, string>;
  locale: string;
  timeZone?: string;
  error?: boolean;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(explicitTimeZone?: string): string {
  const configuredDefault = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE?.trim();
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const candidates = [
    explicitTimeZone?.trim(),
    configuredDefault,
    browserTimeZone?.trim(),
    'UTC',
  ];

  for (const candidate of candidates) {
    if (candidate && isValidTimeZone(candidate)) {
      return candidate;
    }
  }

  return 'UTC';
}

export function Soc2LogsTable({ rows, profileMap, locale, timeZone, error }: Soc2LogsTableProps) {
  const t = useTranslations('admin.soc2_logs.table');
  const resolvedTimeZone = resolveTimeZone(timeZone);

  function toText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function formatDateTime(value: string, locale: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    
    return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: resolvedTimeZone,
    }).format(date);
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-kode01-sauge/20 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-kode01-sauge/20 bg-kode01-sauge/5">
          <tr className="text-xs uppercase tracking-widest text-kode01-noir/60">
            <th className="px-4 py-3">{t('time')}</th>
            <th className="px-4 py-3">{t('event')}</th>
            <th className="px-4 py-3">{t('user')}</th>
            <th className="px-4 py-3">{t('ip')}</th>
            <th className="px-4 py-3">{t('details')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-kode01-sauge/10 align-top hover:bg-kode01-sauge/5 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap text-kode01-noir/70">
                {formatDateTime(row.created_at, locale)}
              </td>
              <td className="px-4 py-3 font-bold text-kode01-noir">{row.event_type}</td>
              <td className="px-4 py-3 text-kode01-noir/80">
                {row.user_id ? (profileMap.get(row.user_id) ?? row.user_id.slice(0, 8)) : '-'}
              </td>
              <td className="px-4 py-3 text-kode01-noir/80">{row.ip_address ?? '-'}</td>
              <td className="px-4 py-3 max-w-[560px]">
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-kode01-sauge/5 p-2 text-xs text-kode01-noir/80">
                  {toText(row.metadata) || (row.user_agent ?? '-')}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-6 text-sm text-kode01-noir/60">
          {error ? t('load_error') : t('no_logs')}
        </div>
      )}
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';

interface Soc2LogsFiltersProps {
  locale: string;
  defaultValues: {
    q?: string;
    event?: string;
    user?: string;
    from?: string;
    to?: string;
    exact?: boolean;
  };
}

export function Soc2LogsFilters({ locale, defaultValues }: Soc2LogsFiltersProps) {
  const t = useTranslations('admin.soc2_logs.filters');

  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-3 rounded-3xl border border-kode01-sauge/20 bg-white p-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <input
        type="text"
        name="q"
        defaultValue={defaultValues.q}
        placeholder={t('global_search')}
        className="h-11 rounded-2xl border border-kode01-sauge/30 bg-kode01-white px-4 text-sm focus:border-kode01-sauge focus:outline-none transition-colors"
      />
      <input
        type="text"
        name="event"
        defaultValue={defaultValues.event}
        placeholder={t('event_type')}
        className="h-11 rounded-2xl border border-kode01-sauge/30 bg-kode01-white px-4 text-sm focus:border-kode01-sauge focus:outline-none transition-colors"
      />
      <input
        type="text"
        name="user"
        defaultValue={defaultValues.user}
        placeholder={t('user_id')}
        className="h-11 rounded-2xl border border-kode01-sauge/30 bg-kode01-white px-4 text-sm focus:border-kode01-sauge focus:outline-none transition-colors"
      />
      <input
        type="date"
        name="from"
        defaultValue={defaultValues.from}
        className="h-11 rounded-2xl border border-kode01-sauge/30 bg-kode01-white px-4 text-sm focus:border-kode01-sauge focus:outline-none transition-colors"
      />
      <input
        type="date"
        name="to"
        defaultValue={defaultValues.to}
        className="h-11 rounded-2xl border border-kode01-sauge/30 bg-kode01-white px-4 text-sm focus:border-kode01-sauge focus:outline-none transition-colors"
      />
      <label className="flex h-11 items-center gap-2 rounded-2xl border border-kode01-sauge/30 bg-kode01-white px-4 text-sm text-kode01-noir/80 cursor-pointer hover:bg-kode01-sauge/5 transition-colors">
        <input
          type="checkbox"
          name="exact"
          value="1"
          defaultChecked={defaultValues.exact}
          className="rounded border-kode01-sauge/30 text-kode01-noir focus:ring-kode01-sauge/50"
        />
        {t('exact_type')}
      </label>
      <button
        type="submit"
        className="h-11 rounded-2xl bg-kode01-noir px-4 text-xs font-bold uppercase tracking-widest text-kode01-white hover:bg-kode01-noir/90 transition-colors"
      >
        {t('submit')}
      </button>
      <a
        href={`/${locale}/admin/logs`}
        className="inline-flex h-11 items-center justify-center rounded-2xl border border-kode01-sauge/30 px-4 text-xs font-bold uppercase tracking-widest text-kode01-noir/70 hover:bg-kode01-sauge/5 transition-colors"
      >
        {t('reset')}
      </a>
    </form>
  );
}

'use client';

import { useCallback } from 'react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { replaceHistoryNoScrollOptions } from '@/lib/url-query/parsers';

interface SortSelectProps {
  labels: { newest: string; oldest: string };
}

const sortValues = ['newest', 'oldest'] as const;

export function SortSelect({ labels }: SortSelectProps) {
  const [current, setCurrent] = useQueryState(
    'sort',
    parseAsStringLiteral(sortValues)
      .withDefault('newest')
      .withOptions({
        ...replaceHistoryNoScrollOptions,
        shallow: false,
      }),
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as (typeof sortValues)[number];
      void setCurrent(value === 'newest' ? null : value);
    },
    [setCurrent],
  );

  return (
    <select
      value={current}
      onChange={handleChange}
      className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-bold uppercase tracking-widest text-kode01-noir/70 outline-none cursor-pointer transition-colors hover:border-black/20 focus:border-black/20"
    >
      <option value="newest">{labels.newest}</option>
      <option value="oldest">{labels.oldest}</option>
    </select>
  );
}

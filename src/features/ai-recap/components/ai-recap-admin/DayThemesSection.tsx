'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AiRecapAdminText } from './text';
import type { DayThemeItem, SourceItem } from './types';

type DayThemesSectionProps = {
  text: AiRecapAdminText;
  sources: SourceItem[];
  locale: string;
};

const DAY_LABELS_EN = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_LABELS_FR = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

export function DayThemesSection({ text, sources, locale }: DayThemesSectionProps) {
  const [themes, setThemes] = useState<DayThemeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const isFr = locale.toLowerCase().startsWith('fr');
  const dayLabels = isFr ? DAY_LABELS_FR : DAY_LABELS_EN;

  const fetchThemes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/day-themes');
      if (res.ok) {
        const json = await res.json();
        setThemes(json.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchThemes(); }, [fetchThemes]);

  const updateTheme = async (dayIndex: number, updates: Partial<DayThemeItem>) => {
    setSaving(dayIndex);
    try {
      const res = await fetch('/api/admin/weekly-ai-recap/day-themes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_index: dayIndex, ...updates }),
      });
      if (res.ok) {
        const json = await res.json();
        setThemes((prev) => prev.map((t) => (t.day_index === dayIndex ? json.data : t)));
      }
    } catch {
      // silent
    } finally {
      setSaving(null);
    }
  };

  const toggleSource = (theme: DayThemeItem, sourceId: string) => {
    const current = new Set(theme.source_ids);
    if (current.has(sourceId)) {
      current.delete(sourceId);
    } else {
      current.add(sourceId);
    }
    updateTheme(theme.day_index, { source_ids: Array.from(current) });
  };

  if (loading) {
    return (
      <section className="rounded-3xl border border-black/5 bg-white p-6">
        <h2 className="text-xl font-serif font-black">{text.dayThemes}</h2>
        <p className="mt-4 text-sm text-kode01-noir/50">Loading...</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-6">
      <h2 className="text-xl font-serif font-black">{text.dayThemes}</h2>
      <p className="mt-2 text-sm text-kode01-noir/60">{text.dayThemesHint}</p>

      <div className="mt-5 space-y-4">
        {themes.map((theme) => (
          <div key={theme.day_index} className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
                  {dayLabels[theme.day_index]} — {isFr ? theme.theme_name_fr : theme.theme_name_en}
                </p>
                <p className="mt-1 text-sm text-kode01-noir/60">
                  {isFr ? theme.theme_description_fr : theme.theme_description_en}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={theme.is_active}
                    onChange={() => updateTheme(theme.day_index, { is_active: !theme.is_active })}
                  />
                  {text.active}
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={theme.skip_if_quiet}
                    onChange={() => updateTheme(theme.day_index, { skip_if_quiet: !theme.skip_if_quiet })}
                  />
                  {text.skipIfQuiet}
                </label>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {sources.map((source) => {
                const isSelected = theme.source_ids.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    disabled={saving === theme.day_index}
                    onClick={() => toggleSource(theme, source.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                      isSelected
                        ? 'bg-kode01-noir text-white'
                        : 'bg-kode01-cream text-kode01-noir/50 hover:bg-kode01-noir/10'
                    } disabled:opacity-50`}
                  >
                    {source.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

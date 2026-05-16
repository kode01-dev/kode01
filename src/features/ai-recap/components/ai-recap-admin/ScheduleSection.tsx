import type { Dispatch, SetStateAction } from 'react';
import type { AiRecapAdminText } from './text';
import type { ScheduleItem } from './types';

type SlotKey = 'a' | 'b' | 'c' | 'd' | 'e';

type ScheduleSectionProps = {
  text: AiRecapAdminText;
  schedule: ScheduleItem;
  setSchedule: Dispatch<SetStateAction<ScheduleItem>>;
  isBusy: boolean;
  onSaveSchedule: () => void;
};

const SLOT_KEYS: SlotKey[] = ['a', 'b', 'c', 'd', 'e'];
const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];
const MINUTE_OPTIONS = [0, 15, 30, 45];
const DEFAULT_SLOT_VALUES: Record<SlotKey, { day: number; hour: number; minute: number }> = {
  a: { day: 1, hour: 6, minute: 0 },
  b: { day: 2, hour: 6, minute: 0 },
  c: { day: 3, hour: 6, minute: 0 },
  d: { day: 4, hour: 6, minute: 0 },
  e: { day: 5, hour: 6, minute: 0 },
};

function getSlotValue(schedule: ScheduleItem, key: SlotKey, field: 'day' | 'hour' | 'minute') {
  return (schedule[`slot_${key}_${field}` as keyof ScheduleItem] as number | null) ?? DEFAULT_SLOT_VALUES[key][field];
}

function setSlotValue(
  setSchedule: Dispatch<SetStateAction<ScheduleItem>>,
  key: SlotKey,
  field: 'day' | 'hour' | 'minute',
  value: number,
) {
  setSchedule((prev) => ({
    ...prev,
    [`slot_${key}_${field}`]: value,
  }));
}

export function ScheduleSection({
  text,
  schedule,
  setSchedule,
  isBusy,
  onSaveSchedule,
}: ScheduleSectionProps) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-6">
      <h2 className="text-xl font-serif font-black">{text.automationSchedule}</h2>
      <p className="mt-2 text-sm text-kode01-noir/60">{text.automationScheduleHint}</p>

      <div className="mt-5 flex items-center gap-4">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={schedule.is_enabled}
            onChange={(event) => setSchedule((prev) => ({ ...prev, is_enabled: event.target.checked }))}
          />
          {text.enabled}
        </label>
      </div>

      <label className="mt-5 block text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
        {text.timezone}
        <input
          value={schedule.timezone}
          onChange={(event) => setSchedule((prev) => ({ ...prev, timezone: event.target.value }))}
          className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold normal-case tracking-normal"
          placeholder="America/Toronto"
        />
      </label>

      <div className="mt-5 grid gap-3 lg:grid-cols-5">
        {SLOT_KEYS.map((key, index) => (
          <div key={key} className="rounded-2xl border border-black/10 p-3">
            <div className="text-xs font-black uppercase tracking-widest text-kode01-noir/50">
              {text.slotLabel(index + 1)}
            </div>
            <label className="mt-3 block text-xs font-semibold text-kode01-noir/60">
              {text.day}
              <select
                value={getSlotValue(schedule, key, 'day')}
                onChange={(event) => setSlotValue(setSchedule, key, 'day', Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-black/10 px-2 py-2 text-sm font-semibold text-kode01-noir"
              >
                {DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-kode01-noir/60">
                {text.hour}
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={getSlotValue(schedule, key, 'hour')}
                  onChange={(event) => setSlotValue(setSchedule, key, 'hour', Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-2 py-2 text-sm font-semibold text-kode01-noir"
                />
              </label>
              <label className="block text-xs font-semibold text-kode01-noir/60">
                {text.minute}
                <select
                  value={getSlotValue(schedule, key, 'minute')}
                  onChange={(event) => setSlotValue(setSchedule, key, 'minute', Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-black/10 px-2 py-2 text-sm font-semibold text-kode01-noir"
                >
                  {MINUTE_OPTIONS.map((minute) => (
                    <option key={minute} value={minute}>
                      {String(minute).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <button
          type="button"
          disabled={isBusy}
          onClick={onSaveSchedule}
          className="rounded-full bg-kode01-noir px-5 py-2 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
        >
          {text.saveSchedule}
        </button>
      </div>
    </section>
  );
}

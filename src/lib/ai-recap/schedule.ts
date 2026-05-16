export type AiRecapScheduleSlotKey = 'a' | 'b' | 'c' | 'd' | 'e';

export type AiRecapScheduleSlot = {
  key: AiRecapScheduleSlotKey;
  day: number;
  hour: number;
  minute: number;
};

export const AI_RECAP_SCHEDULE_SLOT_KEYS: AiRecapScheduleSlotKey[] = ['a', 'b', 'c', 'd', 'e'];

const ALLOWED_MINUTES = new Set([0, 15, 30, 45]);

function parseInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

export function isValidAiRecapScheduleSlot(value: Pick<AiRecapScheduleSlot, 'day' | 'hour' | 'minute'>) {
  return (
    Number.isInteger(value.day) &&
    value.day >= 0 &&
    value.day <= 6 &&
    Number.isInteger(value.hour) &&
    value.hour >= 0 &&
    value.hour <= 23 &&
    Number.isInteger(value.minute) &&
    ALLOWED_MINUTES.has(value.minute)
  );
}

export function parseAiRecapScheduleSlotPayload(payload: unknown, key: AiRecapScheduleSlotKey) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const day = parseInteger(record[`slot_${key}_day`]);
  const hour = parseInteger(record[`slot_${key}_hour`]);
  const minute = parseInteger(record[`slot_${key}_minute`]);

  if (day === null && hour === null && minute === null) {
    return null;
  }

  if (day === null || hour === null || minute === null) {
    return { key, error: `slot_${key} requires day, hour and minute` as const };
  }

  const slot = { key, day, hour, minute };
  if (!isValidAiRecapScheduleSlot(slot)) {
    return { key, error: `slot_${key} is invalid` as const };
  }

  return { key, slot };
}

export function scheduleSlotUpdateFields(slot: AiRecapScheduleSlot) {
  return {
    [`slot_${slot.key}_day`]: slot.day,
    [`slot_${slot.key}_hour`]: slot.hour,
    [`slot_${slot.key}_minute`]: slot.minute,
  };
}

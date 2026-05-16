import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidAiRecapScheduleSlot,
  parseAiRecapScheduleSlotPayload,
  scheduleSlotUpdateFields,
} from '@/lib/ai-recap/schedule';

test('AI recap schedule slot validation accepts production slot minutes', () => {
  assert.equal(isValidAiRecapScheduleSlot({ day: 1, hour: 6, minute: 0 }), true);
  assert.equal(isValidAiRecapScheduleSlot({ day: 5, hour: 23, minute: 45 }), true);
});

test('AI recap schedule slot validation rejects invalid ranges', () => {
  assert.equal(isValidAiRecapScheduleSlot({ day: 7, hour: 6, minute: 0 }), false);
  assert.equal(isValidAiRecapScheduleSlot({ day: 1, hour: 24, minute: 0 }), false);
  assert.equal(isValidAiRecapScheduleSlot({ day: 1, hour: 6, minute: 10 }), false);
});

test('parseAiRecapScheduleSlotPayload ignores absent slots', () => {
  assert.equal(parseAiRecapScheduleSlotPayload({ timezone: 'America/Toronto' }, 'a'), null);
});

test('parseAiRecapScheduleSlotPayload requires complete slot triples', () => {
  const parsed = parseAiRecapScheduleSlotPayload({ slot_a_day: 1, slot_a_hour: 6 }, 'a');
  assert.deepEqual(parsed, { key: 'a', error: 'slot_a requires day, hour and minute' });
});

test('parseAiRecapScheduleSlotPayload returns update-ready valid slots', () => {
  const parsed = parseAiRecapScheduleSlotPayload(
    {
      slot_c_day: '3',
      slot_c_hour: '12',
      slot_c_minute: '30',
    },
    'c',
  );

  assert.deepEqual(parsed, {
    key: 'c',
    slot: { key: 'c', day: 3, hour: 12, minute: 30 },
  });
  assert.deepEqual(scheduleSlotUpdateFields({ key: 'c', day: 3, hour: 12, minute: 30 }), {
    slot_c_day: 3,
    slot_c_hour: 12,
    slot_c_minute: 30,
  });
});

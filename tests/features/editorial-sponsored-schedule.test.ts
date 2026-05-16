import assert from 'node:assert/strict';
import test from 'node:test';
import { computeNextSponsoredPublishAt } from '@/features/editorial/server/sponsored-schedule';

function getTorontoHourMinute(dateIso: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(dateIso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

test('computeNextSponsoredPublishAt returns 09:00 America/Toronto when current local time is before 09:00', () => {
  const now = new Date('2026-03-15T10:00:00.000Z');
  const next = computeNextSponsoredPublishAt(now);
  const local = getTorontoHourMinute(next);

  assert.equal(local.hour, 9);
  assert.equal(local.minute, 0);
  assert.equal(new Date(next).getTime() > now.getTime(), true);
});

test('computeNextSponsoredPublishAt rolls to next day when current local time is after 09:00', () => {
  const now = new Date('2026-03-15T16:00:00.000Z');
  const next = computeNextSponsoredPublishAt(now);
  const local = getTorontoHourMinute(next);

  assert.equal(local.hour, 9);
  assert.equal(local.minute, 0);
  assert.equal(new Date(next).getTime() > now.getTime(), true);
});

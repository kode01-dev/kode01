export const SPONSORED_EDITORIAL_TIMEZONE = 'America/Toronto';
export const SPONSORED_EDITORIAL_PUBLISH_HOUR = 9;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parsed = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: Number(parsed.year ?? '0'),
    month: Number(parsed.month ?? '1'),
    day: Number(parsed.day ?? '1'),
    hour: Number(parsed.hour ?? '0'),
    minute: Number(parsed.minute ?? '0'),
    second: Number(parsed.second ?? '0'),
  };
}

function zonedDateTimeToUtcDate(
  parts: ZonedDateParts,
  timeZone: string,
): Date {
  // Start from an UTC guess with the same wall-clock fields, then iteratively
  // correct until the target timezone wall-clock matches.
  const targetMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = new Date(targetMs);

  for (let i = 0; i < 6; i += 1) {
    const current = getZonedDateParts(candidate, timeZone);
    const currentMs = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    );
    const deltaMs = targetMs - currentMs;
    if (Math.abs(deltaMs) < 1_000) {
      break;
    }
    candidate = new Date(candidate.getTime() + deltaMs);
  }

  return candidate;
}

export function computeNextSponsoredPublishAt(now = new Date()): string {
  for (let dayOffset = 0; dayOffset < 4; dayOffset += 1) {
    const probe = new Date(now.getTime() + (dayOffset * 24 * 60 * 60 * 1_000));
    const local = getZonedDateParts(probe, SPONSORED_EDITORIAL_TIMEZONE);
    const candidate = zonedDateTimeToUtcDate(
      {
        year: local.year,
        month: local.month,
        day: local.day,
        hour: SPONSORED_EDITORIAL_PUBLISH_HOUR,
        minute: 0,
        second: 0,
      },
      SPONSORED_EDITORIAL_TIMEZONE,
    );

    if (candidate.getTime() > now.getTime()) {
      return candidate.toISOString();
    }
  }

  const fallback = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  return fallback.toISOString();
}

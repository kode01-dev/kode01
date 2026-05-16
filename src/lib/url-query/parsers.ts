import {
  createParser,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';

export const replaceHistoryOptions = { history: 'replace' } as const;
export const replaceHistoryNoScrollOptions = { history: 'replace', scroll: false } as const;

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const csvListParser = createParser<string[]>({
  parse(value) {
    if (!value) return [];
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  },
  serialize(value) {
    return value
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(',');
  },
  eq: areStringArraysEqual,
});

export function parseAsCsvListParam(defaultValue: string[] = []) {
  return csvListParser.withDefault(defaultValue);
}

export function parseAsIntParam(defaultValue: number) {
  return parseAsInteger.withDefault(defaultValue);
}

export function parseAsStringParam(defaultValue = '') {
  return parseAsString.withDefault(defaultValue);
}

export function parseAsEnumParam<const Literal extends string>(
  values: readonly Literal[],
  defaultValue: Literal,
) {
  return parseAsStringLiteral(values).withDefault(defaultValue);
}

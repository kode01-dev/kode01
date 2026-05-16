import { createParser, parseAsInteger, parseAsString } from 'nuqs';

import { parseAsCsvListParam, parseAsEnumParam } from '@/lib/url-query/parsers';

import { MARKET_TYPE_OPTIONS, SORT_OPTIONS } from './market-types';

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

const subcategoryListParser = createParser<string[]>({
  parse(value) {
    if (!value) return [];
    return value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  },
  serialize(value) {
    return value
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .join(',');
  },
  eq: areStringArraysEqual,
}).withDefault([]);

export const marketFilterParsers = {
  search: parseAsString.withDefault(''),
  category: parseAsString.withDefault(''),
  subcategories: subcategoryListParser,
  tags: parseAsCsvListParam(),
  sort: parseAsEnumParam(SORT_OPTIONS, 'newest'),
  type: parseAsEnumParam(MARKET_TYPE_OPTIONS, 'all'),
  price_min: parseAsInteger.withDefault(0),
  price_max: parseAsInteger.withDefault(0),
};

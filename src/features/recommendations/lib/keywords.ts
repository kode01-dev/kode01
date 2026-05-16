import { tokenizeSearchQuery } from '@/lib/search';

const MAX_KEYWORDS = 24;

export function extractKeywordTokens(values: Array<string | null | undefined>): string[] {
  const tokenSet = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const token of tokenizeSearchQuery(value)) {
      if (token.length < 2) continue;
      tokenSet.add(token);
      if (tokenSet.size >= MAX_KEYWORDS) {
        return Array.from(tokenSet);
      }
    }
  }

  return Array.from(tokenSet);
}


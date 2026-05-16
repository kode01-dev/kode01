export interface WeightedSearchField {
    value: string | null | undefined;
    weight: number;
}

const DIACRITIC_REGEX = /[\u0300-\u036f]/g;
const NON_ALNUM_REGEX = /[^a-z0-9\s-]/g;
const MULTI_SPACE_REGEX = /\s+/g;

export function normalizeSearchText(value: string): string {
    return value
        .normalize('NFD')
        .replace(DIACRITIC_REGEX, '')
        .toLowerCase()
        .replace(NON_ALNUM_REGEX, ' ')
        .replace(MULTI_SPACE_REGEX, ' ')
        .trim();
}

export function tokenizeSearchQuery(query: string): string[] {
    const normalized = normalizeSearchText(query);
    if (!normalized) return [];

    return normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}

function levenshteinWithin(a: string, b: string, maxDistance: number): boolean {
    const aLen = a.length;
    const bLen = b.length;
    const diff = Math.abs(aLen - bLen);
    if (diff > maxDistance) return false;

    const prevRow = new Array<number>(bLen + 1);
    const currRow = new Array<number>(bLen + 1);

    for (let j = 0; j <= bLen; j += 1) {
        prevRow[j] = j;
    }

    for (let i = 1; i <= aLen; i += 1) {
        currRow[0] = i;
        let rowMin = currRow[0];

        for (let j = 1; j <= bLen; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const deletion = prevRow[j] + 1;
            const insertion = currRow[j - 1] + 1;
            const substitution = prevRow[j - 1] + cost;

            const value = Math.min(deletion, insertion, substitution);
            currRow[j] = value;
            if (value < rowMin) rowMin = value;
        }

        if (rowMin > maxDistance) return false;

        for (let j = 0; j <= bLen; j += 1) {
            prevRow[j] = currRow[j];
        }
    }

    return prevRow[bLen] <= maxDistance;
}

function tokenFuzzyMatchScore(token: string, fieldTokens: string[]): number {
    if (token.length < 4 || fieldTokens.length === 0) return 0;

    const maxDistance = token.length >= 8 ? 2 : 1;

    for (const candidate of fieldTokens) {
        if (candidate.length < 3) continue;
        if (levenshteinWithin(token, candidate, maxDistance)) {
            return 0.58;
        }
    }

    return 0;
}

function tokenMatchScore(token: string, normalizedField: string, fieldTokens: string[]): number {
    if (!normalizedField) return 0;

    if (fieldTokens.includes(token)) return 1;
    if (normalizedField.includes(token)) return 0.82;

    return tokenFuzzyMatchScore(token, fieldTokens);
}

export function scoreSearchQuery(query: string, fields: WeightedSearchField[]): number | null {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return 0;

    const queryTokens = tokenizeSearchQuery(normalizedQuery);
    if (queryTokens.length === 0) return 0;

    const preparedFields = fields
        .map((field) => {
            const normalizedValue = normalizeSearchText(field.value ?? '');
            return {
                weight: field.weight,
                value: normalizedValue,
                tokens: normalizedValue ? normalizedValue.split(' ') : [],
            };
        })
        .filter((field) => field.value.length > 0);

    if (preparedFields.length === 0) return null;

    let score = 0;

    for (const token of queryTokens) {
        let bestTokenScore = 0;

        for (const field of preparedFields) {
            const matchScore = tokenMatchScore(token, field.value, field.tokens);
            if (matchScore <= 0) continue;

            const weightedScore = matchScore * field.weight;
            if (weightedScore > bestTokenScore) {
                bestTokenScore = weightedScore;
            }
        }

        if (bestTokenScore <= 0) return null;
        score += bestTokenScore;
    }

    if (queryTokens.length > 1) {
        const phraseMatch = preparedFields.some((field) => field.value.includes(normalizedQuery));
        if (phraseMatch) {
            score += 0.75;
        }
    }

    return score;
}

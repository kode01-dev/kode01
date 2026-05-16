export function normalizeEnvValue(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        const unquoted = trimmed.slice(1, -1).trim();
        return unquoted || undefined;
    }

    return trimmed;
}


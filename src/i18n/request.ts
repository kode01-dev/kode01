import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type IntlMessages = Record<string, unknown>;

function normalizeMessages(messages: IntlMessages): IntlMessages {
    const layoutNamespace = messages.layout;
    if (!layoutNamespace || typeof layoutNamespace !== 'object' || Array.isArray(layoutNamespace)) {
        return messages;
    }

    const layoutMessages = layoutNamespace as IntlMessages;
    const shouldHoist = Object.keys(layoutMessages).some(
        (namespace) =>
            messages[namespace] === undefined &&
            !['nav', 'search', 'footer'].includes(namespace),
    );

    if (!shouldHoist) {
        return messages;
    }

    const hoistedNamespaces = Object.fromEntries(
        Object.entries(layoutMessages).filter(
            ([namespace]) =>
                messages[namespace] === undefined &&
                !['nav', 'search', 'footer'].includes(namespace),
        ),
    );

    return {
        ...messages,
        ...hoistedNamespaces,
    };
}

export default getRequestConfig(async ({ requestLocale }) => {
    let locale = await requestLocale;
    if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
        locale = routing.defaultLocale;
    }

    const importedMessages = (await import(`../../messages/${locale}.json`)).default as IntlMessages;

    return {
        locale,
        messages: normalizeMessages(importedMessages),
    };
});

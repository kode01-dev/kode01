'use client';

import { useLocale } from 'next-intl';
import { createContext } from 'react';

interface LanguageContextValue {
    language: string;
}

const LanguageContext = createContext<LanguageContextValue>({ language: 'en' });

export function useLanguage(): LanguageContextValue {
    const locale = useLocale();
    return { language: locale };
}

export { LanguageContext };

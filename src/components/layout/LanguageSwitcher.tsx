'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useTransition } from 'react';

export type LanguageSwitcherLocalePathnames = Partial<Record<'en' | 'fr', string>>;

export function LanguageSwitcher({
    isScrolled,
    localePathnames,
}: {
    isScrolled?: boolean;
    localePathnames?: LanguageSwitcherLocalePathnames;
}) {
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();

    const nextLocale = locale === 'en' ? 'fr' : 'en';
    const nextPathname = localePathnames?.[nextLocale] ?? pathname;

    const toggleLocale = () => {
        startTransition(() => {
            router.replace(nextPathname, { locale: nextLocale });
        });
    };

    return (
        <button
            onClick={toggleLocale}
            disabled={isPending}
            suppressHydrationWarning
            className={cn(
                "flex items-center gap-1 font-sans font-bold text-sm tracking-widest cursor-pointer transition-colors border-none bg-transparent p-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kode01-pink",
                isScrolled ? "text-white" : "text-kode01-noir",
                isPending && "opacity-50"
            )}
            aria-label={locale === 'en' ? "Passer en français" : "Switch to English"}
            title={locale === 'en' ? "Passer en français" : "Switch to English"}
        >
            <span className="transition-opacity uppercase">{nextLocale}</span>
        </button>
    );
}

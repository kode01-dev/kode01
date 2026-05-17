import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Fraunces, DM_Sans } from "next/font/google";
import Script from 'next/script';
import { SpeedInsights } from '@vercel/speed-insights/next';
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { routing } from '@/i18n/routing';
import Providers from '@/components/Providers';
import { createClient } from '@/lib/supabase/server';
import { isAdminRole } from '@/lib/auth/roles';
import { getLockscreenConfig } from '@/features/site-lockscreen/lib/lockscreen-server';
import type { LockscreenConfig } from '@/features/site-lockscreen/types';

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}
import CookieConsentComponent from '@/features/cookies/CookieConsent';
import GoogleConsentModeBootstrap from '@/features/cookies/GoogleConsentModeBootstrap';
import GoogleAnalytics from '@/features/cookies/GoogleAnalytics';
import Honeypot from '@/components/security/Honeypot';

const isProduction = process.env.NODE_ENV === 'production';
const HYDRATION_EXTENSION_ATTRS = ['data-jetski-tab-id', 'fdprocessedid'] as const;

const inter = Inter({ subsets: ["latin"], display: 'swap' });
const outfit = Outfit({
    subsets: ["latin"],
    weight: ["400", "500", "800", "900"],
    variable: "--font-outfit",
    display: 'swap',
});

const fraunces = Fraunces({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800", "900"],
    variable: "--font-fraunces",
    display: 'swap',
});

const dmSans = DM_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "700"],
    variable: "--font-dm-sans",
    display: 'swap',
});

function hasSupabaseAuthCookie(cookieEntries: Array<{ name: string }>): boolean {
    return cookieEntries.some(
        (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'),
    );
}

function getSupabaseOriginFromEnv(): string | null {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!rawUrl) return null;

    try {
        return new URL(rawUrl).origin;
    } catch (error) {
        console.error('Invalid NEXT_PUBLIC_SUPABASE_URL in layout render:', error);
        return null;
    }
}

async function getInitialLockscreenState(): Promise<{ locked: boolean; config: LockscreenConfig | null }> {
    try {
        const config = await getLockscreenConfig();
        if (!config?.is_enabled) {
            return { locked: false, config: null };
        }

        const cookieStore = await cookies();
        const unlocked = cookieStore.get('lockscreen_unlocked')?.value === 'true';

        if (unlocked) {
            return { locked: false, config: null };
        }

        if (!hasSupabaseAuthCookie(cookieStore.getAll())) {
            return { locked: true, config };
        }

        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .maybeSingle();

            if (isAdminRole(profile?.role)) {
                return { locked: false, config: null };
            }
        }

        return { locked: true, config };
    } catch (error) {
        console.error('Error building initial lockscreen state:', error);
        return { locked: false, config: null };
    }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'seo.layout' });
    return {
        title: {
            template: '%s | KODE01',
            default: t('default_title'),
        },
        metadataBase: new URL('https://kode01.com'),
        description: t('description'),
        openGraph: {
            title: 'KODE01',
            description: t('og_description'),
            url: 'https://kode01.com',
            siteName: 'KODE01',
            locale: locale === 'fr' ? 'fr_CA' : 'en_CA',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: 'KODE01',
            description: t('og_description'),
        },
        icons: {
            icon: '/favicon.png',
            shortcut: '/favicon.png',
            apple: '/favicon.png',
        },
    };
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default async function LocaleLayout(
    props: {
        children: React.ReactNode;
        params: Promise<{ locale: string }>;
    }
) {
    const params = await props.params;

    const {
        locale
    } = params;

    const {
        children
    } = props;

    // Ensure that the incoming `locale` is valid
    if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
        notFound();
    }

    // Providing all messages to the client
    const messages = await getMessages();
    const lockscreenInitialState = await getInitialLockscreenState();

    const supabaseOrigin = getSupabaseOriginFromEnv();

    return (
        <html lang={locale} suppressHydrationWarning>
            <head>
                {supabaseOrigin && (
                    <>
                        <link rel="preconnect" href={supabaseOrigin} />
                        <link rel="dns-prefetch" href={supabaseOrigin} />
                    </>
                )}
            </head>
            <body
                suppressHydrationWarning
                className={`${inter.className} ${outfit.variable} ${fraunces.variable} ${dmSans.variable}`}
            >
                <Script id="hydrate-attr-sanitizer" strategy="beforeInteractive">
                    {`(() => {
  const attrs = ${JSON.stringify(HYDRATION_EXTENSION_ATTRS)};
  const html = document.documentElement;
  const body = document.body;

  const clean = () => {
    for (const attr of attrs) {
      if (html?.hasAttribute(attr)) html.removeAttribute(attr);
      if (body?.hasAttribute(attr)) body.removeAttribute(attr);

      const nodes = document.querySelectorAll('[' + attr + ']');
      for (const node of nodes) {
        node.removeAttribute(attr);
      }
    }
  };

  clean();

  const observer = new MutationObserver(() => clean());
  observer.observe(html, {
    attributes: true,
    attributeFilter: attrs,
    subtree: true,
  });

  window.addEventListener(
    'DOMContentLoaded',
    () => {
      setTimeout(() => observer.disconnect(), 3000);
    },
    { once: true }
  );
})();`}
                </Script>
                <GoogleConsentModeBootstrap />
                <GoogleAnalytics />
                <NextIntlClientProvider messages={messages}>
                    <Providers lockscreenInitialState={lockscreenInitialState}>
                        {children}
                        <CookieConsentComponent />
                        <Honeypot />
                    </Providers>
                </NextIntlClientProvider>
                {isProduction && <SpeedInsights />}
            </body>
        </html>
    );
}

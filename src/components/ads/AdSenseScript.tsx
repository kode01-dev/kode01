'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import {
    COOKIE_CONSENT_CHANGED_EVENT,
    hasMarketingConsentInBrowser,
} from '@/features/cookies/lib/consent';

export function AdSenseScript() {
    const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
    const [hasMarketingConsent, setHasMarketingConsent] = useState<boolean>(() =>
        hasMarketingConsentInBrowser(),
    );

    useEffect(() => {
        const listener = () => setHasMarketingConsent(hasMarketingConsentInBrowser());
        window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener);
        return () => {
            window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener);
        };
    }, []);

    if (!clientId || !hasMarketingConsent) return null;

    return (
        <Script
            id="adsense-id"
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
            strategy="afterInteractive"
            crossOrigin="anonymous"
        />
    );
}

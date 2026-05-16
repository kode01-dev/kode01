'use client';

import { useSyncExternalStore } from 'react';
import Script from 'next/script';
import {
    COOKIE_CONSENT_CHANGED_EVENT,
    hasAnalyticsConsentInBrowser,
} from './lib/consent';

const GA_MEASUREMENT_ID = 'G-W23SGGLGD3';

function subscribeToCookieConsentChanges(callback: () => void) {
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
    return () => {
        window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
    };
}

function getServerAnalyticsConsentSnapshot() {
    return false;
}

export default function GoogleAnalytics() {
    const analyticsGranted = useSyncExternalStore(
        subscribeToCookieConsentChanges,
        hasAnalyticsConsentInBrowser,
        getServerAnalyticsConsentSnapshot,
    );

    if (!analyticsGranted) return null;

    return (
        <>
            <Script
                id="ga4-loader"
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
                {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
            </Script>
        </>
    );
}

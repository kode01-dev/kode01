'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import {
    buildGoogleConsentModeState,
    COOKIE_CONSENT_CHANGED_EVENT,
    ensureGoogleTagQueue,
    getAcceptedCategoriesFromBrowserCookie,
    getGoogleAnalyticsMeasurementId,
    hasAnalyticsConsentInBrowser,
    setGoogleAnalyticsCollectionDisabled,
    syncGoogleConsentModeFromCategories,
} from './lib/consent';

function subscribeToCookieConsentChanges(callback: () => void) {
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
    return () => {
        window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, callback);
    };
}

function getAnalyticsConsentSnapshot() {
    return Boolean(getGoogleAnalyticsMeasurementId()) && hasAnalyticsConsentInBrowser();
}

function getServerAnalyticsConsentSnapshot() {
    return false;
}

function GoogleAnalyticsPageViewTracker({
    measurementId,
    ready,
}: {
    measurementId: string;
    ready: boolean;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const lastTrackedLocationRef = useRef<string | null>(null);
    const previousLocationRef = useRef<string | null>(null);
    const search = searchParams?.toString() ?? '';

    useEffect(() => {
        if (!ready || typeof window === 'undefined' || !window.gtag) return;
        if (!hasAnalyticsConsentInBrowser()) return;

        const currentLocation = window.location.href;
        if (lastTrackedLocationRef.current === currentLocation) return;

        const acceptedCategories = getAcceptedCategoriesFromBrowserCookie();
        syncGoogleConsentModeFromCategories(acceptedCategories);
        setGoogleAnalyticsCollectionDisabled(false, measurementId);

        window.gtag('event', 'page_view', {
            page_title: document.title,
            page_location: currentLocation,
            page_referrer: previousLocationRef.current ?? document.referrer,
        });

        lastTrackedLocationRef.current = currentLocation;
        previousLocationRef.current = currentLocation;
    }, [measurementId, pathname, ready, search]);

    return null;
}

export default function GoogleAnalytics() {
    const measurementId = getGoogleAnalyticsMeasurementId();
    const [gtagReady, setGtagReady] = useState(false);
    const analyticsGranted = useSyncExternalStore(
        subscribeToCookieConsentChanges,
        getAnalyticsConsentSnapshot,
        getServerAnalyticsConsentSnapshot,
    );

    useEffect(() => {
        const acceptedCategories = getAcceptedCategoriesFromBrowserCookie();
        syncGoogleConsentModeFromCategories(acceptedCategories);
    }, [analyticsGranted]);

    if (!analyticsGranted || !measurementId) return null;

    const acceptedCategories = getAcceptedCategoriesFromBrowserCookie();
    const googleConsentState = buildGoogleConsentModeState(acceptedCategories);
    const measurementIdJson = JSON.stringify(measurementId);
    const googleConsentStateJson = JSON.stringify(googleConsentState);

    return (
        <>
            <Script
                id="ga4-loader"
                src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
                strategy="afterInteractive"
            />
            <Script
                id="ga4-init"
                strategy="afterInteractive"
                onReady={() => {
                    ensureGoogleTagQueue();
                    setGtagReady(true);
                }}
            >
                {`window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);}
gtag('consent', 'update', ${googleConsentStateJson});
window['ga-disable-' + ${measurementIdJson}] = false;
gtag('js', new Date());
gtag('config', ${measurementIdJson}, { send_page_view: false });`}
            </Script>
            <GoogleAnalyticsPageViewTracker measurementId={measurementId} ready={gtagReady} />
        </>
    );
}

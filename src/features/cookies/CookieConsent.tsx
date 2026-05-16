'use client';

import { useEffect, useRef } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';
import './cookie-consent.css';
import { useLocale, useTranslations } from 'next-intl';
import {
    cleanupOptionalBrowserStorage,
    COOKIE_CONSENT_CHANGED_EVENT,
    COOKIE_CONSENT_VERSION,
    LEGACY_COOKIE_CONSENT_CHANGED_EVENT,
    extractRejectedCategories,
    getAcceptedCategoriesFromBrowserCookie,
} from './lib/consent';
import type { CookieConsentEventType, CookieConsentSource } from './types';

function getOptionalAcceptedCount(categories: string[]) {
    return categories.filter((category) => category === 'analytics' || category === 'marketing').length;
}

export default function CookieConsentComponent() {
    const t = useTranslations('cookie_consent');
    const locale = useLocale();
    const isInitialized = useRef(false);
    const lastOptionalAcceptedCountRef = useRef<number>(0);

    useEffect(() => {
        if (isInitialized.current) return;
        isInitialized.current = true;

        const broadcastConsentChanged = (acceptedCategories: string[]) => {
            window.dispatchEvent(
                new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, {
                    detail: { acceptedCategories },
                }),
            );
            window.dispatchEvent(
                new CustomEvent(LEGACY_COOKIE_CONSENT_CHANGED_EVENT, {
                    detail: { acceptedCategories },
                }),
            );
        };

        const trackConsentEvent = async (eventType: CookieConsentEventType, source: CookieConsentSource) => {
            const acceptedCategories = getAcceptedCategoriesFromBrowserCookie();
            if (!acceptedCategories.includes('necessary')) {
                acceptedCategories.push('necessary');
            }
            const rejectedCategories = extractRejectedCategories(acceptedCategories);

            cleanupOptionalBrowserStorage(acceptedCategories);
            lastOptionalAcceptedCountRef.current = getOptionalAcceptedCount(acceptedCategories);
            broadcastConsentChanged(acceptedCategories);

            try {
                await fetch('/api/cookies/consent-event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        eventType,
                        acceptedCategories,
                        rejectedCategories,
                        source,
                        consentVersion: COOKIE_CONSENT_VERSION,
                        locale,
                    }),
                });
            } catch (error) {
                console.error('Failed to track cookie consent event:', error);
            }
        };

        const initialAcceptedCategories = getAcceptedCategoriesFromBrowserCookie();
        cleanupOptionalBrowserStorage(initialAcceptedCategories);
        lastOptionalAcceptedCountRef.current = getOptionalAcceptedCount(initialAcceptedCategories);
        broadcastConsentChanged(initialAcceptedCategories);

        void CookieConsent.run({
            guiOptions: {
                consentModal: {
                    layout: 'box',
                    position: 'bottom right',
                    equalWeightButtons: true,
                    flipButtons: false
                },
                preferencesModal: {
                    layout: 'box',
                    position: 'right',
                    equalWeightButtons: true,
                    flipButtons: false
                }
            },
            categories: {
                necessary: {
                    readOnly: true,
                    enabled: true
                },
                analytics: {
                    enabled: false
                },
                marketing: {
                    enabled: false
                }
            },
            onFirstConsent: () => {
                void trackConsentEvent('consent_first_choice', 'banner');
            },
            onChange: () => {
                const acceptedCategories = getAcceptedCategoriesFromBrowserCookie();
                const nextOptionalCount = getOptionalAcceptedCount(acceptedCategories);
                const previousOptionalCount = lastOptionalAcceptedCountRef.current;
                const eventType: CookieConsentEventType =
                    previousOptionalCount > 0 && nextOptionalCount === 0
                        ? 'consent_withdrawn'
                        : 'consent_updated';

                void trackConsentEvent(eventType, 'preferences');
            },
            language: {
                default: 'custom',
                translations: {
                    custom: {
                        consentModal: {
                            title: t('consent_modal.title'),
                            description: t('consent_modal.description'),
                            acceptAllBtn: t('consent_modal.accept_all'),
                            acceptNecessaryBtn: t('consent_modal.accept_necessary'),
                            showPreferencesBtn: t('consent_modal.show_preferences')
                        },
                        preferencesModal: {
                            title: t('preferences_modal.title'),
                            acceptAllBtn: t('preferences_modal.accept_all'),
                            acceptNecessaryBtn: t('preferences_modal.accept_necessary'),
                            savePreferencesBtn: t('preferences_modal.save_preferences'),
                            closeIconLabel: t('preferences_modal.close_icon_label'),
                            sections: [
                                {
                                    title: t('preferences_modal.sections.visitor_notice_title'),
                                    description: t('preferences_modal.sections.visitor_notice_description')
                                },
                                {
                                    title: t('preferences_modal.sections.necessary_title'),
                                    description: t('preferences_modal.sections.necessary_description'),
                                    linkedCategory: 'necessary'
                                },
                                {
                                    title: t('preferences_modal.sections.analytics_title'),
                                    description: t('preferences_modal.sections.analytics_description'),
                                    linkedCategory: 'analytics'
                                },
                                {
                                    title: t('preferences_modal.sections.marketing_title'),
                                    description: t('preferences_modal.sections.marketing_description'),
                                    linkedCategory: 'marketing'
                                }
                            ]
                        }
                    }
                }
            }
        });

        // Expose module API to window for ManageCookiePreferencesButton.
        // CookieConsent.run() returns Promise<void>, not an API object.
        (window as Window & { CookieConsent?: typeof CookieConsent }).CookieConsent = CookieConsent;
    }, [locale, t]);

    return null;
}

'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type ZipchatApi = {
    identify: (token: string) => void;
};

type ZipchatWindow = Window & {
    Zipchat?: ZipchatApi;
};

const ZIPCHAT_IDENTIFY_ENDPOINT = '/api/zipchat/identify';
const IDENTIFY_RETRY_INTERVAL_MS = 300;
const IDENTIFY_RETRY_MAX_ATTEMPTS = 20;

function getZipchatApi(): ZipchatApi | undefined {
    return (window as ZipchatWindow).Zipchat;
}

export function ZipchatIdentifyBridge() {
    const { user, loading } = useAuth();
    const lastIdentifiedUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (loading) {
            return;
        }

        if (!user?.id) {
            lastIdentifiedUserIdRef.current = null;
            return;
        }

        if (lastIdentifiedUserIdRef.current === user.id) {
            return;
        }

        let cancelled = false;
        let retryTimer: number | undefined;

        const identifyUser = async () => {
            try {
                const response = await fetch(ZIPCHAT_IDENTIFY_ENDPOINT, {
                    method: 'GET',
                    credentials: 'include',
                });

                if (!response.ok) {
                    return;
                }

                const payload: unknown = await response.json();
                const token =
                    typeof payload === 'object' &&
                    payload !== null &&
                    'token' in payload &&
                    typeof payload.token === 'string'
                        ? payload.token
                        : null;

                if (!token || cancelled) {
                    return;
                }

                const zipchat = getZipchatApi();
                if (zipchat?.identify) {
                    zipchat.identify(token);
                    lastIdentifiedUserIdRef.current = user.id;
                    return;
                }

                let attempts = 0;
                retryTimer = window.setInterval(() => {
                    if (cancelled) {
                        if (retryTimer) {
                            window.clearInterval(retryTimer);
                        }
                        return;
                    }

                    const retryZipchat = getZipchatApi();
                    if (retryZipchat?.identify) {
                        retryZipchat.identify(token);
                        lastIdentifiedUserIdRef.current = user.id;
                        if (retryTimer) {
                            window.clearInterval(retryTimer);
                        }
                        return;
                    }

                    attempts += 1;
                    if (attempts >= IDENTIFY_RETRY_MAX_ATTEMPTS && retryTimer) {
                        window.clearInterval(retryTimer);
                    }
                }, IDENTIFY_RETRY_INTERVAL_MS);
            } catch (error) {
                console.error('Zipchat identify failed:', error);
            }
        };

        void identifyUser();

        return () => {
            cancelled = true;
            if (retryTimer) {
                window.clearInterval(retryTimer);
            }
        };
    }, [loading, user?.id]);

    return null;
}

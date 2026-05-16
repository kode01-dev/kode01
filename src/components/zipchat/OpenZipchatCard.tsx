'use client';

import { useCallback } from 'react';
import { Mail } from 'lucide-react';

type ZipchatApi = {
    open?: () => void;
    show?: () => void;
    toggle?: () => void;
};

type ZipchatWindow = Window & {
    Zipchat?: ZipchatApi;
};

const RETRY_INTERVAL_MS = 250;
const RETRY_TIMEOUT_MS = 4000;

function tryOpenZipchat(): boolean {
    const zipchat = (window as ZipchatWindow).Zipchat;
    if (zipchat?.open) {
        zipchat.open();
        return true;
    }

    if (zipchat?.show) {
        zipchat.show();
        return true;
    }

    if (zipchat?.toggle) {
        zipchat.toggle();
        return true;
    }

    return false;
}

export function OpenZipchatCard() {
    const handleOpenZipchat = useCallback(() => {
        if (tryOpenZipchat()) {
            return;
        }

        const intervalId = window.setInterval(() => {
            if (tryOpenZipchat()) {
                window.clearInterval(intervalId);
            }
        }, RETRY_INTERVAL_MS);

        window.setTimeout(() => {
            window.clearInterval(intervalId);
        }, RETRY_TIMEOUT_MS);
    }, []);

    return (
        <button
            type="button"
            onClick={handleOpenZipchat}
            className="bg-white rounded-[32px] p-10 shadow-sm border border-kode01-noir/5 hover:border-kode01-pink transition-all no-underline group text-left w-full"
            aria-label="Open Zipchat support"
        >
            <div className="w-14 h-14 bg-kode01-pink/10 rounded-2xl flex items-center justify-center mb-6 text-kode01-pink group-hover:scale-110 transition-transform">
                <Mail size={28} />
            </div>
            <h2 className="text-2xl font-serif font-black text-kode01-noir mb-2">Support</h2>
            <p className="text-kode01-noir/60">Get direct help for your account, purchases, or seller application in live chat.</p>
            <div className="mt-6 font-bold text-kode01-noir flex items-center gap-2">
                Open chat bubble
            </div>
        </button>
    );
}

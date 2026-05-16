'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function RouteScrollReset() {
    const pathname = usePathname();

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const frameId = window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [pathname]);

    return null;
}

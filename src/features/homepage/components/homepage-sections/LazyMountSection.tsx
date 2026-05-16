'use client';

import React, { useEffect, useRef, useState } from 'react';

export function LazyMountSection({
    enabled,
    fallback,
    children,
}: {
    enabled: boolean;
    fallback: React.ReactNode;
    children: React.ReactNode;
}) {
    // Keep the initial render identical on server and client to avoid hydration mismatches.
    const [shouldRender, setShouldRender] = useState(() => !enabled);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!enabled) return;
        if (shouldRender) return;
        if (typeof window === 'undefined') return;
        if (typeof window.IntersectionObserver === 'undefined') {
            const frameId = window.requestAnimationFrame(() => {
                setShouldRender(true);
            });
            return () => window.cancelAnimationFrame(frameId);
        }

        const node = containerRef.current;
        if (!node) return;

        const observer = new window.IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setShouldRender(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '300px 0px' },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [enabled, shouldRender]);

    return <div ref={containerRef}>{!enabled || shouldRender ? children : fallback}</div>;
}

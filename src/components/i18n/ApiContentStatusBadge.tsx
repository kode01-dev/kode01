'use client';

import React from 'react';
import type { ApiContentTranslationStatus } from '@/lib/i18n/api-content-status';

interface ApiContentStatusBadgeProps {
    status: ApiContentTranslationStatus;
    locale: string;
    className?: string;
}

/**
 * @deprecated The Vetted/Verified indicators have been removed. 
 * This component now returns null to globally disable these badges.
 */
export function ApiContentStatusBadge(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    props: ApiContentStatusBadgeProps,
): React.JSX.Element | null {
    return null;
}

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface MarqueeSectionProps {
    template?: string;
}

export const MarqueeSection = ({ template = 'ribbon' }: MarqueeSectionProps) => {
    const isMono = template === 'mono';
    const t = useTranslations();
    const content = t.has('artifacts_home.marquee.content')
        ? t('artifacts_home.marquee.content')
        : 'N8N FLOWS • NOTION SYSTEMS • AI PROMPTS • SAAS KITS • AUTOMATION • DESIGN • BLUEPRINTS • APP •';

    return (
        <div
            className="marquee-container"
            style={isMono ? { background: '#1A1A1A', borderColor: '#1A1A1A' } : undefined}
        >
            <div className="marquee-content">
                <div className="marquee-item" style={isMono ? { color: '#F4F1EA' } : undefined}>{content}</div>
                <div className="marquee-item" style={isMono ? { color: '#F4F1EA' } : undefined}>{content}</div>
            </div>
        </div>
    );
};
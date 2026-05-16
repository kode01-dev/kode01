'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface ExpandableDescriptionProps {
    text: string;
}

export function ExpandableDescription({ text }: ExpandableDescriptionProps) {
    const t = useTranslations('product');
    const [isExpanded, setIsExpanded] = useState(false);
    const [needsTruncation, setNeedsTruncation] = useState(false);
    const contentRef = useRef<HTMLParagraphElement>(null);

    useEffect(() => {
        const el = contentRef.current;
        if (el) {
            setNeedsTruncation(el.scrollHeight > el.clientHeight + 1);
        }
    }, [text]);

    return (
        <div>
            <p
                ref={contentRef}
                className={`text-lg md:text-xl font-medium text-kode01-noir/70 leading-relaxed font-sans whitespace-pre-wrap ${!isExpanded ? 'line-clamp-5' : ''}`}
            >
                {text}
            </p>
            {needsTruncation && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-3 text-kode01-pink font-bold text-sm uppercase tracking-widest hover:underline transition-colors"
                >
                    {isExpanded ? t('description_collapse') : t('description_expand')}
                </button>
            )}
        </div>
    );
}

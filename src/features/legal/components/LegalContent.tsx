'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface LegalContentProps {
    children: React.ReactNode;
    className?: string;
}

export function LegalContent({ children, className }: LegalContentProps) {
    return (
        <div className={cn(
            "prose prose-slate max-w-[78ch] font-sans",
            "prose-p:text-kode01-noir/80 prose-p:text-[1rem] prose-p:leading-8 prose-p:mb-5",
            "prose-h3:font-serif prose-h3:font-black prose-h3:text-[1.42rem] prose-h3:tracking-tight prose-h3:mt-11 prose-h3:mb-4 prose-h3:text-kode01-noir",
            "prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-2 prose-ul:mb-6",
            "prose-li:text-kode01-noir/80 prose-li:leading-7 prose-li:pl-1",
            "prose-ul:marker:text-kode01-noir/45",
            "prose-strong:text-kode01-noir prose-strong:font-semibold",
            "prose-a:text-kode01-noir prose-a:underline prose-a:decoration-kode01-noir/25 hover:prose-a:decoration-kode01-noir/60",
            className
        )}>
            {children}
        </div>
    );
}

import { cn } from '@/lib/utils';
import React from 'react';

interface ServiceImageFallbackProps {
    title: string;
    className?: string;
    seed?: string | number;
}

// Studio palette — kode01.brand colors
const STUDIO_PALETTES = [
    { bg: '#2C1A0E', text: '#F5ECD7', pattern: '#C9622F' },   // studio-text + studio-bg + accent
    { bg: '#C9622F', text: '#F5ECD7', pattern: '#2C1A0E' },   // accent + studio-bg + text
    { bg: '#F5ECD7', text: '#2C1A0E', pattern: '#C9622F' },   // inverted
    { bg: '#2C1A0E', text: '#C9622F', pattern: '#F5ECD7' },   // text + accent + bg
];

// CSS art patterns matching the home page product grid
const ART_PATTERNS = [
    (colors: typeof STUDIO_PALETTES[0]): React.CSSProperties => ({
        background: `conic-gradient(from 45deg at 50% 50%, ${colors.bg} 0deg, ${colors.text} 180deg, ${colors.bg} 360deg)`,
    }),
    (colors: typeof STUDIO_PALETTES[0]): React.CSSProperties => ({
        background: `repeating-linear-gradient(45deg, ${colors.bg}, ${colors.bg} 10px, ${colors.pattern} 10px, ${colors.pattern} 20px)`,
    }),
    (colors: typeof STUDIO_PALETTES[0]): React.CSSProperties => ({
        background: `radial-gradient(circle at 30% 30%, ${colors.pattern} 0%, transparent 20%), radial-gradient(circle at 70% 70%, ${colors.pattern} 0%, transparent 20%), ${colors.bg}`,
        backgroundSize: '20px 20px',
    }),
    (colors: typeof STUDIO_PALETTES[0]): React.CSSProperties => ({
        background: `repeating-linear-gradient(90deg, ${colors.pattern}, ${colors.pattern} 8px, ${colors.bg} 8px, ${colors.bg} 32px)`,
    }),
];

export function ServiceImageFallback({ title, className, seed }: ServiceImageFallbackProps): React.JSX.Element {
    const numSeed = seed
        ? (typeof seed === 'string' ? seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : seed)
        : title.length;

    const palette = STUDIO_PALETTES[Math.abs(numSeed) % STUDIO_PALETTES.length];
    const patternStyle = ART_PATTERNS[Math.abs(numSeed) % ART_PATTERNS.length](palette);

    return (
        <div
            style={patternStyle}
            className={cn(
                "w-full h-full relative overflow-hidden flex flex-col justify-between p-5 transition-transform duration-700 ease-out",
                className
            )}
        >
            {/* Top tag */}
            <div className="flex items-center justify-between z-10">
                <span
                    style={{ color: palette.text }}
                    className="text-[10px] font-black uppercase tracking-[3px]"
                >
                    SERVICE
                </span>
            </div>

            {/* Title */}
            <div className="flex-1 flex items-center z-10 w-full py-2">
                <h3
                    style={{ color: palette.text }}
                    className="text-2xl sm:text-3xl font-black leading-[0.9] tracking-[-0.04em] lowercase line-clamp-3"
                >
                    {title}
                </h3>
            </div>

            {/* Bottom accent bar */}
            <div className="flex items-center justify-between z-10">
                <div
                    style={{ backgroundColor: palette.pattern }}
                    className="w-12 h-[4px]"
                />
                <div
                    style={{ backgroundColor: palette.pattern }}
                    className="w-4 h-4 rotate-45"
                />
            </div>
        </div>
    );
}

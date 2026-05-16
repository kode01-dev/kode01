import React from 'react';

type SmoothCornerProps = {
    className?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    size?: number;
};

/**
 * SVG patch for seamless concave (inverted) corners.
 * Blends cutout boxes into curved image boundaries.
 */
export default function SmoothCorner({ className = '', position = 'top-left', size = 40 }: SmoothCornerProps) {
    const paths: Record<string, string> = {
        'top-left': `M 0 0 H ${size} A ${size} ${size} 0 0 0 0 ${size} V 0 Z`,
        'top-right': `M ${size} 0 V ${size} A ${size} ${size} 0 0 0 0 0 H ${size} Z`,
        'bottom-left': `M 0 ${size} V 0 A ${size} ${size} 0 0 0 ${size} ${size} H 0 Z`,
        'bottom-right': `M ${size} ${size} H 0 A ${size} ${size} 0 0 0 ${size} 0 V ${size} Z`,
    };

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <path d={paths[position]} />
        </svg>
    );
}

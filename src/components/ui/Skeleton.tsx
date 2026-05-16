import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type SkeletonVariant = 'surface' | 'text' | 'chip' | 'avatar';
type SkeletonTone = 'cream' | 'white' | 'muted';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
    variant?: SkeletonVariant;
    tone?: SkeletonTone;
    animated?: boolean;
}

const variantClasses: Record<SkeletonVariant, string> = {
    surface: 'rounded-2xl',
    text: 'rounded-md',
    chip: 'rounded-full',
    avatar: 'rounded-full',
};

const toneClasses: Record<SkeletonTone, string> = {
    cream: 'k-skeleton-tone-cream',
    white: 'k-skeleton-tone-white',
    muted: 'k-skeleton-tone-muted',
};

export function Skeleton({
    className,
    variant = 'surface',
    tone = 'cream',
    animated = true,
    ...props
}: SkeletonProps): React.JSX.Element {
    return (
        <div
            aria-hidden="true"
            className={cn(
                'k-skeleton relative overflow-hidden',
                variantClasses[variant],
                toneClasses[tone],
                !animated && 'k-skeleton-static',
                className,
            )}
            {...props}
        />
    );
}

'use client';

import { useClap } from '../hooks/useClap';
import type { ClapContentType } from '../types';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/**
 * Clap icon using the custom SVG asset via CSS mask-image.
 * The mask lets us tint the icon with `currentColor` / `backgroundColor`.
 */
function ClapIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-block',
        WebkitMaskImage: 'url(/images/clap-icon.svg)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskImage: 'url(/images/clap-icon.svg)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        backgroundColor: 'currentColor',
        opacity: filled ? 1 : 0.45,
      }}
    />
  );
}

type ClapButtonProps = {
  contentType: ClapContentType;
  contentId: string;
  initialTotalClaps: number;
  variant?: 'compact' | 'full';
};

export function ClapButton({
  contentType,
  contentId,
  initialTotalClaps,
  variant = 'full',
}: ClapButtonProps) {
  const { totalClaps, hasClapped, isAnimating, handleClap } = useClap(
    contentType,
    contentId,
    initialTotalClaps,
  );

  const isCompact = variant === 'compact';

  return (
    <button
      type="button"
      onClick={handleClap}
      disabled={hasClapped}
      aria-label={hasClapped ? 'Already clapped' : 'Clap'}
      className={`
        group/clap inline-flex items-center transition-all duration-200 select-none
        ${isCompact ? 'gap-1.5' : 'gap-2'}
        ${hasClapped
          ? 'text-kode01-noir cursor-default'
          : 'text-kode01-noir/60 hover:text-kode01-noir cursor-pointer active:scale-95'
        }
      `}
    >
      <span
        className={`
          relative inline-flex items-center justify-center transition-transform duration-150
          ${isCompact ? 'w-7 h-7' : 'w-10 h-10'}
          ${isAnimating ? 'scale-[1.25]' : 'scale-100'}
          ${!hasClapped ? 'group-hover/clap:scale-110' : ''}
          ${hasClapped ? 'text-kode01-noir' : ''}
        `}
      >
        <ClapIcon
          filled={hasClapped}
          className={isCompact ? 'w-6 h-6' : 'w-9 h-9'}
        />
      </span>
      <span className={`
        tabular-nums font-semibold tracking-tight text-right
        ${isCompact ? 'text-xs min-w-[1.5rem]' : 'text-sm min-w-[2rem]'}
      `}>
        {totalClaps > 0 ? formatCount(totalClaps) : ''}
      </span>
    </button>
  );
}

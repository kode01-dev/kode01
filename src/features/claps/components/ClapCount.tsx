function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Small clap icon for read-only display using the custom SVG asset */
function ClapIconSmall() {
  return (
    <span
      aria-hidden
      className="inline-block w-3.5 h-3.5"
      style={{
        WebkitMaskImage: 'url(/images/clap-icon.svg)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskImage: 'url(/images/clap-icon.svg)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        backgroundColor: 'currentColor',
      }}
    />
  );
}

type ClapCountProps = {
  totalClaps: number;
  className?: string;
};

export function ClapCount({ totalClaps, className }: ClapCountProps) {
  if (totalClaps <= 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs text-kode01-noir/40 ${className ?? ''}`}>
      <ClapIconSmall />
      <span className="font-semibold tabular-nums tracking-tight">{formatCount(totalClaps)}</span>
    </span>
  );
}

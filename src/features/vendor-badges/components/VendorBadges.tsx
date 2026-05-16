import { cn } from '@/lib/utils';
import { getVendorBadges } from '../server/get-vendor-badges';
import { VENDOR_BADGE_META, type VendorBadgeType } from '../types';

interface VendorBadgesProps {
  vendorId: string | null | undefined;
  variant?: 'light' | 'dark';
  className?: string;
}

const LIGHT_COLOR_CLASSES: Record<'pink' | 'blue' | 'green', string> = {
  pink: 'border-kode01-pink/30 text-kode01-pink bg-kode01-pink/5',
  blue: 'border-kode01-blue/30 text-kode01-blue bg-kode01-blue/5',
  green: 'border-kode01-green/40 text-kode01-green bg-kode01-green/5',
};

const DARK_COLOR_CLASSES: Record<'pink' | 'blue' | 'green', string> = {
  pink: 'border-kode01-pink/50 text-kode01-pink bg-kode01-pink/10',
  blue: 'border-kode01-blue/50 text-kode01-blue bg-kode01-blue/10',
  green: 'border-kode01-green/60 text-kode01-green bg-kode01-green/10',
};

export async function VendorBadges({
  vendorId,
  variant = 'light',
  className,
}: VendorBadgesProps) {
  if (!vendorId) return null;

  const badges = await getVendorBadges(vendorId);
  if (badges.length === 0) return null;

  const colorMap = variant === 'dark' ? DARK_COLOR_CLASSES : LIGHT_COLOR_CLASSES;

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      data-variant={variant}
    >
      {badges.map((type: VendorBadgeType) => {
        const meta = VENDOR_BADGE_META[type];
        const Icon = meta.icon;
        return (
          <span
            key={type}
            title={meta.description}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold',
              colorMap[meta.color],
            )}
          >
            <Icon size={12} strokeWidth={2.5} />
            <span>{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export default VendorBadges;

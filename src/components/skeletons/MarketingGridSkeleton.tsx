import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

type MarketingCardVariant = 'product' | 'creator' | 'bundle' | 'news';

interface MarketingGridSkeletonProps {
    cards?: number;
    withHero?: boolean;
    withFilters?: boolean;
    cardVariant?: MarketingCardVariant;
    showResultsHeader?: boolean;
    className?: string;
}

function defaultCardsForVariant(variant: MarketingCardVariant): number {
    if (variant === 'bundle') return 3;
    if (variant === 'news') return 3;
    return 6;
}

function MarketingCardSkeleton({ variant }: { variant: MarketingCardVariant }): React.JSX.Element {
    if (variant === 'creator') {
        return (
            <div className="rounded-[32px] bg-white p-8 border border-black/5">
                <Skeleton variant="avatar" tone="cream" className="w-24 h-24 mx-auto mb-6" />
                <Skeleton variant="text" tone="cream" className="h-6 rounded-lg mb-3" />
                <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-2/3 mx-auto mb-6" />
                <Skeleton variant="chip" tone="cream" className="h-12 w-full" />
            </div>
        );
    }

    if (variant === 'bundle') {
        return <Skeleton variant="surface" tone="white" className="h-[350px] rounded-[24px] border border-black/5" />;
    }

    if (variant === 'news') {
        return (
            <div className="bg-white rounded-[24px] p-6 border border-black/10">
                <Skeleton variant="text" tone="cream" className="h-3 rounded-full w-1/4 mb-4" />
                <Skeleton variant="text" tone="cream" className="h-6 rounded-lg mb-3" />
                <Skeleton variant="text" tone="cream" className="h-4 rounded-md mb-2" />
                <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-2/3" />
            </div>
        );
    }

    return (
        <div className="rounded-[28px] bg-white border border-black/10 p-5">
            <Skeleton variant="surface" tone="cream" className="h-44 rounded-2xl mb-4" />
            <Skeleton variant="text" tone="cream" className="h-5 rounded-lg w-3/4 mb-2" />
            <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-1/2 mb-5" />
            <Skeleton variant="chip" tone="cream" className="h-8 w-24" />
        </div>
    );
}

export function MarketingGridSkeleton({
    cards,
    withHero = true,
    withFilters = true,
    cardVariant = 'product',
    showResultsHeader = true,
    className,
}: MarketingGridSkeletonProps): React.JSX.Element {
    const cardCount = cards ?? defaultCardsForVariant(cardVariant);

    return (
        <div className={cn('space-y-10', className)}>
            {withHero && (
                <section className="py-16 text-center relative">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-pink/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-green/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="max-w-[760px] mx-auto space-y-5 px-6">
                        <Skeleton variant="text" tone="cream" className="h-14 rounded-2xl w-4/5 mx-auto" />
                        <Skeleton variant="text" tone="cream" className="h-6 rounded-xl w-2/3 mx-auto" />
                    </div>
                </section>
            )}

            {withFilters && (
                <section className="bg-white rounded-[32px] border border-black/5 shadow-sm p-6 md:p-8 space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-4 items-end">
                        <Skeleton variant="surface" tone="cream" className="h-[54px] rounded-full" />
                        <Skeleton variant="surface" tone="cream" className="h-[54px] rounded-full" />
                        <Skeleton variant="chip" tone="cream" className="h-[50px] rounded-full" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <Skeleton key={index} variant="chip" tone="cream" className="h-9 w-28" />
                        ))}
                    </div>
                </section>
            )}

            <section>
                {showResultsHeader && (
                    <div className="flex items-center justify-between mb-6">
                        <Skeleton variant="text" tone="muted" className="h-4 rounded-full w-40" />
                        <Skeleton variant="text" tone="muted" className="h-4 rounded-full w-16" />
                    </div>
                )}

                <div
                    className={cn(
                        'grid gap-6',
                        cardVariant === 'news'
                            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                            : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
                    )}
                >
                    {Array.from({ length: cardCount }).map((_, index) => (
                        <MarketingCardSkeleton key={index} variant={cardVariant} />
                    ))}
                </div>
            </section>
        </div>
    );
}

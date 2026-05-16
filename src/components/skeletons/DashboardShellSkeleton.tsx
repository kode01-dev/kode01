import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

interface DashboardShellSkeletonProps {
    embedded?: boolean;
    cards?: number;
    showCharts?: boolean;
    showTable?: boolean;
    className?: string;
}

function DashboardContentSkeleton({
    cards,
    showCharts,
    showTable,
}: {
    cards: number;
    showCharts: boolean;
    showTable: boolean;
}): React.JSX.Element {
    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                {Array.from({ length: cards }).map((_, index) => (
                    <div key={index} className="rounded-[32px] border border-black/5 bg-white p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <Skeleton variant="avatar" tone="cream" className="w-12 h-12" />
                            <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-24" />
                        </div>
                        <Skeleton variant="text" tone="cream" className="h-10 rounded-xl w-1/2" />
                        <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-20" />
                    </div>
                ))}
            </div>

            {showCharts && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="rounded-[32px] border border-black/5 bg-white p-6 space-y-6">
                        <Skeleton variant="text" tone="cream" className="h-7 rounded-lg w-1/3" />
                        <Skeleton variant="text" tone="muted" className="h-4 rounded-md w-1/2" />
                        <Skeleton variant="surface" tone="cream" className="h-[300px] rounded-2xl" />
                    </div>
                    <div className="rounded-[32px] border border-black/5 bg-white p-6 space-y-6">
                        <Skeleton variant="text" tone="cream" className="h-7 rounded-lg w-1/3" />
                        <Skeleton variant="text" tone="muted" className="h-4 rounded-md w-1/2" />
                        <Skeleton variant="surface" tone="cream" className="h-[300px] rounded-2xl" />
                    </div>
                </div>
            )}

            {showTable && (
                <div className="rounded-[32px] border border-black/5 bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <Skeleton variant="text" tone="cream" className="h-7 rounded-lg w-1/3" />
                        <Skeleton variant="chip" tone="cream" className="h-8 w-24" />
                    </div>
                    <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton key={index} variant="surface" tone="cream" className="h-14 rounded-2xl" />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function DashboardShellSkeleton({
    embedded = false,
    cards = 4,
    showCharts = true,
    showTable = true,
    className,
}: DashboardShellSkeletonProps): React.JSX.Element {
    if (embedded) {
        return (
            <div className={cn('space-y-8', className)}>
                <DashboardContentSkeleton cards={cards} showCharts={showCharts} showTable={showTable} />
            </div>
        );
    }

    return (
        <div className={cn('min-h-screen bg-kode01-white text-kode01-noir antialiased font-sans flex', className)}>
            <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[260px] border-r border-black/5 bg-kode01-white p-4 flex-col gap-6">
                <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-32 mt-2" />
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} variant="surface" tone="cream" className="h-11 rounded-2xl" />
                    ))}
                </div>
                <div className="mt-auto flex items-center gap-3 rounded-3xl border border-black/5 p-3">
                    <Skeleton variant="avatar" tone="cream" className="h-10 w-10" />
                    <div className="space-y-2 w-full">
                        <Skeleton variant="text" tone="cream" className="h-3 rounded-full w-3/4" />
                        <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-1/2" />
                    </div>
                </div>
            </aside>

            <div className="flex-1 lg:ml-[260px] min-w-0">
                <header className="sticky top-0 z-10 border-b border-black/5 bg-kode01-white/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-2">
                            <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-52" />
                            <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-72" />
                        </div>
                        <div className="flex items-center gap-3">
                            <Skeleton variant="surface" tone="cream" className="h-10 w-56 rounded-full hidden xl:block" />
                            <Skeleton variant="avatar" tone="cream" className="h-10 w-10" />
                            <Skeleton variant="avatar" tone="cream" className="h-10 w-10" />
                            <Skeleton variant="avatar" tone="cream" className="h-10 w-10" />
                        </div>
                    </div>
                </header>

                <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto">
                    <DashboardContentSkeleton cards={cards} showCharts={showCharts} showTable={showTable} />
                </main>
            </div>
        </div>
    );
}

import { Skeleton } from '@/components/ui/Skeleton';

interface SearchResultsSkeletonProps {
    productCards?: number;
    newsRows?: number;
}

export function SearchResultsSkeleton({
    productCards = 6,
    newsRows = 4,
}: SearchResultsSkeletonProps): React.JSX.Element {
    return (
        <div className="space-y-14">
            <section className="py-14 md:py-20 text-center relative flex flex-col items-center">
                <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-blue/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-pink/10 rounded-full blur-3xl pointer-events-none" />

                <Skeleton variant="text" tone="cream" className="h-14 rounded-2xl w-[min(760px,80%)] mb-5" />
                <Skeleton variant="text" tone="cream" className="h-6 rounded-xl w-[min(620px,70%)] mb-8" />
                <Skeleton variant="surface" tone="white" className="w-full max-w-[760px] h-[62px] rounded-full" />
            </section>

            <Skeleton variant="text" tone="muted" className="h-4 rounded-full w-56" />

            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <Skeleton variant="avatar" tone="cream" className="h-6 w-6" />
                    <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-52" />
                    <Skeleton variant="chip" tone="cream" className="h-6 w-10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {Array.from({ length: productCards }).map((_, index) => (
                        <div key={index} className="rounded-[28px] border border-black/10 bg-white p-6 space-y-4">
                            <Skeleton variant="text" tone="cream" className="h-7 rounded-lg w-4/5" />
                            <Skeleton variant="text" tone="cream" className="h-4 rounded-md" />
                            <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-2/3" />
                            <div className="flex flex-wrap gap-2">
                                <Skeleton variant="chip" tone="cream" className="h-6 w-20" />
                                <Skeleton variant="chip" tone="cream" className="h-6 w-16" />
                            </div>
                            <div className="flex items-center justify-between">
                                <Skeleton variant="text" tone="cream" className="h-5 rounded-md w-20" />
                                <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-16" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-6">
                <div className="flex items-center gap-3">
                    <Skeleton variant="avatar" tone="cream" className="h-6 w-6" />
                    <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-52" />
                    <Skeleton variant="chip" tone="cream" className="h-6 w-10" />
                </div>
                <div className="space-y-4">
                    {Array.from({ length: newsRows }).map((_, index) => (
                        <div key={index} className="rounded-[24px] border border-black/10 bg-white p-6 space-y-3">
                            <div className="flex items-center justify-between">
                                <Skeleton variant="text" tone="cream" className="h-7 rounded-lg w-2/3" />
                                <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-20" />
                            </div>
                            <Skeleton variant="text" tone="cream" className="h-4 rounded-md" />
                            <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-4/5" />
                            <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-24" />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

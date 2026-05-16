import { Skeleton } from '@/components/ui/Skeleton';

export function DetailWithSidebarSkeleton(): React.JSX.Element {
    return (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-12 pb-16">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-3 mb-6 md:mb-10">
                <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-16" />
                <Skeleton variant="chip" tone="muted" className="h-2 w-2" />
                <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-20" />
                <Skeleton variant="chip" tone="muted" className="h-2 w-2" />
                <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-36" />
            </div>

            {/* Hero Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                {/* Left: Image */}
                <div className="lg:col-span-7">
                    <Skeleton variant="surface" tone="white" className="aspect-[4/3] lg:h-[540px] rounded-[20px] md:rounded-[40px] border border-black/5" />
                </div>

                {/* Right: Product Info */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Seller badge */}
                    <div className="flex items-center gap-3">
                        <Skeleton variant="avatar" tone="cream" className="h-10 w-10" />
                        <div className="space-y-2">
                            <Skeleton variant="text" tone="cream" className="h-4 rounded-full w-28" />
                            <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-36" />
                        </div>
                    </div>

                    {/* Badge skeleton */}
                    <Skeleton variant="chip" tone="cream" className="h-6 w-32 rounded-lg" />

                    {/* Title */}
                    <Skeleton variant="text" tone="cream" className="h-12 rounded-2xl w-4/5" />
                    <Skeleton variant="text" tone="cream" className="h-10 rounded-2xl w-3/5" />

                    {/* Metrics row */}
                    <div className="flex items-center gap-4">
                        <Skeleton variant="text" tone="cream" className="h-4 rounded-full w-20" />
                        <Skeleton variant="text" tone="cream" className="h-4 rounded-full w-16" />
                        <Skeleton variant="text" tone="cream" className="h-4 rounded-full w-16" />
                    </div>

                    {/* Purchase card */}
                    <div className="bg-kode01-noir rounded-[20px] md:rounded-[28px] p-5 md:p-8 space-y-6 border border-white/10">
                        <Skeleton variant="text" tone="muted" className="h-12 rounded-2xl w-1/2" />
                        <Skeleton variant="surface" tone="muted" className="h-12 rounded-full w-full" />
                        <Skeleton variant="surface" tone="muted" className="h-12 rounded-full w-full" />
                        <div className="pt-6 border-t border-white/10 space-y-3">
                            <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-full" />
                            <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-5/6" />
                        </div>
                    </div>

                    {/* Trust badges */}
                    <div className="flex gap-2">
                        <Skeleton variant="chip" tone="cream" className="h-8 w-28 rounded-full" />
                        <Skeleton variant="chip" tone="cream" className="h-8 w-28 rounded-full" />
                        <Skeleton variant="chip" tone="cream" className="h-8 w-36 rounded-full" />
                    </div>
                </div>
            </div>

            {/* Below the fold */}
            <div className="mt-20 max-w-4xl space-y-16">
                {/* Description */}
                <div className="space-y-4">
                    <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-40" />
                    <div className="space-y-3">
                        <Skeleton variant="text" tone="cream" className="h-5 rounded-lg w-full" />
                        <Skeleton variant="text" tone="cream" className="h-5 rounded-lg w-5/6" />
                        <Skeleton variant="text" tone="cream" className="h-5 rounded-lg w-3/4" />
                    </div>
                </div>

                {/* Features */}
                <div className="space-y-6">
                    <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-48" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="flex items-start gap-4 bg-white p-6 rounded-[32px] border border-black/5">
                                <Skeleton variant="avatar" tone="cream" className="h-10 w-10" />
                                <Skeleton variant="text" tone="cream" className="h-5 rounded-md w-3/4" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bundle skeleton */}
            <div className="mt-20">
                <div className="bg-kode01-noir rounded-[40px] p-10 border border-white/10">
                    <Skeleton variant="text" tone="muted" className="h-5 rounded-full w-72 mb-8" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="rounded-[20px] border border-white/10 overflow-hidden">
                                <Skeleton variant="surface" tone="muted" className="aspect-[4/3]" />
                                <div className="p-4 space-y-2">
                                    <Skeleton variant="text" tone="muted" className="h-4 rounded-full w-3/4" />
                                    <Skeleton variant="text" tone="muted" className="h-4 rounded-full w-16" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                        <Skeleton variant="surface" tone="muted" className="h-24 rounded-[20px]" />
                        <Skeleton variant="surface" tone="muted" className="h-24 rounded-[20px]" />
                    </div>
                </div>
            </div>

            {/* Reviews skeleton */}
            <div className="mt-20 max-w-4xl space-y-6">
                <Skeleton variant="text" tone="cream" className="h-8 rounded-lg w-32" />
                <Skeleton variant="surface" tone="cream" className="h-40 rounded-[20px] border border-black/5" />
            </div>
        </div>
    );
}

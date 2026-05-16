import { Skeleton } from '@/components/ui/Skeleton';

interface NewsPageSkeletonProps {
    items?: number;
}

export function NewsPageSkeleton({ items = 6 }: NewsPageSkeletonProps): React.JSX.Element {
    return (
        <div>
            <header className="mb-10">
                <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-28" />
                <Skeleton variant="text" tone="cream" className="mt-3 h-12 rounded-2xl w-[min(560px,90%)]" />
                <Skeleton variant="text" tone="cream" className="mt-4 h-5 rounded-lg w-[min(640px,95%)]" />
            </header>

            <div className="mb-8 rounded-3xl border border-black/10 bg-white/70 p-6">
                <Skeleton variant="surface" tone="cream" className="h-20 rounded-2xl" />
            </div>

            <ul className="space-y-4 list-none p-0">
                {Array.from({ length: items }).map((_, index) => (
                    <li key={index}>
                        <article className="rounded-3xl border border-black/10 bg-white/80 p-6">
                            <div className="flex items-center gap-3 mb-3">
                                <Skeleton variant="chip" tone="cream" className="h-6 w-14" />
                                <Skeleton variant="chip" tone="cream" className="h-6 w-16" />
                            </div>
                            <Skeleton variant="text" tone="cream" className="h-8 rounded-xl w-[min(680px,95%)]" />
                            <Skeleton variant="text" tone="cream" className="mt-3 h-4 rounded-md w-full" />
                            <Skeleton variant="text" tone="cream" className="mt-2 h-4 rounded-md w-4/5" />
                        </article>
                    </li>
                ))}
            </ul>
        </div>
    );
}

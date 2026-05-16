import { Skeleton } from '@/components/ui/Skeleton';

export function FormPanelSkeleton(): React.JSX.Element {
    return (
        <div className="space-y-8">
            <Skeleton variant="text" tone="cream" className="h-10 rounded-xl w-72" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {Array.from({ length: 6 }).map((_, panelIndex) => (
                        <div key={panelIndex} className="bg-white rounded-[24px] border border-black/5 p-6 space-y-4">
                            <Skeleton variant="text" tone="muted" className="h-5 rounded-lg w-1/3" />
                            <div className="space-y-3">
                                <Skeleton variant="surface" tone="cream" className="h-11 rounded-xl" />
                                <Skeleton variant="surface" tone="cream" className="h-11 rounded-xl" />
                                <Skeleton variant="surface" tone="cream" className="h-20 rounded-xl" />
                            </div>
                        </div>
                    ))}

                    <div className="flex gap-4">
                        <Skeleton variant="chip" tone="cream" className="h-12 rounded-full flex-1" />
                        <Skeleton variant="chip" tone="cream" className="h-12 rounded-full flex-1" />
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="sticky top-6 bg-white rounded-[24px] border border-black/5 p-6 space-y-4">
                        <Skeleton variant="text" tone="muted" className="h-5 rounded-lg w-1/2" />
                        <Skeleton variant="surface" tone="cream" className="h-64 rounded-2xl" />
                        <Skeleton variant="text" tone="cream" className="h-4 rounded-md" />
                        <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-2/3" />
                    </div>
                </div>
            </div>
        </div>
    );
}

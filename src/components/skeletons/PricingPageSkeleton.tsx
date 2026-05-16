import { Skeleton } from '@/components/ui/Skeleton';

export function PricingPageSkeleton(): React.JSX.Element {
    return (
        <div className="max-w-[1440px] mx-auto px-6 md:px-12">
            <section className="py-20 text-center relative">
                <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-blue/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-pink/10 rounded-full blur-3xl pointer-events-none" />

                <Skeleton variant="text" tone="cream" className="h-16 rounded-2xl w-[min(620px,85%)] mx-auto mb-6" />
                <Skeleton variant="text" tone="cream" className="h-6 rounded-lg w-[min(640px,88%)] mx-auto" />
            </section>

            <div className="pb-24 max-w-5xl mx-auto">
                <div className="grid md:grid-cols-2 gap-8">
                    {Array.from({ length: 2 }).map((_, index) => (
                        <div key={index} className="bg-white rounded-[40px] p-10 border border-kode01-noir/5 shadow-lg">
                            <Skeleton variant="avatar" tone="cream" className="w-14 h-14 mb-6" />
                            <Skeleton variant="text" tone="cream" className="h-10 rounded-xl w-32 mb-2" />
                            <Skeleton variant="text" tone="cream" className="h-5 rounded-md w-2/3 mb-6" />
                            <Skeleton variant="text" tone="cream" className="h-12 rounded-2xl w-40 mb-8" />

                            <div className="space-y-4 mb-10">
                                {Array.from({ length: 6 }).map((__, featureIndex) => (
                                    <div key={featureIndex} className="flex items-center gap-3">
                                        <Skeleton variant="avatar" tone="cream" className="w-5 h-5" />
                                        <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-full" />
                                    </div>
                                ))}
                            </div>

                            <Skeleton variant="chip" tone="cream" className="h-12 w-full" />
                        </div>
                    ))}
                </div>

                <div className="mt-20 text-center">
                    <Skeleton variant="text" tone="muted" className="h-4 rounded-full w-[min(560px,90%)] mx-auto" />
                </div>
            </div>

            <section className="pb-24 max-w-5xl mx-auto">
                <div className="text-center mb-12">
                    <Skeleton variant="text" tone="cream" className="h-12 rounded-2xl w-[min(520px,80%)] mx-auto mb-4" />
                    <Skeleton variant="text" tone="cream" className="h-5 rounded-md w-[min(600px,85%)] mx-auto mb-6" />
                    <Skeleton variant="chip" tone="white" className="h-10 rounded-full w-56 mx-auto" />
                    <Skeleton variant="text" tone="muted" className="mt-4 h-4 rounded-md w-[min(720px,95%)] mx-auto" />
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="bg-white rounded-[40px] p-10 border border-kode01-noir/5 shadow-lg">
                            <Skeleton variant="avatar" tone="cream" className="w-14 h-14 mb-6" />
                            <Skeleton variant="text" tone="cream" className="h-8 rounded-xl w-2/3 mb-2" />
                            <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-full mb-6" />

                            <div className="mb-8 space-y-2 rounded-2xl border border-black/10 bg-kode01-cream/35 p-4">
                                {Array.from({ length: 3 }).map((__, rowIndex) => (
                                    <div key={rowIndex} className="flex items-center justify-between gap-4">
                                        <Skeleton variant="text" tone="muted" className="h-3 rounded-full w-16" />
                                        <Skeleton variant="text" tone="cream" className="h-6 rounded-lg w-20" />
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-4 mb-10">
                                {Array.from({ length: 4 }).map((__, featureIndex) => (
                                    <div key={featureIndex} className="flex items-center gap-3">
                                        <Skeleton variant="avatar" tone="cream" className="w-5 h-5" />
                                        <Skeleton variant="text" tone="cream" className="h-4 rounded-md w-full" />
                                    </div>
                                ))}
                            </div>

                            <Skeleton variant="chip" tone="cream" className="h-12 w-full" />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

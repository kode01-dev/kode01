import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { NewsPageSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <BaseHeader />
            <main className="flex-1 max-w-5xl mx-auto px-6 pt-40 pb-16 w-full">
                <NewsPageSkeleton items={6} />
            </main>
            <BaseFooter />
        </div>
    );
}

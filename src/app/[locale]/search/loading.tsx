import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { SearchResultsSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <BaseHeader />
            <main className="flex-1 pt-40">
                <div className="max-w-[1440px] mx-auto px-6 md:px-12 pb-24">
                    <SearchResultsSkeleton />
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}

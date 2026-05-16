import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { MarketingGridSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <BaseHeader />
            <main className="flex-1 max-w-[1440px] mx-auto px-6 md:px-12 pt-40 pb-20 w-full">
                <MarketingGridSkeleton cards={6} withHero withFilters cardVariant="product" />
            </main>
            <BaseFooter />
        </div>
    );
}

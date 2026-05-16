import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { PricingPageSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return (
        <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans">
            <BaseHeader />
            <main className="flex-1 pt-40 pb-20">
                <PricingPageSkeleton />
            </main>
            <BaseFooter />
        </div>
    );
}

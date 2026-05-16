import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { DetailWithSidebarSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return (
        <div className="bg-kode01-white min-h-screen text-kode01-noir antialiased font-sans">
            <BaseHeader />
            <main className="flex-1 pt-32">
                <DetailWithSidebarSkeleton />
            </main>
            <BaseFooter />
        </div>
    );
}

import { Link } from '@/i18n/routing';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { BaseHeader } from '@/components/layout/BaseHeader';

export default function ProductsNotFoundPage() {
    return (
        <div className="min-h-screen bg-kode01-white text-kode01-noir antialiased font-sans">
            <BaseHeader />
            <main className="mx-auto flex max-w-3xl flex-col items-start gap-6 px-6 py-24 md:px-12">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-kode01-noir/50">404</p>
                <h1 className="font-serif text-4xl font-black tracking-tight md:text-6xl">Product not found</h1>
                <p className="max-w-2xl text-lg text-kode01-noir/70">
                    The product you are looking for does not exist or is no longer available.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                    <Link
                        href="/market"
                        className="rounded-full bg-kode01-noir px-6 py-3 text-sm font-bold uppercase tracking-[0.15em] text-white transition-opacity hover:opacity-90"
                    >
                        Browse market
                    </Link>
                    <Link
                        href="/"
                        className="rounded-full border border-kode01-noir/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.15em] text-kode01-noir transition-colors hover:border-kode01-noir/40"
                    >
                        Go home
                    </Link>
                </div>
            </main>
            <BaseFooter />
        </div>
    );
}

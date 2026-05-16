'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';

type NewsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function getCopy(locale: string | undefined) {
  if (locale === 'fr') {
    return {
      title: 'Actualités temporairement indisponibles',
      body: "Nous n'avons pas pu charger cette page. Réessayez dans quelques instants.",
      action: 'Réessayer',
    };
  }

  return {
    title: 'News is temporarily unavailable',
    body: 'We could not load this page right now. Try again in a few moments.',
    action: 'Retry',
  };
}

export default function NewsError({ error, reset }: NewsErrorProps) {
  const params = useParams<{ locale?: string }>();
  const copy = getCopy(params?.locale);

  useEffect(() => {
    console.error('News route render failed:', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen flex flex-col antialiased font-sans overflow-x-hidden">
      <BaseHeader />
      <main className="flex-1 min-w-0 pt-40 pb-16 mx-auto max-w-6xl px-3.5 sm:px-6 w-full">
        <section className="rounded-3xl border border-black/10 bg-white/75 p-8 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-kode01-noir/40">kode01.news</p>
          <h1 className="mt-3 font-serif text-3xl font-black tracking-tight sm:text-4xl">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-kode01-noir/70 sm:text-base">{copy.body}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-kode01-noir px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-kode01-pink hover:text-kode01-noir"
          >
            {copy.action}
          </button>
        </section>
      </main>
      <BaseFooter />
    </div>
  );
}

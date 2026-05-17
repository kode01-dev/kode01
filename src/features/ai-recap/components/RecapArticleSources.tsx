import { getRecapArticleSources } from '../lib/article-sources';
import type { RecapContent, RecapLocale } from '../types';

export function RecapArticleSources({
  content,
  locale,
  title = 'Sources',
}: {
  content: RecapContent | null;
  locale: string | RecapLocale;
  title?: string;
}) {
  const sources = getRecapArticleSources(content, locale);
  if (sources.length === 0) return null;

  return (
    <section aria-labelledby="recap-article-sources-title" className="mt-7 sm:mt-10 border-t border-black/10 pt-5 sm:pt-7">
      <h2 id="recap-article-sources-title" className="text-base sm:text-xl font-serif font-black">
        {title}
      </h2>
      <ol className="mt-3 sm:mt-4 list-decimal pl-4 sm:pl-5 space-y-2.5 sm:space-y-3 text-xs sm:text-sm leading-relaxed text-kode01-noir/75">
        {sources.map((source) => (
          <li key={source.url} className="pl-1 break-words">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-kode01-pink hover:underline break-words"
            >
              {source.label}
            </a>
            {source.label !== source.url && (
              <span className="mt-0.5 block break-all font-mono text-[11px] sm:text-xs text-kode01-noir/45">
                {source.url}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

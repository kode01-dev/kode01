import type { AiRecapAdminText } from './text';

type SiteTextControlSectionProps = {
  text: AiRecapAdminText;
  locale: string;
};

export function SiteTextControlSection({ text, locale }: SiteTextControlSectionProps) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-6">
      <h2 className="text-xl font-serif font-black">{text.siteTextControlTitle}</h2>
      <p className="mt-2 text-sm text-kode01-noir/60">{text.siteTextControlHint}</p>
      <div className="mt-4 grid grid-cols-1 gap-3">
        <a
          href={`/${locale}/admin/controllers`}
          className="rounded-2xl border border-black/10 bg-black/[0.02] p-4 no-underline transition-colors hover:border-kode01-pink/40"
        >
          <p className="text-sm font-bold text-kode01-noir">{text.siteTextTemplatesTitle}</p>
          <p className="mt-1 text-xs text-kode01-noir/60">{text.siteTextTemplatesHint}</p>
          <span className="mt-3 inline-block rounded-full border border-black/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-kode01-noir">
            {text.openEditor}
          </span>
        </a>
      </div>
    </section>
  );
}

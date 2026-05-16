'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type MemberRole = 'buyer' | 'seller';
type EditorialLocale = 'en' | 'fr';
type CheckoutStatus = 'success' | 'cancel' | null;

type SubmissionItem = {
  translation_group_id: string;
  source_locale: EditorialLocale;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  sponsorship_status: 'none' | 'pending_payment' | 'pending_review' | 'approved' | 'rejected';
  locales: EditorialLocale[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  sponsored_submitted_at: string | null;
  sponsored_approved_at: string | null;
  sponsored_rejected_at: string | null;
  sponsored_rejection_reason: string | null;
  order: {
    id: string;
    status: 'pending' | 'paid' | 'failed' | 'refunded';
    amount: number;
    currency: string;
    created_at: string;
    updated_at: string;
  } | null;
};

type SubmissionResponse = {
  data: SubmissionItem[];
  error?: string;
};

export function SponsoredBlogSubmissionPanel({
  locale,
  role,
  checkoutStatus,
}: {
  locale: string;
  role: MemberRole;
  checkoutStatus: CheckoutStatus;
}) {
  const [primaryLocale, setPrimaryLocale] = useState<EditorialLocale>(locale === 'fr' ? 'fr' : 'en');
  const [includeTranslation, setIncludeTranslation] = useState(false);
  const [titlePrimary, setTitlePrimary] = useState('');
  const [excerptPrimary, setExcerptPrimary] = useState('');
  const [contentPrimary, setContentPrimary] = useState('');
  const [titleSecondary, setTitleSecondary] = useState('');
  const [excerptSecondary, setExcerptSecondary] = useState('');
  const [contentSecondary, setContentSecondary] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    checkoutStatus === 'success'
      ? 'Paiement reçu. Votre soumission est maintenant en attente de validation admin.'
      : checkoutStatus === 'cancel'
        ? 'Paiement annulé. Vous pouvez relancer le paiement quand vous voulez.'
        : null,
  );

  const secondaryLocale: EditorialLocale = primaryLocale === 'en' ? 'fr' : 'en';

  async function loadSubmissions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/editorial/sponsored/submissions', { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as SubmissionResponse | null;
      if (!res.ok) {
        setSubmissions([]);
        setError(body?.error ?? 'Impossible de charger vos soumissions commanditées.');
        return;
      }
      setSubmissions(Array.isArray(body?.data) ? body.data : []);
    } catch {
      setSubmissions([]);
      setError('Impossible de charger vos soumissions commanditées.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
  }, []);

  const returnPath = useMemo(
    () => (role === 'seller' ? `/${locale}/vendor/sponsored-blog` : `/${locale}/buyer/sponsored-blog`),
    [locale, role],
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      if (!titlePrimary.trim()) {
        setError('Le titre principal est obligatoire.');
        return;
      }

      const posts: Array<Record<string, unknown>> = [
        {
          locale: primaryLocale,
          title: titlePrimary.trim(),
          excerpt: excerptPrimary.trim() || null,
          content_markdown: contentPrimary,
          author_name: authorName.trim() || null,
          category: category.trim() || null,
        },
      ];

      if (includeTranslation) {
        if (!titleSecondary.trim()) {
          setError('Le titre de la 2e langue est obligatoire.');
          return;
        }
        posts.push({
          locale: secondaryLocale,
          title: titleSecondary.trim(),
          excerpt: excerptSecondary.trim() || null,
          content_markdown: contentSecondary,
          author_name: authorName.trim() || null,
          category: category.trim() || null,
        });
      }

      const res = await fetch('/api/editorial/sponsored/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale: locale === 'fr' ? 'fr' : 'en',
          returnPath,
          posts,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        data?: { checkoutUrl?: string };
      } | null;

      if (!res.ok) {
        setError(body?.error ?? 'Impossible de créer la soumission sponsorisée.');
        return;
      }

      const checkoutUrl = body?.data?.checkoutUrl;
      if (!checkoutUrl) {
        setError('Session de paiement indisponible.');
        return;
      }

      window.location.href = checkoutUrl;
    } catch {
      setError('Impossible de créer la soumission sponsorisée.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA');
  }

  return (
    <div className="space-y-6">
      {status && (
        <div className="rounded-2xl border border-kode01-green/30 bg-kode01-green/10 px-4 py-3 text-sm text-kode01-green">
          {status}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-kode01-sauge/15 bg-white p-5">
        <h2 className="text-lg font-serif font-black text-kode01-noir">Nouvelle soumission de blog commandité</h2>
        <p className="mt-1 text-sm text-kode01-noir/65">
          Prix fixe: <strong>79 CAD</strong> · Validation admin obligatoire · Publication planifiée après approbation.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Langue principale</label>
            <select
              value={primaryLocale}
              onChange={(event) => setPrimaryLocale(event.target.value as EditorialLocale)}
              className="h-10 w-full rounded-xl border border-kode01-sauge/30 px-3 text-sm"
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-kode01-noir/80">
              <input
                type="checkbox"
                checked={includeTranslation}
                onChange={(event) => setIncludeTranslation(event.target.checked)}
              />
              Ajouter la 2e langue ({secondaryLocale.toUpperCase()})
            </label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="Nom auteur (optionnel)"
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
          />
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Catégorie (optionnel)"
            className="h-10 rounded-xl border border-kode01-sauge/30 px-3 text-sm"
          />
        </div>

        <div className="mt-4 rounded-2xl border border-kode01-sauge/20 p-4">
          <h3 className="text-sm font-bold text-kode01-noir">Contenu {primaryLocale.toUpperCase()}</h3>
          <div className="mt-2 space-y-2">
            <input
              value={titlePrimary}
              onChange={(event) => setTitlePrimary(event.target.value)}
              placeholder="Titre"
              className="h-10 w-full rounded-xl border border-kode01-sauge/30 px-3 text-sm"
            />
            <textarea
              value={excerptPrimary}
              onChange={(event) => setExcerptPrimary(event.target.value)}
              placeholder="Extrait (optionnel)"
              rows={3}
              className="w-full rounded-xl border border-kode01-sauge/30 px-3 py-2 text-sm"
            />
            <textarea
              value={contentPrimary}
              onChange={(event) => setContentPrimary(event.target.value)}
              placeholder="Contenu markdown"
              rows={8}
              className="w-full rounded-xl border border-kode01-sauge/30 px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>

        {includeTranslation && (
          <div className="mt-4 rounded-2xl border border-kode01-sauge/20 p-4">
            <h3 className="text-sm font-bold text-kode01-noir">Contenu {secondaryLocale.toUpperCase()}</h3>
            <div className="mt-2 space-y-2">
              <input
                value={titleSecondary}
                onChange={(event) => setTitleSecondary(event.target.value)}
                placeholder="Titre"
                className="h-10 w-full rounded-xl border border-kode01-sauge/30 px-3 text-sm"
              />
              <textarea
                value={excerptSecondary}
                onChange={(event) => setExcerptSecondary(event.target.value)}
                placeholder="Extrait (optionnel)"
                rows={3}
                className="w-full rounded-xl border border-kode01-sauge/30 px-3 py-2 text-sm"
              />
              <textarea
                value={contentSecondary}
                onChange={(event) => setContentSecondary(event.target.value)}
                placeholder="Contenu markdown"
                rows={8}
                className="w-full rounded-xl border border-kode01-sauge/30 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button
            type="button"
            className="rounded-2xl bg-kode01-noir px-4 py-2 text-xs font-bold uppercase tracking-widest text-white"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
            Payer 79 CAD et soumettre
          </Button>
        </div>
      </section>

      <section className="rounded-3xl border border-kode01-sauge/15 bg-white p-5">
        <h2 className="text-lg font-serif font-black text-kode01-noir">Mes soumissions commanditées</h2>
        {loading ? (
          <p className="mt-3 text-sm text-kode01-noir/60"><Loader2 size={14} className="mr-2 inline animate-spin" />Chargement...</p>
        ) : submissions.length === 0 ? (
          <p className="mt-3 text-sm text-kode01-noir/60">Aucune soumission pour le moment.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {submissions.map((item) => (
              <div key={item.translation_group_id} className="rounded-2xl border border-kode01-sauge/15 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-kode01-noir">{item.title}</p>
                  <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                    {item.sponsorship_status}
                  </span>
                  <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                    {item.status}
                  </span>
                  {item.order && (
                    <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                      paiement: {item.order.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-kode01-noir/50">/{item.source_locale}/blog/{item.slug}</p>
                <p className="mt-1 text-xs text-kode01-noir/50">
                  Langues: {item.locales.join(', ').toUpperCase()} · Soumis: {formatDate(item.sponsored_submitted_at ?? item.created_at)}
                </p>
                {item.sponsored_rejection_reason && (
                  <p className="mt-1 text-xs text-red-700">Motif rejet: {item.sponsored_rejection_reason}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

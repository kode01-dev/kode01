import { BaseHeader } from '@/components/layout/BaseHeader';
import { BaseFooter } from '@/components/layout/BaseFooter';
import { adCreativeGuidelines } from '@/features/ads/creative-guidelines';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isAdsMemberRole } from '@/features/ads/server/access';

export default function AdvertiseGuidePage(
  props: { params: Promise<{ locale: string }> },
) {
  return <AdvertiseGuideContent paramsPromise={props.params} />;
}

async function AdvertiseGuideContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ locale: string }>;
}) {
  const { locale } = await paramsPromise;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!isAdsMemberRole(profile?.role)) {
    redirect(`/${locale}`);
  }

  return (
    <div className="bg-kode01-cream text-kode01-noir min-h-screen antialiased font-sans">
      <BaseHeader />
      <main className="mx-auto max-w-5xl px-6 py-32">
        <h1 className="text-4xl font-serif font-black tracking-tight">Guide Formats Publicitaires</h1>
        <p className="mt-4 text-kode01-noir/70">
          Respecte ces formats pour valider rapidement ta campagne.
        </p>

        <section className="mt-10 rounded-3xl border border-black/10 bg-white p-8">
          <h2 className="text-2xl font-serif font-black">Formats acceptes</h2>
          <p className="mt-3 text-sm text-kode01-noir/70">
            {adCreativeGuidelines.acceptedFormats.join(', ')}
          </p>
          <p className="mt-2 text-sm text-kode01-noir/70">
            Taille max: {(adCreativeGuidelines.maxFileSizeBytes / 1_000_000).toFixed(1)} MB
          </p>
        </section>

        <section className="mt-6 rounded-3xl border border-black/10 bg-white p-8">
          <h2 className="text-2xl font-serif font-black">Tailles recommandees</h2>
          <ul className="mt-4 space-y-2 list-none p-0">
            {adCreativeGuidelines.recommendedSizes.map((size) => (
              <li key={size.name} className="text-sm text-kode01-noir/75">
                <span className="font-bold text-kode01-noir">{size.name}</span>: {size.width}x{size.height}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-3xl border border-black/10 bg-white p-8">
          <h2 className="text-2xl font-serif font-black">Regles de contenu</h2>
          <p className="mt-3 text-sm text-kode01-noir/75">Titre max: {adCreativeGuidelines.textLimits.titleMaxChars} caracteres</p>
          <p className="mt-1 text-sm text-kode01-noir/75">CTA max: {adCreativeGuidelines.textLimits.ctaMaxChars} caracteres</p>
          <ul className="mt-4 space-y-2 list-none p-0">
            {adCreativeGuidelines.notes.map((note) => (
              <li key={note} className="text-sm text-kode01-noir/75">
                - {note}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-3xl border border-black/10 bg-white p-8">
          <h2 className="text-2xl font-serif font-black">Restrictions banniere sponsorisee (News)</h2>
          <p className="mt-3 text-sm font-bold text-kode01-noir">
            Regles obligatoires (validation automatique):
          </p>
          <ul className="mt-3 space-y-2 list-none p-0">
            <li className="text-sm text-kode01-noir/75">
              - Titre: max {adCreativeGuidelines.placementRestrictions.news.enforced.titleMaxChars} caracteres
            </li>
            <li className="text-sm text-kode01-noir/75">
              - CTA: max {adCreativeGuidelines.placementRestrictions.news.enforced.ctaMaxChars} caracteres
            </li>
            <li className="text-sm text-kode01-noir/75">
              - URL image: HTTPS obligatoire
            </li>
            <li className="text-sm text-kode01-noir/75">
              - URL de destination externe: HTTPS obligatoire
            </li>
            <li className="text-sm text-kode01-noir/75">
              - Non conforme: campagne rejetee avec erreur 400
            </li>
          </ul>
          <p className="mt-3 text-sm text-kode01-noir/75">
            Format requis: {adCreativeGuidelines.placementRestrictions.news.format}
          </p>
          <p className="mt-1 text-sm text-kode01-noir/75">
            Taille recommandee: {adCreativeGuidelines.placementRestrictions.news.preferredSize.width}x{adCreativeGuidelines.placementRestrictions.news.preferredSize.height}
          </p>
          <p className="mt-1 text-sm text-kode01-noir/75">
            Hauteur visuelle max en rendu: {adCreativeGuidelines.placementRestrictions.news.maxVisualHeightPx}px
          </p>
          <p className="mt-3 text-sm text-kode01-noir/75">
            {adCreativeGuidelines.placementRestrictions.news.recommendation}
          </p>
        </section>
      </main>
      <BaseFooter />
    </div>
  );
}

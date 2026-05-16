'use client';

import { useState } from 'react';
import { Copy, Check, Download, Bot, Server, Globe } from 'lucide-react';
import type { AgentBlueprintManifest, AgentLicenseType } from '../types';
import { BlueprintVerifiedBadge } from './BlueprintBadges';

interface BlueprintAccessPanelProps {
  productId: string;
  manifest: AgentBlueprintManifest;
  readmeContent: string | null;
  licenseType: AgentLicenseType;
  isVetted: boolean;
  locale: string;
}

const LICENSE_LABELS: Record<AgentLicenseType, { en: string; fr: string }> = {
  personal: { en: 'Personal', fr: 'Personnelle' },
  commercial: { en: 'Commercial', fr: 'Commerciale' },
  enterprise: { en: 'Enterprise', fr: 'Entreprise' },
  open: { en: 'Open', fr: 'Ouverte' },
};

export function BlueprintAccessPanel({
  productId,
  manifest,
  readmeContent,
  licenseType,
  isVetted,
  locale,
}: BlueprintAccessPanelProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);

  async function handleCopyPrompt() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent-blueprints/${productId}/content`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      await navigator.clipboard.writeText(data.prompt_content ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy prompt failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center gap-3">
        <Bot size={20} className="text-violet-600" />
        <h3 className="text-lg font-serif font-black text-kode01-noir">
          {t('Blueprint Access', 'Acces au blueprint')}
        </h3>
        {isVetted && <BlueprintVerifiedBadge locale={locale} />}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleCopyPrompt}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-kode01-pink text-kode01-noir text-sm font-bold transition-all hover:shadow-lg disabled:opacity-60 cursor-pointer"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied
            ? t('Copied!', 'Copie !')
            : t('Copy System Prompt', 'Copier le prompt systeme')}
        </button>

        <a
          href={`/api/agent-blueprints/${productId}/export`}
          className="flex items-center gap-2 px-5 py-3 rounded-full bg-kode01-noir text-white text-sm font-bold transition-all hover:shadow-lg"
        >
          <Download size={16} />
          {t('Download Blueprint (.json)', 'Telecharger le blueprint (.json)')}
        </a>
      </div>

      {/* Manifest details */}
      <div className="bg-kode01-cream/50 rounded-2xl border border-black/5 p-6 space-y-4">
        <h4 className="text-xs font-black text-kode01-noir/40 uppercase tracking-widest">
          {t('Blueprint Details', 'Details du blueprint')}
        </h4>

        {manifest.version && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-kode01-noir/50 font-bold">
              {t('Version', 'Version')}:
            </span>
            <span className="font-mono font-bold text-kode01-noir">{manifest.version}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-kode01-noir/50 font-bold">
            {t('License', 'Licence')}:
          </span>
          <span className="font-bold text-kode01-noir">
            {LICENSE_LABELS[licenseType]?.[locale === 'fr' ? 'fr' : 'en'] ?? licenseType}
          </span>
        </div>

        {manifest.compatible_models?.length > 0 && (
          <div>
            <span className="text-xs font-black text-kode01-noir/40 uppercase tracking-widest">
              {t('Compatible Models', 'Modeles compatibles')}
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {manifest.compatible_models.map((model) => (
                <span
                  key={model}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-black/5 text-xs font-bold text-kode01-noir"
                >
                  <Server size={10} className="text-kode01-noir/40" />
                  {model}
                </span>
              ))}
            </div>
          </div>
        )}

        {manifest.deployment_targets?.length > 0 && (
          <div>
            <span className="text-xs font-black text-kode01-noir/40 uppercase tracking-widest">
              {t('Deployment Targets', 'Cibles de deploiement')}
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {manifest.deployment_targets.map((target) => (
                <span
                  key={target}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-black/5 text-xs font-bold text-kode01-noir"
                >
                  <Globe size={10} className="text-kode01-noir/40" />
                  {target}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* README */}
      {readmeContent && (
        <div className="bg-white rounded-2xl border border-black/5 p-6 space-y-3">
          <h4 className="text-xs font-black text-kode01-noir/40 uppercase tracking-widest">
            {t('Installation Instructions', 'Instructions d\'installation')}
          </h4>
          <div className="prose prose-sm max-w-none text-kode01-noir/80 whitespace-pre-wrap">
            {readmeContent}
          </div>
        </div>
      )}
    </div>
  );
}

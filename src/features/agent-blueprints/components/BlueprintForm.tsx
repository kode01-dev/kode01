'use client';

import { useState } from 'react';
import { Save, Upload } from 'lucide-react';
import {
  AGENT_LICENSE_TYPES,
  KNOWN_MODELS,
  KNOWN_DEPLOYMENT_TARGETS,
  agentBlueprintFormDefaults,
} from '../types';
import type { AgentBlueprintFormState, AgentLicenseType } from '../types';
import ToolsConfigBuilder, { type ToolConfig } from './ToolsConfigBuilder';

interface BlueprintFormProps {
  productId: string;
  locale: string;
  initial?: Partial<AgentBlueprintFormState>;
  onSuccess?: () => void;
}

const LICENSE_LABELS: Record<AgentLicenseType, { en: string; fr: string }> = {
  personal: { en: 'Personal', fr: 'Personnelle' },
  commercial: { en: 'Commercial', fr: 'Commerciale' },
  enterprise: { en: 'Enterprise', fr: 'Entreprise' },
  open: { en: 'Open', fr: 'Ouverte' },
};

export function BlueprintForm({
  productId,
  locale,
  initial,
  onSuccess,
}: BlueprintFormProps): React.JSX.Element {
  const [form, setForm] = useState<AgentBlueprintFormState>({
    ...agentBlueprintFormDefaults,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Parse initial tools_config_raw into structured tools for the builder
  const [toolsBuilder, setToolsBuilder] = useState<ToolConfig[]>(() => {
    if (!form.tools_config_raw.trim()) return [];
    try {
      const parsed = JSON.parse(form.tools_config_raw);
      if (Array.isArray(parsed)) {
        return parsed.map((t: Record<string, unknown>) => ({
          name: String(t.name ?? ''),
          description: String(t.description ?? ''),
          parameters: typeof t.parameters === 'string' ? t.parameters : JSON.stringify(t.parameters ?? {}, null, 2),
        }));
      }
    } catch { /* ignore */ }
    return [];
  });

  function handleToolsChange(tools: ToolConfig[]) {
    setToolsBuilder(tools);
    // Sync back to raw JSON for submission
    const serialized = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: (() => { try { return JSON.parse(t.parameters); } catch { return {}; } })(),
    }));
    updateField('tools_config_raw', JSON.stringify(serialized, null, 2));
  }

  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);

  function updateField<K extends keyof AgentBlueprintFormState>(
    key: K,
    value: AgentBlueprintFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(false);
  }

  function toggleArrayItem(
    key: 'compatible_models' | 'deployment_targets',
    item: string,
  ) {
    setForm((prev) => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(item)
          ? arr.filter((v) => v !== item)
          : [...arr, item],
      };
    });
  }

  async function handleSubmit() {
    // Validate
    if (!form.manifest_name.trim()) {
      setError(t('Blueprint name is required', 'Le nom du blueprint est requis'));
      return;
    }
    if (!form.prompt_content.trim()) {
      setError(t('System prompt is required', 'Le prompt systeme est requis'));
      return;
    }

    // Validate tools JSON
    let parsedTools: Record<string, unknown> | null = null;
    if (form.tools_config_raw.trim()) {
      try {
        parsedTools = JSON.parse(form.tools_config_raw);
      } catch {
        setError(t('Tools configuration must be valid JSON', 'La configuration des outils doit etre du JSON valide'));
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/agent-blueprints/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          prompt_content: form.prompt_content,
          tools_config: parsedTools,
          manifest: {
            name: form.manifest_name,
            version: form.manifest_version,
            compatible_models: form.compatible_models,
            deployment_targets: form.deployment_targets,
          },
          readme_content: form.readme_content || null,
          license_type: form.license_type,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save');
      }

      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h2 className="text-2xl font-serif font-black text-kode01-noir">
        {t('Publish an AI Agent Blueprint', 'Publier un plan d\'agent IA')}
      </h2>

      {/* Section 1: System Prompt */}
      <section className="space-y-3">
        <label className="text-xs font-black text-kode01-noir/50 uppercase tracking-widest">
          {t('System Prompt', 'Prompt systeme')} *
        </label>
        <textarea
          value={form.prompt_content}
          onChange={(e) => updateField('prompt_content', e.target.value)}
          placeholder={t(
            'Paste your optimised system prompt here...',
            'Collez votre prompt systeme optimise ici...',
          )}
          rows={12}
          className="w-full rounded-xl border border-black/10 bg-white p-4 font-mono text-sm text-kode01-noir placeholder:text-kode01-noir/30 focus:outline-none focus:border-kode01-pink/50 resize-y"
        />
        <p className="text-xs text-kode01-noir/40">
          {form.prompt_content.length.toLocaleString()} {t('characters', 'caracteres')}
        </p>
      </section>

      {/* Section 2: Tools Configuration — Visual Builder */}
      <section className="space-y-3">
        <label className="text-xs font-black text-kode01-noir/50 uppercase tracking-widest">
          {t('Tools Configuration', 'Configuration des outils')}
        </label>
        <p className="text-xs text-kode01-noir/40">
          {t(
            'Add tools your agent can use. Each tool needs a name, description, and JSON parameters schema.',
            'Ajoutez les outils que votre agent peut utiliser. Chaque outil a besoin d\'un nom, d\'une description et d\'un schema de parametres JSON.',
          )}
        </p>
        <ToolsConfigBuilder
          value={toolsBuilder}
          onChange={handleToolsChange}
        />
      </section>

      {/* Section 3: Manifest */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-kode01-noir/50 uppercase tracking-widest">
          {t('Blueprint Details', 'Details du blueprint')}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-kode01-noir/60">
              {t('Name', 'Nom')} *
            </label>
            <input
              type="text"
              value={form.manifest_name}
              onChange={(e) => updateField('manifest_name', e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm text-kode01-noir focus:outline-none focus:border-kode01-pink/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-kode01-noir/60">
              {t('Version', 'Version')}
            </label>
            <input
              type="text"
              value={form.manifest_version}
              onChange={(e) => updateField('manifest_version', e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm text-kode01-noir focus:outline-none focus:border-kode01-pink/50"
            />
          </div>
        </div>

        {/* Compatible Models */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-kode01-noir/60">
            {t('Compatible Models', 'Modeles compatibles')}
          </label>
          <div className="flex flex-wrap gap-2">
            {KNOWN_MODELS.map((model) => {
              const selected = form.compatible_models.includes(model);
              return (
                <button
                  key={model}
                  type="button"
                  onClick={() => toggleArrayItem('compatible_models', model)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                    selected
                      ? 'bg-kode01-pink border-kode01-pink text-kode01-noir'
                      : 'bg-white border-black/10 text-kode01-noir/60 hover:border-kode01-pink'
                  }`}
                >
                  {model}
                </button>
              );
            })}
          </div>
        </div>

        {/* Deployment Targets */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-kode01-noir/60">
            {t('Deployment Targets', 'Cibles de deploiement')}
          </label>
          <div className="flex flex-wrap gap-2">
            {KNOWN_DEPLOYMENT_TARGETS.map((target) => {
              const selected = form.deployment_targets.includes(target);
              return (
                <button
                  key={target}
                  type="button"
                  onClick={() => toggleArrayItem('deployment_targets', target)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                    selected
                      ? 'bg-kode01-pink border-kode01-pink text-kode01-noir'
                      : 'bg-white border-black/10 text-kode01-noir/60 hover:border-kode01-pink'
                  }`}
                >
                  {target}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 4: README */}
      <section className="space-y-3">
        <label className="text-xs font-black text-kode01-noir/50 uppercase tracking-widest">
          {t('Installation Instructions', 'Instructions d\'installation')}
        </label>
        <textarea
          value={form.readme_content}
          onChange={(e) => updateField('readme_content', e.target.value)}
          placeholder={t(
            'Explain how to import this agent into Cursor, LibreChat, Dify, etc.',
            'Expliquez comment importer cet agent dans Cursor, LibreChat, Dify, etc.',
          )}
          rows={6}
          className="w-full rounded-xl border border-black/10 bg-white p-4 text-sm text-kode01-noir placeholder:text-kode01-noir/30 focus:outline-none focus:border-kode01-pink/50 resize-y"
        />
      </section>

      {/* Section 5: License Type */}
      <section className="space-y-3">
        <label className="text-xs font-black text-kode01-noir/50 uppercase tracking-widest">
          {t('License Type', 'Type de licence')}
        </label>
        <div className="flex flex-wrap gap-2">
          {AGENT_LICENSE_TYPES.map((lt) => {
            const selected = form.license_type === lt;
            return (
              <button
                key={lt}
                type="button"
                onClick={() => updateField('license_type', lt)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                  selected
                    ? 'bg-kode01-pink border-kode01-pink text-kode01-noir'
                    : 'bg-white border-black/10 text-kode01-noir/60 hover:border-kode01-pink'
                }`}
              >
                {LICENSE_LABELS[lt][locale === 'fr' ? 'fr' : 'en']}
              </button>
            );
          })}
        </div>
      </section>

      {/* Error / Success */}
      {error && (
        <p className="text-sm font-bold text-red-600 bg-red-50 rounded-lg px-4 py-3">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-lg px-4 py-3">
          {t('Blueprint saved successfully!', 'Blueprint enregistre avec succes !')}
        </p>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-kode01-noir text-white text-sm font-bold transition-all hover:shadow-lg disabled:opacity-60 cursor-pointer"
        >
          {saving ? (
            <Save size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {t('Publish Blueprint', 'Publier le blueprint')}
        </button>
      </div>
    </div>
  );
}

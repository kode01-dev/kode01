'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  GitBranch,
  History,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Settings2,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { Json } from '@/types/database.types';

type AgentProfile = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived' | string;
  version: number;
  nodes_config: Json;
  run_config: Json;
  updated_at: string;
  activated_at: string | null;
};

type AgentRun = {
  id: string;
  job_id: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead_letter' | string;
  input: Json;
  node_statuses: Json;
  qa_report: Json;
  error_message: string | null;
  editorial_post_id: string | null;
  created_at: string;
  finished_at: string | null;
  editorial_post?: {
    id: string;
    slug: string;
    title: string;
    locale: string;
  } | null;
};

type ProfileResponse = {
  profiles?: AgentProfile[];
  activeProfile?: AgentProfile | null;
  error?: string;
};

type RunsResponse = {
  data?: AgentRun[];
  total?: number;
  error?: string;
};

type RunInput = {
  keyword: string;
  title: string;
  locale: 'fr' | 'en';
  locationName: string;
  targetLanguage: string;
  clientDomain: string;
  aboutPage: string;
  authorPage: string;
  targetAudience: string;
  briefSummary: string;
  secondaryKeyword: string;
  tertiaryKeyword: string;
  category: string;
  internalLinks: string;
  competitorUrls: string;
};

type FlowNode = {
  id: string;
  label: string;
  group: string;
  x: number;
  y: number;
};

const FLOW_NODES: FlowNode[] = [
  { id: 'input', label: 'Input', group: 'Request', x: 4, y: 14 },
  { id: 'serp', label: 'SERP', group: 'Research', x: 21, y: 14 },
  { id: 'competitor_scrape', label: 'Scrape', group: 'Research', x: 38, y: 14 },
  { id: 'competitor_extract', label: 'Extract', group: 'Research', x: 55, y: 14 },
  { id: 'aggregate', label: 'Aggregate', group: 'Research', x: 72, y: 14 },
  { id: 'nlp_map', label: 'NLP Map', group: 'Strategy', x: 13, y: 40 },
  { id: 'intent', label: 'Intent', group: 'Strategy', x: 30, y: 40 },
  { id: 'information_gain', label: 'Info Gain', group: 'Strategy', x: 47, y: 40 },
  { id: 'writer_directive', label: 'Directive', group: 'Strategy', x: 64, y: 40 },
  { id: 'title_h1', label: 'Title H1', group: 'Drafting', x: 81, y: 40 },
  { id: 'author_about', label: 'E-E-A-T', group: 'Drafting', x: 13, y: 66 },
  { id: 'outline', label: 'Outline', group: 'Drafting', x: 30, y: 66 },
  { id: 'article_html', label: 'HTML', group: 'Drafting', x: 47, y: 66 },
  { id: 'html_cleanup', label: 'Clean', group: 'QA', x: 64, y: 66 },
  { id: 'markdown_convert', label: 'Markdown', group: 'QA', x: 81, y: 66 },
  { id: 'quality_gate', label: 'QA Gate', group: 'Publish', x: 35, y: 88 },
  { id: 'cms_draft', label: 'CMS Draft', group: 'Publish', x: 55, y: 88 },
];

const FLOW_EDGES = FLOW_NODES.slice(0, -1).map((node, index) => [node.id, FLOW_NODES[index + 1].id] as const);

const defaultInput: RunInput = {
  keyword: '',
  title: '',
  locale: 'fr',
  locationName: 'Canada',
  targetLanguage: 'French',
  clientDomain: '',
  aboutPage: '',
  authorPage: '',
  targetAudience: '',
  briefSummary: '',
  secondaryKeyword: '',
  tertiaryKeyword: '',
  category: 'SEO',
  internalLinks: '',
  competitorUrls: '',
};

function text(locale: string) {
  const fr = locale === 'fr';
  return {
    loadError: fr ? 'Impossible de charger agent.' : 'Unable to load agent.',
    run: fr ? 'Generer un draft' : 'Generate draft',
    running: fr ? 'Generation lancee' : 'Generation started',
    createDraft: fr ? 'Creer une version draft' : 'Create draft version',
    activate: fr ? 'Activer ce profil' : 'Activate profile',
    rollback: fr ? 'Restaurer actif' : 'Restore as active',
    save: fr ? 'Sauvegarder le draft' : 'Save draft',
    active: fr ? 'Actif' : 'Active',
    draft: fr ? 'Draft' : 'Draft',
    archived: fr ? 'Archive' : 'Archived',
    profile: fr ? 'Profil' : 'Profile',
    runForm: fr ? 'Nouvelle generation' : 'New generation',
    flow: fr ? 'Flow LangGraph' : 'LangGraph flow',
    nodeConfig: fr ? 'Configuration du noeud' : 'Node configuration',
    recentRuns: fr ? 'Runs recents' : 'Recent runs',
    noRuns: fr ? 'Aucun run pour le moment.' : 'No runs yet.',
    cmsDraft: fr ? 'Draft CMS' : 'CMS draft',
    modalRequired: fr ? 'Modal doit etre configure pour lancer ce flow.' : 'Modal must be configured to run this flow.',
    activeCannotEdit: fr ? 'Cree une version draft pour modifier les prompts/configs.' : 'Create a draft version to edit prompts/configs.',
  };
}

function safeRecord(value: Json | undefined | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeArrayText(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusClass(status: string) {
  if (status === 'succeeded' || status === 'active') return 'bg-kode01-green/10 text-kode01-green border-kode01-green/20';
  if (status === 'failed' || status === 'dead_letter') return 'bg-red-50 text-red-600 border-red-200';
  if (status === 'running' || status === 'queued') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'draft') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-black/[0.03] text-kode01-noir/55 border-black/10';
}

function dt(value: string | null | undefined, locale: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function nodeStatus(nodeId: string, runs: AgentRun[]) {
  const latest = runs[0];
  const statuses = safeRecord(latest?.node_statuses);
  const entry = safeRecord(statuses[nodeId] as Json);
  return typeof entry.status === 'string' ? entry.status : 'idle';
}

function nodeConfig(profile: AgentProfile | null, nodeId: string): Record<string, unknown> {
  const nodes = safeRecord(profile?.nodes_config);
  return safeRecord(nodes[nodeId] as Json);
}

function setNodeConfig(profile: AgentProfile, nodeId: string, nextConfig: Record<string, unknown>): AgentProfile {
  const nodes = safeRecord(profile.nodes_config);
  return {
    ...profile,
    nodes_config: {
      ...nodes,
      [nodeId]: nextConfig,
    } as Json,
  };
}

export function SeoBlogAgentAdminPanel({ locale }: { locale: string }) {
  const t = useMemo(() => text(locale), [locale]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<AgentProfile | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [draftProfile, setDraftProfile] = useState<AgentProfile | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState('outline');
  const [runInput, setRunInput] = useState<RunInput>(defaultInput);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = draftProfile ?? profiles.find((profile) => profile.id === selectedProfileId) ?? activeProfile;
  const selectedNode = FLOW_NODES.find((node) => node.id === selectedNodeId) ?? FLOW_NODES[0];
  const selectedConfig = nodeConfig(selectedProfile ?? null, selectedNode.id);
  const canEdit = selectedProfile?.status === 'draft';

  async function load() {
    setError(null);
    try {
      const [profilesRes, runsRes] = await Promise.all([
        fetch('/api/admin/seo-blog-agent/profile', { cache: 'no-store' }),
        fetch('/api/admin/seo-blog-agent/runs?page=1&pageSize=12', { cache: 'no-store' }),
      ]);
      const profilesBody = await profilesRes.json().catch(() => null) as ProfileResponse | null;
      const runsBody = await runsRes.json().catch(() => null) as RunsResponse | null;
      if (!profilesRes.ok) throw new Error(profilesBody?.error ?? t.loadError);
      if (!runsRes.ok) throw new Error(runsBody?.error ?? t.loadError);
      const nextProfiles = profilesBody?.profiles ?? [];
      setProfiles(nextProfiles);
      setActiveProfile(profilesBody?.activeProfile ?? null);
      setSelectedProfileId((current) => current || profilesBody?.activeProfile?.id || nextProfiles[0]?.id || '');
      setRuns(runsBody?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loadError);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateInput<K extends keyof RunInput>(key: K, value: RunInput[K]) {
    setRunInput((current) => ({ ...current, [key]: value }));
  }

  function updateSelectedNode(next: Record<string, unknown>) {
    if (!selectedProfile || !canEdit) return;
    const updated = setNodeConfig(selectedProfile, selectedNode.id, next);
    setDraftProfile(updated);
  }

  async function createDraftProfile() {
    if (!selectedProfile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/seo-blog-agent/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceProfileId: selectedProfile.id }),
      });
      const body = await res.json().catch(() => null) as { profile?: AgentProfile; error?: string } | null;
      if (!res.ok || !body?.profile) throw new Error(body?.error ?? 'Unable to create draft profile');
      setDraftProfile(body.profile);
      setSelectedProfileId(body.profile.id);
      setProfiles((current) => [body.profile as AgentProfile, ...current]);
      setMessage('Draft profile created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create draft profile');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!selectedProfile || !canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/seo-blog-agent/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedProfile.id,
          action: 'save',
          name: selectedProfile.name,
          description: selectedProfile.description,
          nodes_config: safeRecord(selectedProfile.nodes_config),
          run_config: safeRecord(selectedProfile.run_config),
        }),
      });
      const body = await res.json().catch(() => null) as { profile?: AgentProfile; error?: string } | null;
      if (!res.ok || !body?.profile) throw new Error(body?.error ?? 'Unable to save profile');
      setDraftProfile(body.profile);
      setProfiles((current) => current.map((profile) => profile.id === body.profile?.id ? body.profile : profile));
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile');
    } finally {
      setBusy(false);
    }
  }

  async function activateProfile() {
    if (!selectedProfile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/seo-blog-agent/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProfile.id, action: 'activate' }),
      });
      const body = await res.json().catch(() => null) as { profile?: AgentProfile; error?: string } | null;
      if (!res.ok || !body?.profile) throw new Error(body?.error ?? 'Unable to activate profile');
      setDraftProfile(null);
      await load();
      setSelectedProfileId(body.profile.id);
      setMessage('Profile activated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to activate profile');
    } finally {
      setBusy(false);
    }
  }

  async function runAgent() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const input = {
        ...runInput,
        internalLinks: safeArrayText(runInput.internalLinks),
        competitorUrls: safeArrayText(runInput.competitorUrls),
      };
      const res = await fetch('/api/admin/seo-blog-agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: activeProfile?.id,
          input,
          saveToCms: true,
        }),
      });
      const body = await res.json().catch(() => null) as { jobId?: string; error?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? t.modalRequired);
      setMessage(`${t.running}${body?.jobId ? `: ${body.jobId}` : ''}`);
      window.setTimeout(() => void load(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.modalRequired);
    } finally {
      setBusy(false);
    }
  }

  const lineById = useMemo(() => new Map(FLOW_NODES.map((node) => [node.id, node])), []);

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-2xl border border-kode01-green/25 bg-kode01-green/10 px-4 py-3 text-sm font-semibold text-kode01-green">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-black/5 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-kode01-noir/35">{t.runForm}</p>
              <h2 className="mt-1 text-lg font-black text-kode01-noir">SEO brief</h2>
            </div>
            <Bot size={22} className="text-kode01-pink" />
          </div>

          <div className="mt-5 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Keyword</span>
              <input value={runInput.keyword} onChange={(event) => updateInput('keyword', event.target.value)} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Title</span>
              <input value={runInput.title} onChange={(event) => updateInput('title', event.target.value)} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Locale</span>
                <select value={runInput.locale} onChange={(event) => updateInput('locale', event.target.value as 'fr' | 'en')} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm">
                  <option value="fr">fr-CA</option>
                  <option value="en">en-CA</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Location</span>
                <input value={runInput.locationName} onChange={(event) => updateInput('locationName', event.target.value)} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm" />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Client domain</span>
              <input value={runInput.clientDomain} onChange={(event) => updateInput('clientDomain', event.target.value)} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm" />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={runInput.aboutPage} onChange={(event) => updateInput('aboutPage', event.target.value)} placeholder="About page URL" className="h-10 rounded-xl border border-black/10 px-3 text-sm" />
              <input value={runInput.authorPage} onChange={(event) => updateInput('authorPage', event.target.value)} placeholder="Author page URL" className="h-10 rounded-xl border border-black/10 px-3 text-sm" />
            </div>
            <textarea value={runInput.targetAudience} onChange={(event) => updateInput('targetAudience', event.target.value)} rows={2} placeholder="Target audience" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            <textarea value={runInput.briefSummary} onChange={(event) => updateInput('briefSummary', event.target.value)} rows={3} placeholder="Brief summary" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            <textarea value={runInput.internalLinks} onChange={(event) => updateInput('internalLinks', event.target.value)} rows={3} placeholder="Internal links, one per line" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            <textarea value={runInput.competitorUrls} onChange={(event) => updateInput('competitorUrls', event.target.value)} rows={3} placeholder="Optional competitor URLs, one per line" className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
            <button
              type="button"
              disabled={busy || !runInput.keyword.trim() || !runInput.title.trim()}
              onClick={() => void runAgent()}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-kode01-noir px-4 text-xs font-black uppercase tracking-widest text-white transition-transform active:scale-[0.98] disabled:opacity-45"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {t.run}
            </button>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-black/5 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-kode01-noir/35">{t.profile}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={selectedProfile?.id ?? ''} onChange={(event) => { setDraftProfile(null); setSelectedProfileId(event.target.value); }} className="h-10 rounded-xl border border-black/10 px-3 text-sm font-semibold">
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} v{profile.version} [{profile.status}]
                      </option>
                    ))}
                  </select>
                  {selectedProfile ? (
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(selectedProfile.status)}`}>
                      {selectedProfile.status}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void createDraftProfile()} disabled={busy || !selectedProfile} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-45">
                  <GitBranch size={14} /> {t.createDraft}
                </button>
                <button type="button" onClick={() => void saveProfile()} disabled={busy || !canEdit} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-black uppercase tracking-widest disabled:opacity-45">
                  <Save size={14} /> {t.save}
                </button>
                <button type="button" onClick={() => void activateProfile()} disabled={busy || !selectedProfile || selectedProfile.status === 'active'} className="inline-flex items-center gap-2 rounded-xl bg-kode01-pink px-3 py-2 text-xs font-black uppercase tracking-widest text-kode01-noir disabled:opacity-45">
                  <CheckCircle2 size={14} /> {selectedProfile?.status === 'archived' ? t.rollback : t.activate}
                </button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-3xl border border-black/5 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-kode01-noir/35">{t.flow}</p>
                  <h2 className="mt-1 text-lg font-black text-kode01-noir">seo-blog-writer.generate</h2>
                </div>
                <Settings2 size={20} className="text-kode01-noir/45" />
              </div>

              <div className="relative mt-5 hidden h-[560px] overflow-hidden rounded-2xl border border-black/10 bg-kode01-cream/40 lg:block">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  {FLOW_EDGES.map(([from, to]) => {
                    const a = lineById.get(from);
                    const b = lineById.get(to);
                    if (!a || !b) return null;
                    return <line key={`${from}-${to}`} x1={a.x + 5} y1={a.y + 3} x2={b.x} y2={b.y + 3} stroke="rgba(30,30,30,0.16)" strokeWidth="0.35" />;
                  })}
                </svg>
                {FLOW_NODES.map((node) => {
                  const status = nodeStatus(node.id, runs);
                  const selected = node.id === selectedNode.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`absolute w-[116px] rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition-transform active:scale-[0.98] ${selected ? 'border-kode01-pink ring-2 ring-kode01-pink/10' : 'border-black/10 hover:border-kode01-sauge/40'}`}
                      style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-black text-kode01-noir">{node.label}</span>
                        {status === 'succeeded' ? <CheckCircle2 size={13} className="text-kode01-green" /> : status === 'failed' ? <AlertTriangle size={13} className="text-red-600" /> : <Circle size={12} className="text-kode01-noir/30" />}
                      </div>
                      <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wider text-kode01-noir/35">{node.group}</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2 lg:hidden">
                {FLOW_NODES.map((node) => (
                  <button key={node.id} type="button" onClick={() => setSelectedNodeId(node.id)} className="flex items-center justify-between rounded-xl border border-black/10 bg-kode01-cream/30 px-3 py-2 text-left">
                    <span className="text-sm font-bold">{node.label}</span>
                    <span className="text-[10px] uppercase tracking-widest text-kode01-noir/45">{nodeStatus(node.id, runs)}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside className="rounded-3xl border border-black/5 bg-white p-5">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-kode01-pink" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-kode01-noir/35">{t.nodeConfig}</p>
                  <h3 className="text-base font-black">{selectedNode.label}</h3>
                </div>
              </div>
              {!canEdit ? (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">{t.activeCannotEdit}</p>
              ) : null}
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={selectedConfig.enabled !== false}
                    onChange={(event) => updateSelectedNode({ ...selectedConfig, enabled: event.target.checked })}
                  />
                  Enabled
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Provider</span>
                  <input disabled={!canEdit} value={String(selectedConfig.provider ?? '')} onChange={(event) => updateSelectedNode({ ...selectedConfig, provider: event.target.value })} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm disabled:bg-black/[0.03]" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Model</span>
                  <input disabled={!canEdit} value={String(selectedConfig.model ?? '')} onChange={(event) => updateSelectedNode({ ...selectedConfig, model: event.target.value })} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm disabled:bg-black/[0.03]" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Prompt override</span>
                  <textarea disabled={!canEdit} value={String(selectedConfig.prompt ?? '')} onChange={(event) => updateSelectedNode({ ...selectedConfig, prompt: event.target.value })} rows={8} className="w-full rounded-xl border border-black/10 px-3 py-2 font-mono text-xs disabled:bg-black/[0.03]" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Max tokens</span>
                    <input disabled={!canEdit} type="number" value={Number(selectedConfig.maxTokens ?? 0)} onChange={(event) => updateSelectedNode({ ...selectedConfig, maxTokens: Number(event.target.value) })} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm disabled:bg-black/[0.03]" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-widest text-kode01-noir/55">Min words</span>
                    <input disabled={!canEdit} type="number" value={Number(selectedConfig.minWords ?? 0)} onChange={(event) => updateSelectedNode({ ...selectedConfig, minWords: Number(event.target.value) })} className="h-10 w-full rounded-xl border border-black/10 px-3 text-sm disabled:bg-black/[0.03]" />
                  </label>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </div>

      <section className="rounded-3xl border border-black/5 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History size={18} className="text-kode01-noir/45" />
            <h2 className="text-lg font-black">{t.recentRuns}</h2>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-black uppercase tracking-widest">
            <RotateCcw size={13} /> Refresh
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-black/10 bg-kode01-cream/30 px-4 py-6 text-sm font-semibold text-kode01-noir/45">{t.noRuns}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-[10px] uppercase tracking-widest text-kode01-noir/45">
                  <th className="py-2 pr-4">Input</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">QA</th>
                  <th className="py-2 pr-4">{t.cmsDraft}</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const input = safeRecord(run.input);
                  const qa = safeRecord(run.qa_report);
                  return (
                    <tr key={run.id} className="border-b border-black/5">
                      <td className="max-w-[280px] py-3 pr-4">
                        <p className="truncate text-xs font-black">{String(input.keyword ?? '-')}</p>
                        <p className="truncate text-[11px] text-kode01-noir/45">{String(input.title ?? '')}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusClass(run.status)}`}>{run.status}</span>
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {typeof qa.word_count === 'number' ? `${qa.word_count} words` : '-'}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {run.editorial_post ? (
                          <Link href="/admin/cms/editor" className="inline-flex items-center gap-1 font-bold text-kode01-pink">
                            {run.editorial_post.slug}
                            <ExternalLink size={12} />
                          </Link>
                        ) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-kode01-noir/55">{dt(run.created_at, locale)}</td>
                      <td className="max-w-[320px] py-3 pr-4 text-xs text-red-600">
                        <span className="line-clamp-2">{run.error_message ?? '-'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

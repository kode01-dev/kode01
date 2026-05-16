// ---- Database row types ----

export interface AgentBlueprintRow {
  id: string;
  product_id: string;
  prompt_content: string | null;
  tools_config: Record<string, unknown> | null;
  manifest: AgentBlueprintManifest;
  readme_content: string | null;
  license_type: AgentLicenseType;
  is_vetted: boolean;
  vetted_at: string | null;
  vetted_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Public-safe projection (no prompt_content or tools_config). */
export interface AgentBlueprintPublicRow {
  id: string;
  product_id: string;
  manifest: AgentBlueprintManifest;
  readme_content: string | null;
  license_type: AgentLicenseType;
  is_vetted: boolean;
  created_at: string;
  updated_at: string;
}

// ---- Manifest schema ----

export interface AgentBlueprintManifest {
  name: string;
  version: string;
  compatible_models: string[];
  deployment_targets: string[];
  description?: string;
  author?: string;
}

export type AgentLicenseType = 'personal' | 'commercial' | 'enterprise' | 'open';

export const AGENT_LICENSE_TYPES: AgentLicenseType[] = [
  'personal',
  'commercial',
  'enterprise',
  'open',
];

export const KNOWN_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3.5-sonnet',
  'claude-opus-4',
  'llama-3',
  'gemini-pro',
] as const;

export const KNOWN_DEPLOYMENT_TARGETS = [
  'Cursor',
  'LibreChat',
  'Dify',
  'Docker',
  'Vercel',
  'Local CLI',
  'API',
] as const;

// ---- Seller form types ----

export interface AgentBlueprintFormState {
  prompt_content: string;
  tools_config_raw: string;
  manifest_name: string;
  manifest_version: string;
  compatible_models: string[];
  deployment_targets: string[];
  readme_content: string;
  license_type: AgentLicenseType;
}

export const agentBlueprintFormDefaults: AgentBlueprintFormState = {
  prompt_content: '',
  tools_config_raw: '[]',
  manifest_name: '',
  manifest_version: '1.0.0',
  compatible_models: [],
  deployment_targets: [],
  readme_content: '',
  license_type: 'personal',
};

// ---- Buyer unlocked content ----

export interface AgentBlueprintUnlockedContent {
  prompt_content: string;
  tools_config: Record<string, unknown> | null;
  manifest: AgentBlueprintManifest;
  readme_content: string | null;
  license_type: AgentLicenseType;
}

// ---- Blueprint export format (.json download) ----

export interface AgentBlueprintExport {
  schema_version: '1.0';
  manifest: AgentBlueprintManifest;
  system_prompt: string;
  tools: Record<string, unknown> | null;
  readme: string | null;
  license: AgentLicenseType;
  exported_at: string;
}

// ---- Category slug constant ----

export const AGENT_BLUEPRINTS_CATEGORY_SLUG = 'ai-agent-blueprints' as const;

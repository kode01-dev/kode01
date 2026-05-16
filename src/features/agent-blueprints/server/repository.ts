import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createPublicServerClient } from '@/lib/supabase/server-public';
import type { Database } from '@/types/database.types';
import type {
  AgentBlueprintManifest,
  AgentBlueprintPublicRow,
  AgentLicenseType,
} from '../types';

/** Columns safe to expose publicly (no prompt_content or tools_config). */
const PUBLIC_SELECT =
  'id, product_id, manifest, readme_content, license_type, is_vetted, created_at, updated_at' as const;

/** All columns (only for purchase-verified or seller/admin access). */
const FULL_SELECT =
  'id, product_id, prompt_content, tools_config, manifest, readme_content, license_type, is_vetted, vetted_at, vetted_by, created_at, updated_at' as const;

// ---------- Public reads ----------

export async function getBlueprintPublicMetadata(
  productId: string,
): Promise<AgentBlueprintPublicRow | null> {
  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from('agent_blueprints')
    .select(PUBLIC_SELECT)
    .eq('product_id', productId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    manifest: data.manifest as unknown as AgentBlueprintManifest,
    license_type: data.license_type as AgentLicenseType,
  } as AgentBlueprintPublicRow;
}

// ---------- Batch public reads (for market listing enrichment) ----------

export interface BlueprintCardMeta {
  product_id: string;
  manifest: AgentBlueprintManifest;
  is_vetted: boolean;
}

export async function getBlueprintMetadataForProducts(
  productIds: string[],
): Promise<Map<string, BlueprintCardMeta>> {
  if (productIds.length === 0) return new Map();

  const supabase = createPublicServerClient();
  const { data, error } = await supabase
    .from('agent_blueprints')
    .select('product_id, manifest, is_vetted')
    .in('product_id', productIds);

  if (error || !data) return new Map();

  const map = new Map<string, BlueprintCardMeta>();
  for (const row of data) {
    map.set(row.product_id, {
      product_id: row.product_id,
      manifest: (row.manifest ?? {}) as unknown as AgentBlueprintManifest,
      is_vetted: row.is_vetted,
    });
  }
  return map;
}

// ---------- Protected reads (purchase-gated) ----------

export interface BlueprintFullContent {
  prompt_content: string;
  tools_config: Record<string, unknown> | null;
  manifest: AgentBlueprintManifest;
  readme_content: string | null;
  license_type: AgentLicenseType;
}

export async function getBlueprintFullContent(
  supabase: SupabaseClient<Database>,
  productId: string,
): Promise<BlueprintFullContent | null> {
  const { data, error } = await supabase
    .from('agent_blueprints')
    .select(FULL_SELECT)
    .eq('product_id', productId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    prompt_content: data.prompt_content ?? '',
    tools_config: data.tools_config as Record<string, unknown> | null,
    manifest: (data.manifest ?? {}) as unknown as AgentBlueprintManifest,
    readme_content: data.readme_content,
    license_type: (data.license_type as AgentLicenseType) ?? 'personal',
  };
}

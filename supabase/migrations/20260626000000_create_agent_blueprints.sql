-- Migration: AI Agent Blueprints category and structured storage
-- Adds the 5th marketplace category "AI Agent Blueprints" with 3 subcategories,
-- plus a dedicated agent_blueprints table for structured agent content.

SET search_path = '';

-- ============================================================
-- 1. Seed the new category
-- ============================================================

INSERT INTO public.product_categories (slug, name_en, name_fr, description_en, description_fr, display_order, is_active)
VALUES (
  'ai-agent-blueprints',
  'AI Agent Blueprints',
  'Plans d''agents IA',
  'The infrastructure is yours, the expertise is here. Browse AI architectures GitHub-style. Acquire the IP of top prompt engineers. Deploy anywhere.',
  'L''infrastructure vous appartient, l''expertise est ici. Parcourez des architectures d''IA style GitHub. Acquerez la propriete intellectuelle des meilleurs ingenieurs de prompts. Deployez ou vous voulez.',
  50,
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  name_en = EXCLUDED.name_en,
  name_fr = EXCLUDED.name_fr,
  description_en = EXCLUDED.description_en,
  description_fr = EXCLUDED.description_fr,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;

-- ============================================================
-- 2. Seed subcategories
-- ============================================================

INSERT INTO public.product_subcategories (
  category_id,
  slug,
  name_en,
  name_fr,
  description_en,
  description_fr,
  display_order,
  is_active
)
SELECT
  pc.id,
  seeded.slug,
  seeded.name_en,
  seeded.name_fr,
  seeded.description_en,
  seeded.description_fr,
  seeded.display_order,
  true
FROM (
  VALUES
    ('ai-agent-blueprints', 'system-prompts', 'System Prompts', 'Prompts systeme', 'Battle-tested system prompts optimised for production AI agents.', 'Prompts systeme eprouves et optimises pour agents IA en production.', 10),
    ('ai-agent-blueprints', 'mcp-tools-workflows', 'MCP Tools & Workflows', 'Outils MCP et workflows', 'Tool definitions and workflow configurations in MCP or OpenAI function-calling format.', 'Definitions d''outils et configurations de workflows en format MCP ou function-calling OpenAI.', 20),
    ('ai-agent-blueprints', 'full-agent-architectures', 'Full Agent Architectures', 'Architectures d''agents completes', 'Complete agent setups: system prompt, tools, manifest, and deployment guide.', 'Configurations d''agents completes : prompt systeme, outils, manifeste et guide de deploiement.', 30)
) AS seeded(category_slug, slug, name_en, name_fr, description_en, description_fr, display_order)
JOIN public.product_categories AS pc
  ON pc.slug = seeded.category_slug
ON CONFLICT (slug) DO UPDATE
SET
  category_id = EXCLUDED.category_id,
  name_en = EXCLUDED.name_en,
  name_fr = EXCLUDED.name_fr,
  description_en = EXCLUDED.description_en,
  description_fr = EXCLUDED.description_fr,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active;

-- ============================================================
-- 3. Create agent_blueprints table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  -- Protected content (only accessible after purchase)
  prompt_content TEXT,
  tools_config JSONB,

  -- Public metadata (shown on product page pre-purchase)
  manifest JSONB NOT NULL DEFAULT '{}'::JSONB,
  readme_content TEXT,
  license_type TEXT NOT NULL DEFAULT 'personal'
    CHECK (license_type IN ('personal', 'commercial', 'enterprise', 'open')),

  -- Vetting
  is_vetted BOOLEAN NOT NULL DEFAULT false,
  vetted_at TIMESTAMPTZ,
  vetted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(product_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_blueprints_product_id ON public.agent_blueprints(product_id);
CREATE INDEX IF NOT EXISTS idx_agent_blueprints_is_vetted ON public.agent_blueprints(is_vetted);

-- ============================================================
-- 4. RLS policies
-- ============================================================

ALTER TABLE public.agent_blueprints ENABLE ROW LEVEL SECURITY;

-- Sellers can view their own blueprints (full access for editing)
DROP POLICY IF EXISTS "Sellers can view own agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Sellers can view own agent blueprints"
  ON public.agent_blueprints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = agent_blueprints.product_id
        AND p.seller_id = (SELECT auth.uid())
    )
  );

-- Buyers who purchased can view full blueprint (including protected content)
DROP POLICY IF EXISTS "Buyers with purchase can view agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Buyers with purchase can view agent blueprints"
  ON public.agent_blueprints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchases pu
      WHERE pu.product_id = agent_blueprints.product_id
        AND pu.buyer_id = (SELECT auth.uid())
        AND pu.status = 'completed'
    )
  );

-- Public can view blueprint metadata for published products
-- (API routes only SELECT safe columns: manifest, readme, license_type, is_vetted)
DROP POLICY IF EXISTS "Public can view agent blueprint metadata" ON public.agent_blueprints;
CREATE POLICY "Public can view agent blueprint metadata"
  ON public.agent_blueprints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = agent_blueprints.product_id
        AND p.status = 'published'
    )
  );

-- Admins can view all agent blueprints (for vetting)
DROP POLICY IF EXISTS "Admins can view all agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Admins can view all agent blueprints"
  ON public.agent_blueprints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  );

-- Sellers can insert blueprints for their own products
DROP POLICY IF EXISTS "Sellers can insert agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Sellers can insert agent blueprints"
  ON public.agent_blueprints FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = agent_blueprints.product_id
        AND p.seller_id = (SELECT auth.uid())
    )
  );

-- Sellers can update their own blueprints
DROP POLICY IF EXISTS "Sellers can update own agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Sellers can update own agent blueprints"
  ON public.agent_blueprints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = agent_blueprints.product_id
        AND p.seller_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = agent_blueprints.product_id
        AND p.seller_id = (SELECT auth.uid())
    )
  );

-- Admins can update any blueprint (for vetting)
DROP POLICY IF EXISTS "Admins can update agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Admins can update agent blueprints"
  ON public.agent_blueprints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  );

-- Sellers can delete their own blueprints
DROP POLICY IF EXISTS "Sellers can delete own agent blueprints" ON public.agent_blueprints;
CREATE POLICY "Sellers can delete own agent blueprints"
  ON public.agent_blueprints FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = agent_blueprints.product_id
        AND p.seller_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- 5. Updated_at trigger
-- ============================================================

DROP TRIGGER IF EXISTS agent_blueprints_updated_at ON public.agent_blueprints;
CREATE TRIGGER agent_blueprints_updated_at
  BEFORE UPDATE ON public.agent_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. Auto-mapping for existing products with AI/agent tags
-- ============================================================

WITH normalized AS (
  SELECT
    p.id,
    lower(trim(concat_ws(' ',
      COALESCE(p.category, ''),
      COALESCE(array_to_string(p.tags, ' '), '')
    ))) AS haystack
  FROM public.products AS p
  WHERE p.category_id IS NULL
    AND p.status = 'published'
),
mapped AS (
  SELECT
    n.id,
    CASE
      WHEN n.haystack ~ '(system[- ]?prompt|prompt[- ]?engineer|prompt[- ]?template)' THEN 'system-prompts'
      WHEN n.haystack ~ '(mcp[- ]?server|mcp[- ]?tool|function[- ]?call|tool[- ]?definition|openai[- ]?function)' THEN 'mcp-tools-workflows'
      WHEN n.haystack ~ '(agent[- ]?architect|full[- ]?agent|agent[- ]?blueprint|ai[- ]?agent|agent[- ]?config)' THEN 'full-agent-architectures'
      ELSE NULL
    END AS subcategory_slug
  FROM normalized AS n
),
resolved_ids AS (
  SELECT
    m.id,
    pc.id AS category_id,
    psc.id AS subcategory_id
  FROM mapped AS m
  JOIN public.product_subcategories AS psc ON psc.slug = m.subcategory_slug
  JOIN public.product_categories AS pc ON pc.id = psc.category_id
  WHERE m.subcategory_slug IS NOT NULL
)
UPDATE public.products AS p
SET
  category_id = resolved_ids.category_id,
  subcategory_id = resolved_ids.subcategory_id
FROM resolved_ids
WHERE p.id = resolved_ids.id
  AND p.category_id IS NULL;

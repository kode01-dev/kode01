SET search_path = '';

-- 1. Add category column to modules_directory
ALTER TABLE public.modules_directory ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Set categories for existing AI skills
UPDATE public.modules_directory SET category = 'collection'   WHERE slug IN ('awesome-claude-skills', 'awesome-agent-skills');
UPDATE public.modules_directory SET category = 'dev-tools'    WHERE slug IN ('vercel-agent-skills', 'vercel-skills-cli', 'claude-bootstrap');
UPDATE public.modules_directory SET category = 'framework'    WHERE slug IN ('cloudflare-agents');
UPDATE public.modules_directory SET category = 'security'     WHERE slug IN ('trailofbits-skills', 'semgrep-rules', 'semgrep-rule-creator');
UPDATE public.modules_directory SET category = 'ai-ml'        WHERE slug IN ('huggingface-hub', 'ai-research-skills', 'context-engineering-skills');
UPDATE public.modules_directory SET category = 'marketing'    WHERE slug IN ('corey-haines-marketing');
UPDATE public.modules_directory SET category = 'ui'           WHERE slug IN ('ui-skills');
UPDATE public.modules_directory SET category = 'methodology'  WHERE slug IN ('recursive-decomposition', 'tdd-skill-obra');
UPDATE public.modules_directory SET category = 'testing'      WHERE slug IN ('playwright-skill');
UPDATE public.modules_directory SET category = 'integration'  WHERE slug IN ('linear-skill', 'n8n-skills', 'aws-skills');

-- 3. Populate ai_compatibilities
-- Collections: multi-vendor
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT']) FROM public.modules_directory WHERE slug = 'awesome-agent-skills'
ON CONFLICT DO NOTHING;

-- Anthropic / Claude-first skills
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, 'Claude' FROM public.modules_directory WHERE slug IN (
  'awesome-claude-skills',
  'claude-bootstrap',
  'trailofbits-skills',
  'semgrep-rules',
  'semgrep-rule-creator',
  'recursive-decomposition',
  'tdd-skill-obra',
  'playwright-skill',
  'linear-skill',
  'ai-research-skills',
  'n8n-skills',
  'corey-haines-marketing'
)
ON CONFLICT DO NOTHING;

-- Multi-vendor dev-tools & frameworks (work with Claude + Gemini + ChatGPT)
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT']) FROM public.modules_directory WHERE slug IN (
  'vercel-agent-skills',
  'vercel-skills-cli',
  'cloudflare-agents',
  'huggingface-hub',
  'ui-skills',
  'aws-skills',
  'context-engineering-skills'
)
ON CONFLICT DO NOTHING;

-- MCP servers: primarily Claude, but increasingly multi-vendor
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT']) FROM public.modules_directory WHERE slug IN (
  'mcp-org',
  'mcp-servers',
  'mcp-example-remote',
  'mcp-ts-sdk',
  'mcp-registry',
  'mcp-example-servers',
  'mcp-supabase',
  'mcp-notion',
  'mcp-figma',
  'mcp-cloudflare'
)
ON CONFLICT DO NOTHING;

-- Index on category for filtering
CREATE INDEX IF NOT EXISTS idx_modules_directory_category ON public.modules_directory(category);

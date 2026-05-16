SET search_path = '';

-- ============================================================
-- BRAIN TAXONOMY v1
-- ============================================================
-- technical_type = PRIMARY   (what it is architecturally)
--   Values: mcp-registry | mcp-server | ai-skill | agent-framework | local-ai-rag
-- category       = SECONDARY  (business domain)
--   Values: dev-tools | marketing | security | integration | ai-ml | methodology | testing | collection | framework | ui | database | productivity | automation
-- ai_compatibilities = CROSS-FILTER (which AI platforms are supported)
-- ============================================================

-- 1. Drop the restrictive type CHECK so we can rename values
ALTER TABLE public.modules_directory
    DROP CONSTRAINT IF EXISTS modules_directory_type_check;

-- 2. Add technical_type column
ALTER TABLE public.modules_directory
    ADD COLUMN IF NOT EXISTS technical_type TEXT;

-- 3. Index for fast taxonomy filtering
CREATE INDEX IF NOT EXISTS idx_modules_directory_technical_type
    ON public.modules_directory(technical_type);

-- ============================================================
-- 4. Migrate EXISTING data to the new taxonomy
-- ============================================================
-- mcp_server items → technical_type mcp-server (connector)
-- The SDKs and registries → mcp-registry
UPDATE public.modules_directory
    SET technical_type = 'mcp-server'
    WHERE type = 'mcp_server'
      AND slug IN (
        'mcp-supabase','mcp-notion','mcp-figma','mcp-cloudflare',
        'mcp-servers','mcp-example-remote','mcp-example-servers'
      );

UPDATE public.modules_directory
    SET technical_type = 'mcp-registry'
    WHERE type = 'mcp_server'
      AND slug IN ('mcp-registry','mcp-org','mcp-ts-sdk');

-- ai_skill items → keep type, assign technical_type
UPDATE public.modules_directory
    SET technical_type = 'ai-skill'
    WHERE type = 'ai_skill';

-- 4b. Set domain categories for existing MCP items (currently NULL)
UPDATE public.modules_directory SET category = 'database'    WHERE slug = 'mcp-supabase';
UPDATE public.modules_directory SET category = 'productivity' WHERE slug = 'mcp-notion';
UPDATE public.modules_directory SET category = 'ui'          WHERE slug = 'mcp-figma';
UPDATE public.modules_directory SET category = 'dev-tools'   WHERE slug IN ('mcp-cloudflare','mcp-servers','mcp-example-remote','mcp-example-servers','mcp-ts-sdk','mcp-registry','mcp-org');

-- ============================================================
-- 5. NEW ITEMS — MCP Registries (technical_type = mcp-registry)
-- ============================================================
INSERT INTO public.modules_directory (slug, title, description, github_url, type, technical_type, category, is_free)
VALUES
  ('mcp-python-sdk',
   'MCP Python SDK',
   'Official Python SDK to build MCP-compliant servers and clients. Foundation for all Python-based MCP integrations.',
   'https://github.com/modelcontextprotocol/python-sdk',
   'mcp_server', 'mcp-registry', 'dev-tools', true),
  ('mcp-inspector',
   'MCP Inspector',
   'Official debug tool to inspect and test Model Context Protocol (MCP) servers interactively.',
   'https://github.com/modelcontextprotocol/inspector',
   'mcp_server', 'mcp-registry', 'dev-tools', true),
  ('mcp-registry-redhat',
   'Community MCP Registry (Red Hat AI)',
   'Community-driven MCP server registry maintained by Red Hat AI Tools. Includes enterprise-grade servers.',
   'https://github.com/redhat-ai-tools/mcp-registry',
   'mcp_server', 'mcp-registry', 'collection', true),
  ('mcp-registry-aradreness',
   'MCP Registry & FastMCP-HTTP',
   'Open-source MCP registry with FastMCP-HTTP adapter. Simplifies hosting MCP servers over HTTP.',
   'https://github.com/ARadRareness/mcp-registry',
   'mcp_server', 'mcp-registry', 'dev-tools', true),
  ('mcp-registry-vemonet',
   'Unofficial MCP Browser',
   'Unofficial web app to browse and discover MCP servers. Ideal for quick exploration of the ecosystem.',
   'https://github.com/vemonet/mcp-registry',
   'mcp_server', 'mcp-registry', 'dev-tools', true),
  ('mcp-registry-docker',
   'Docker MCP Registry',
   'Official Docker MCP registry. Run and manage MCP servers as Docker containers for easy deployment.',
   'http://github.com/docker/mcp-registry',
   'mcp_server', 'mcp-registry', 'dev-tools', true),
  ('mcp-awesome-servers',
   'Awesome MCP Servers',
   'Curated list of 100+ MCP servers (TensorBlock). The go-to community reference for discovering connectors.',
   'https://github.com/TensorBlock/awesome-mcp-servers',
   'mcp_server', 'mcp-registry', 'collection', true),
  ('mcp-punkpeye',
   'Punkpeye Awesome MCP',
   'Community-curated MCP collection featuring Portainer, Pulumi, and infrastructure-focused servers.',
   'https://github.com/punkpeye/awesome-mcp-servers',
   'mcp_server', 'mcp-registry', 'collection', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 6. NEW ITEMS — MCP Connectors (technical_type = mcp-server)
-- ============================================================
INSERT INTO public.modules_directory (slug, title, description, github_url, type, technical_type, category, is_free)
VALUES
  ('mcp-github',
   'GitHub MCP',
   'Official GitHub MCP connector. Manage repos, issues, PRs, and GitHub Actions workflows directly from your AI agent.',
   'https://api.githubcopilot.com/mcp/',
   'mcp_server', 'mcp-server', 'dev-tools', true),
  ('mcp-stripe',
   'Stripe MCP',
   'Official Stripe MCP server. Enable AI agents to manage payments, subscriptions, customers, and invoices.',
   'https://mcp.stripe.com',
   'mcp_server', 'mcp-server', 'integration', false),
  ('mcp-zapier',
   'Zapier MCP',
   'Connect your AI agents to 6,000+ apps via Zapier. Automate workflows without writing code.',
   'https://zapier.com/mcp',
   'mcp_server', 'mcp-server', 'automation', false),
  ('mcp-sequential-thinking',
   'Sequential Thinking MCP',
   'Official MCP server for structured sequential reasoning. Improves step-by-step planning in AI agents.',
   'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
   'mcp_server', 'mcp-server', 'methodology', true),
  ('mcp-brave-search',
   'Brave Search MCP',
   'Official Brave Search MCP. Give your AI agents real-time web search capability with privacy-first results.',
   'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
   'mcp_server', 'mcp-server', 'ai-ml', true),
  ('mcp-postgres',
   'Postgres MCP',
   'Official MCP server for PostgreSQL. Query databases, inspect schemas and run migrations from your AI agent.',
   'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
   'mcp_server', 'mcp-server', 'database', true),
  ('mcp-pipedrive',
   'Pipedrive MCP',
   'Unofficial Pipedrive CRM MCP bridge. Manage deals, leads and activities with your AI agent.',
   'https://github.com/Zueis/pipedrive-mcp-server',
   'mcp_server', 'mcp-server', 'marketing', false),
  ('mcp-supabase-coleam',
   'Supabase MCP (Python)',
   'Community Supabase MCP server written in Python by coleam00. Rich support for DB, auth, storage & realtime.',
   'https://github.com/coleam00/supabase-mcp',
   'mcp_server', 'mcp-server', 'database', true),
  ('mcp-supabase-dynamic',
   'Supabase MCP (Dynamic Endpoints)',
   'Supabase MCP with dynamic endpoint generation. Ideal for complex, multi-schema Supabase projects.',
   'https://github.com/DynamicEndpoints/supabase-mcp',
   'mcp_server', 'mcp-server', 'database', true),
  ('mcp-supabase-selfhosted',
   'Self-hosted Supabase MCP',
   'MCP server optimized for self-hosted Supabase instances. Full control over auth and connection strings.',
   'https://github.com/HenkDz/selfhosted-supabase-mcp',
   'mcp_server', 'mcp-server', 'database', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 7. NEW ITEMS — Skills & Prompts (technical_type = ai-skill)
-- ============================================================
INSERT INTO public.modules_directory (slug, title, description, github_url, type, technical_type, category, is_free)
VALUES
  ('awesome-claude-skills-travisvn',
   'Travisvn Awesome Claude Skills',
   'Curated list of Claude skills with educational resources. Community-maintained quality reference.',
   'https://github.com/travisvn/awesome-claude-skills',
   'ai_skill', 'ai-skill', 'collection', true),
  ('superpowers-obra',
   'Obra Superpowers',
   'Skills focused on TDD, debugging techniques, and subagent development patterns for expert builders.',
   'https://github.com/obra/superpowers',
   'ai_skill', 'ai-skill', 'dev-tools', true),
  ('lackeyjb-playwright',
   'Playwright Automation Skill',
   'Dedicated Claude skill for Playwright browser automation. Write, run, and debug E2E tests via AI.',
   'https://github.com/lackeyjb/playwright-skill',
   'ai_skill', 'ai-skill', 'testing', true),
  ('wrsmith108-linear',
   'Linear Skill (wrsmith108)',
   'Claude skill to manage Linear issues, projects, and roadmaps directly from your editor.',
   'https://github.com/wrsmith108/linear-claude-skill',
   'ai_skill', 'ai-skill', 'integration', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 8. NEW ITEMS — Agent Frameworks (technical_type = agent-framework)
-- ============================================================
INSERT INTO public.modules_directory (slug, title, description, github_url, type, technical_type, category, is_free)
VALUES
  ('n8n-framework',
   'n8n',
   'Open source workflow automation platform (174k⭐). Self-host AI agents that connect to 400+ services with MCP support.',
   'https://github.com/n8n-io/n8n',
   'agent', 'agent-framework', 'automation', true),
  ('dify-builder',
   'Dify',
   'Visual AI agent builder (130k⭐). Drag-and-drop interface to create RAG pipelines, chatbots, and autonomous agents.',
   'https://github.com/langgenius/dify',
   'agent', 'agent-framework', 'ai-ml', true),
  ('praison-ai',
   'Praison AI',
   'Python multi-agent framework with native MCP support. Orchestrate agent teams with minimal code.',
   'https://github.com/praison-ai/praisonai',
   'agent', 'agent-framework', 'dev-tools', true),
  ('flowise',
   'Flowise',
   'No-code AI agent builder (45k⭐). Visual chains, RAG pipelines, and autonomous agents with Docker deploy.',
   'https://github.com/FlowiseAI/Flowise',
   'agent', 'agent-framework', 'automation', true),
  ('langflow',
   'Langflow',
   'Visual RAG and agent builder based on LangChain (132k⭐). Drag-and-drop components, custom nodes, easy deploy.',
   'https://github.com/langflow-ai/langflow',
   'agent', 'agent-framework', 'ai-ml', true),
  ('metagpt',
   'MetaGPT',
   'Multi-agent framework simulating a software company (59k⭐). Roles: CEO, CTO, Engineer. Generates full codebases.',
   'https://github.com/geekan/MetaGPT',
   'agent', 'agent-framework', 'dev-tools', true),
  ('browser-use',
   'Browser-Use',
   'Autonomous browser agent (72k⭐). Your AI navigates, clicks, and scrapes the web without Playwright headaches.',
   'https://github.com/browser-use/browser-use',
   'agent', 'agent-framework', 'automation', true),
  ('openai-agents-sdk',
   'OpenAI Agents SDK',
   'Official OpenAI SDK for building production agents with tracing, monitoring, handoffs, and MCP support.',
   'https://platform.openai.com/docs/agents',
   'agent', 'agent-framework', 'framework', false)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 9. NEW ITEMS — IA Locale & RAG (technical_type = local-ai-rag)
-- ============================================================
INSERT INTO public.modules_directory (slug, title, description, github_url, type, technical_type, category, is_free)
VALUES
  ('ollama',
   'Ollama',
   'Run Llama, Gemma, Qwen, Mistral and 100+ LLMs locally (162k⭐). OpenAI-compatible API. GPU and Apple M-series.',
   'https://github.com/ollama/ollama',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('open-webui',
   'Open WebUI',
   'Feature-rich web interface for Ollama and local LLMs (124k⭐). RAG, agents, multi-user, Docker-ready.',
   'https://github.com/open-webui/open-webui',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('anything-llm',
   'Anything-LLM',
   'Full-stack RAG app (51k⭐). Transform any document into LLM context. Multi-user, MCP-compatible, no-code agents.',
   'https://github.com/Mintplex-Labs/anything-llm',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('jan-ai',
   'Jan AI',
   'Open-source offline alternative to ChatGPT (25k⭐). Download and run any LLM from HuggingFace. GPU support.',
   'https://github.com/janhq/jan',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('cherry-studio',
   'Cherry Studio',
   'Multi-LLM desktop client (34k⭐). Chat with GPT, Claude, Gemini, and local models. RAG, custom prompts.',
   'https://github.com/CherryHQ/cherry-studio',
   'agent', 'local-ai-rag', 'productivity', true),
  ('chatbox',
   'Chatbox',
   'Desktop client for all major LLMs (37k⭐). Multi-conversation, plugins, and themes. Supports Ollama.',
   'https://github.com/Bin-Huang/chatbox',
   'agent', 'local-ai-rag', 'productivity', true),
  ('quivr',
   'Quivr',
   'Open-source RAG engine (39k⭐). Megaparse for complex docs, PGVector/Faiss support, all LLMs compatible.',
   'https://github.com/QuivrHQ/quivr',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('ragflow',
   'RAGFlow',
   'Advanced RAG engine (66k⭐). Handles complex PDFs and tables. Multiple vector stores. Multi-LLM support.',
   'https://github.com/infiniflow/ragflow',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('lobe-chat',
   'Lobe Chat',
   'Multi-LLM chat UI (67k⭐). RAG, plugins, themes, multi-user. Supports all major AI providers.',
   'https://github.com/lobehub/lobe-chat',
   'agent', 'local-ai-rag', 'productivity', true),
  ('gpt4free',
   'GPT4Free (g4f)',
   'Free access to GPT-4, o1, and Gemini via multi-providers (65k⭐). Python/JS client, local GUI, Docker.',
   'https://github.com/xtekky/gpt4free',
   'agent', 'local-ai-rag', 'ai-ml', true),
  ('langchain-chatchat',
   'Langchain-Chatchat',
   'RAG and agent platform (36k⭐). Multi-LLM, vector DB, web interface. Strong support for Chinese and English.',
   'https://github.com/chatchat-space/Langchain-Chatchat',
   'agent', 'local-ai-rag', 'ai-ml', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 10. Update type CHECK to allow agent type
-- ============================================================
ALTER TABLE public.modules_directory
    ADD CONSTRAINT modules_directory_type_check
    CHECK (type IN ('ui','agent','mcp_server','ai_skill'));

-- ============================================================
-- 11. AI Compatibilities for all new items
-- ============================================================
-- MCP Registries (all work with Claude, Gemini, ChatGPT)
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT'])
FROM public.modules_directory
WHERE slug IN (
  'mcp-python-sdk','mcp-inspector','mcp-registry-redhat','mcp-registry-aradreness',
  'mcp-registry-vemonet','mcp-registry-docker','mcp-awesome-servers','mcp-punkpeye'
)
ON CONFLICT DO NOTHING;

-- MCP Connectors
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT'])
FROM public.modules_directory
WHERE slug IN (
  'mcp-github','mcp-sequential-thinking','mcp-brave-search','mcp-postgres','mcp-stripe',
  'mcp-zapier','mcp-pipedrive','mcp-supabase-coleam','mcp-supabase-dynamic','mcp-supabase-selfhosted'
)
ON CONFLICT DO NOTHING;

-- Claude-centric skills
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, 'Claude'
FROM public.modules_directory
WHERE slug IN (
  'awesome-claude-skills-travisvn','superpowers-obra','lackeyjb-playwright','wrsmith108-linear'
)
ON CONFLICT DO NOTHING;

-- Multi-AI agent frameworks
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT'])
FROM public.modules_directory
WHERE slug IN (
  'n8n-framework','dify-builder','praison-ai','flowise','langflow','metagpt','browser-use', 'openai-agents-sdk'
)
ON CONFLICT DO NOTHING;

-- Local AI & RAG tools (all multi-AI)
INSERT INTO public.ai_compatibilities (directory_id, ai_name)
SELECT id, unnest(ARRAY['Claude','Gemini','ChatGPT'])
FROM public.modules_directory
WHERE slug IN (
  'ollama','open-webui','anything-llm','jan-ai','cherry-studio','chatbox',
  'quivr','ragflow','lobe-chat','gpt4free','langchain-chatchat'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 12. Full-text search index for title + description
-- ============================================================
ALTER TABLE public.modules_directory
    ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE public.modules_directory
    SET search_vector = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''));

CREATE INDEX IF NOT EXISTS idx_modules_directory_search
    ON public.modules_directory USING GIN(search_vector);

-- Auto-update search vector on insert/update
CREATE OR REPLACE FUNCTION public.modules_directory_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,'')
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tsvectorupdate ON public.modules_directory;
CREATE TRIGGER tsvectorupdate
    BEFORE INSERT OR UPDATE ON public.modules_directory
    FOR EACH ROW EXECUTE FUNCTION public.modules_directory_search_vector_update();

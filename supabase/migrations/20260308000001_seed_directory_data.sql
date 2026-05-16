-- Seed AI Skills and MCP Servers into directory

INSERT INTO public.modules_directory (slug, title, description, github_url, type, is_free)
VALUES
  -- AI Skills
  ('awesome-claude-skills', 'Anthropic Claude Skills', 'Collection', 'https://github.com/VoltAgent/awesome-claude-skills', 'ai_skill', true),
  ('awesome-agent-skills', 'Awesome Agent Skills', 'Collection', 'https://github.com/VoltAgent/awesome-agent-skills', 'ai_skill', true),
  ('vercel-agent-skills', 'Vercel Agent Skills', 'Repo skills', 'https://github.com/vercel-labs/agent-skills', 'ai_skill', true),
  ('vercel-skills-cli', 'Vercel Skills CLI', 'CLI / tooling', 'https://github.com/vercel-labs/skills', 'ai_skill', true),
  ('cloudflare-agents', 'Cloudflare Agents', 'Framework', 'https://github.com/cloudflare/agents', 'ai_skill', true),
  ('trailofbits-skills', 'Trail of Bits Skills', 'Repo skills', 'https://github.com/trailofbits/skills', 'ai_skill', true),
  ('semgrep-rules', 'Semgrep rules', 'Rules / skill', 'https://github.com/trailofbits/semgrep-rules', 'ai_skill', true),
  ('semgrep-rule-creator', 'Semgrep rule creator', 'Fiche skill', 'https://skills.sh/trailofbits/skills/semgrep-rule-creator', 'ai_skill', true),
  ('huggingface-hub', 'Hugging Face Hub + CLI', 'Lib / CLI', 'https://github.com/huggingface/huggingface_hub', 'ai_skill', true),
  ('corey-haines-marketing', 'Corey Haines Marketing', 'Repo skills', 'https://github.com/coreyhaines31/marketingskills', 'ai_skill', true),
  ('ui-skills', 'UI Skills', 'Repo skills', 'https://github.com/ibelick/ui-skills', 'ai_skill', true),
  ('claude-bootstrap', 'Claude Bootstrap', 'Repo skills', 'https://github.com/alinaqi/claude-bootstrap', 'ai_skill', true),
  ('recursive-decomposition', 'Recursive Decomposition', 'Skill dédié', 'https://github.com/massimodeluisa/recursive-decomposition-skill', 'ai_skill', true),
  ('aws-skills', 'AWS Skills', 'Repo skills', 'https://github.com/zxkane/aws-skills', 'ai_skill', true),
  ('context-engineering-skills', 'Context Engineering Skills', 'Repo skills', 'https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering', 'ai_skill', true),
  ('tdd-skill-obra', 'TDD Skill (Obra)', 'Repo + skill', 'https://github.com/obra/superpowers', 'ai_skill', true),
  ('playwright-skill', 'Playwright Skill', 'Skill dédié', 'https://github.com/lackeyjb/playwright-skill', 'ai_skill', true),
  ('linear-skill', 'Linear Skill', 'Skill dédié', 'https://github.com/wrsmith108/linear-claude-skill', 'ai_skill', true),
  ('ai-research-skills', 'AI Research Skills', 'Repo skills', 'https://github.com/zechenzhangAGI/AI-research-SKILLs', 'ai_skill', true),
  ('n8n-skills', 'n8n Skills', 'Repo skills', 'https://github.com/czlonkowski/n8n-skills', 'ai_skill', true),

  -- MCP Servers
  ('mcp-org', 'Model Context Protocol (org GitHub)', 'Org', 'https://github.com/modelcontextprotocol', 'mcp_server', true),
  ('mcp-servers', 'MCP Servers', 'Repo', 'https://github.com/modelcontextprotocol/servers', 'mcp_server', true),
  ('mcp-example-remote', 'Example Remote', 'Repo', 'https://github.com/modelcontextprotocol/example-remote-server', 'mcp_server', true),
  ('mcp-ts-sdk', 'MCP TS SDK', 'SDK', 'https://github.com/modelcontextprotocol/typescript-sdk', 'mcp_server', true),
  ('mcp-registry', 'MCP Registry', 'Repo', 'https://github.com/modelcontextprotocol/registry', 'mcp_server', true),
  ('mcp-example-servers', 'Example servers', 'Doc', 'https://modelcontextprotocol.io/examples', 'mcp_server', true),
  ('mcp-supabase', 'Supabase', 'Remote MCP', 'https://github.com/mcp/com.supabase/mcp', 'mcp_server', true),
  ('mcp-notion', 'Notion', 'Remote MCP', 'https://github.com/makenotion/notion-mcp-server', 'mcp_server', true),
  ('mcp-figma', 'Figma', 'Remote MCP', 'https://github.com/mcp/com.figma.mcp/mcp', 'mcp_server', true),
  ('mcp-cloudflare', 'Cloudflare API', 'Remote MCP', 'https://github.com/cloudflare/mcp', 'mcp_server', true)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  github_url = EXCLUDED.github_url,
  type = EXCLUDED.type;

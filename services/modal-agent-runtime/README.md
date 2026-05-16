# Modal Agent Runtime (LangGraph Python)

This service runs AI agent jobs on Modal while keeping Next.js API contracts unchanged.

## Setup

```bash
python -m pip install -r services/modal-agent-runtime/requirements.txt
python -m modal setup
```

## Local serve

```bash
python -m modal serve services/modal-agent-runtime/runtime.py
```

## Deploy

```bash
python -m modal deploy services/modal-agent-runtime/runtime.py
```

## Required environment variables

- `AGENT_INTERNAL_TOKEN`
- `AGENT_INTERNAL_TOKEN_NEXT` (optional)
- `AGENT_INTERNAL_AUTH_MAX_SKEW_SECONDS` (optional, default `300`)
- `APP_BASE_URL`
- `SUPABASE_FUNCTIONS_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred) or `CRON_SECRET`

## Optional scheduler ownership / kill-switch

- `AGENT_CRON_OWNER_WEEKLY_RECAP` (`vercel` | `modal`)
- `AGENT_CRON_KILL_SWITCH=true` disables scheduled enqueues
- `AGENT_CRON_DISABLE_WEEKLY_RECAP=true`
- `AGENT_CRON_DISABLED_FLOWS=weekly-ai-recap`

## Weekly recap execution target

- `RECAP_EXECUTION_TARGET=modal_native` (default): Modal runs the native AI News pipeline end-to-end.
- `RECAP_EXECUTION_TARGET=edge_proxy`: compatibility fallback that calls `weekly-ai-recap-cron` upstream.
- `RECAP_EXECUTION_TARGET=dual_shadow`: calls the upstream edge path and also runs Modal-native for comparison.

The Modal-native path handles `tick`, `build_article`, `send_newsletter`, and `retry_newsletter`. It uses Scrapling for article extraction and Firecrawl only as a fallback.

## SEO blog writer

The `seo-blog-writer` flow runs only in Modal and supports `mode=generate`.
It writes generated drafts to `editorial_posts` and stores full HTML, Markdown,
QA, source, and node status artifacts in `seo_blog_agent_runs`.

Optional provider/tool environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`
- `SERPAPI_API_KEY`
- `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`
- `JINA_API_KEY` (optional; public Jina reader works for many pages without it)
- `TAVILY_API_KEY` (reserved for retrieval extensions)
- `COHERE_API_KEY` (reserved for rerank/NLP extensions)

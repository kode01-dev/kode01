import hashlib
import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from html import unescape
from typing import Any, TypedDict
from urllib.parse import urlencode, urlparse

import httpx
from langgraph.graph import END, START, StateGraph

try:
    from langgraph.checkpoint.memory import MemorySaver
except Exception:
    MemorySaver = None


ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages"
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"
SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
DATAFORSEO_ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"
TAG_RE = re.compile(r"(?is)<[^>]+>")
SCRIPT_STYLE_RE = re.compile(r"(?is)<(script|style)[^>]*>.*?</\1>")
HTML_COMMENT_RE = re.compile(r"(?is)<!--.*?-->")
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

GRAPH_NODE_SEQUENCE = [
    "input",
    "serp",
    "competitor_scrape",
    "competitor_extract",
    "aggregate",
    "nlp_map",
    "intent",
    "information_gain",
    "writer_directive",
    "title_h1",
    "author_about",
    "outline",
    "article_html",
    "html_cleanup",
    "markdown_convert",
    "quality_gate",
    "cms_draft",
]

DEFAULT_NODES_CONFIG: dict[str, Any] = {
    "serp": {"enabled": True, "provider": "dataforseo", "depth": 4, "device": "mobile"},
    "competitor_scrape": {"enabled": True, "provider": "jina", "maxCompetitors": 4},
    "competitor_extract": {"enabled": True, "model": "claude-3-5-haiku-latest"},
    "nlp_map": {"enabled": True, "model": "claude-3-5-haiku-latest"},
    "intent": {"enabled": True, "model": "claude-3-5-haiku-latest"},
    "information_gain": {"enabled": True, "model": "claude-3-5-sonnet-latest"},
    "writer_directive": {"enabled": True, "model": "claude-3-5-haiku-latest"},
    "title_h1": {"enabled": True, "model": "claude-3-5-haiku-latest"},
    "author_about": {"enabled": True, "provider": "jina"},
    "outline": {"enabled": True, "model": "claude-3-5-sonnet-latest"},
    "article_html": {"enabled": True, "model": "claude-3-5-sonnet-latest", "minWords": 1200, "maxWords": 1800},
    "html_cleanup": {"enabled": True},
    "markdown_convert": {"enabled": True},
    "quality_gate": {"enabled": True, "minWords": 900},
    "cms_draft": {"enabled": True, "category": "SEO"},
}


class BlogPipelineError(RuntimeError):
    pass


class BlogRepositoryError(RuntimeError):
    pass


class BlogGraphState(TypedDict, total=False):
    payload: dict[str, Any]
    startedAt: str
    input: dict[str, Any]
    profile: dict[str, Any]
    run: dict[str, Any]
    node_statuses: dict[str, Any]
    serp_results: list[dict[str, Any]]
    competitor_docs: list[dict[str, Any]]
    competitor_insights: list[dict[str, Any]]
    aggregate: dict[str, Any]
    nlp_map: dict[str, Any]
    intent: dict[str, Any]
    information_gain: dict[str, Any]
    writer_directive: dict[str, Any]
    title_h1: dict[str, Any]
    author_about: dict[str, Any]
    outline: dict[str, Any]
    article_html: str
    article_markdown: str
    qa_report: dict[str, Any]
    sources_used: list[dict[str, Any]]
    editorial_post: dict[str, Any]
    output: dict[str, Any]
    error: str


@dataclass(frozen=True)
class BlogRunConfig:
    save_to_cms: bool
    default_locale: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _trim(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _strip_html(value: str) -> str:
    without_scripts = SCRIPT_STYLE_RE.sub(" ", value or "")
    without_comments = HTML_COMMENT_RE.sub(" ", without_scripts)
    return _compact_text(unescape(TAG_RE.sub(" ", without_comments)))


def _safe_error(error: Exception | str) -> str:
    message = str(error).strip()
    return f"{message[:480]}..." if len(message) > 480 else message


def _stable_hash(value: Any) -> str:
    serialized = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:12]


def _normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug[:120].strip("-") or "seo-blog-draft"


def _json_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list_or_empty(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _merge_nodes_config(value: Any) -> dict[str, Any]:
    incoming = _json_or_empty(value)
    merged: dict[str, Any] = {}
    for node, defaults in DEFAULT_NODES_CONFIG.items():
        override = incoming.get(node)
        merged[node] = {**defaults, **override} if isinstance(override, dict) else dict(defaults)
    for node, override in incoming.items():
        if node not in merged and isinstance(override, dict):
            merged[node] = override
    return merged


def _node_config(state: BlogGraphState, node_name: str) -> dict[str, Any]:
    profile = _json_or_empty(state.get("profile"))
    nodes_config = _merge_nodes_config(profile.get("nodes_config"))
    return _json_or_empty(nodes_config.get(node_name))


def _node_enabled(state: BlogGraphState, node_name: str) -> bool:
    config = _node_config(state, node_name)
    return config.get("enabled") is not False


def _mark_node(state: BlogGraphState, node_name: str, status: str, extra: dict[str, Any] | None = None) -> None:
    statuses = _json_or_empty(state.get("node_statuses"))
    statuses[node_name] = {
        "status": status,
        "updatedAt": now_iso(),
        **(extra or {}),
    }
    state["node_statuses"] = statuses


def _derive_supabase_base_url() -> str:
    direct = _trim(os.getenv("SUPABASE_URL"))
    if direct:
        return direct.rstrip("/")
    functions_url = _trim(os.getenv("SUPABASE_FUNCTIONS_URL")).rstrip("/")
    suffix = "/functions/v1"
    if functions_url.endswith(suffix):
        return functions_url[: -len(suffix)]
    return functions_url


class BlogRepository:
    def __init__(self, *, base_url: str, service_role_key: str, timeout_seconds: float = 25.0):
        if not base_url:
            raise BlogRepositoryError("SUPABASE_URL or SUPABASE_FUNCTIONS_URL is missing")
        if not service_role_key:
            raise BlogRepositoryError("SUPABASE_SERVICE_ROLE_KEY is required")
        self.base_url = base_url.rstrip("/")
        self.service_role_key = service_role_key.strip()
        self.timeout_seconds = max(1.0, min(timeout_seconds, 120.0))

    @classmethod
    def from_env(cls) -> "BlogRepository":
        timeout = float(os.getenv("SEO_BLOG_REPO_TIMEOUT_SECONDS", "25") or "25")
        return cls(
            base_url=_derive_supabase_base_url(),
            service_role_key=_trim(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
            timeout_seconds=timeout,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str] | None = None,
        json_body: Any = None,
        prefer: str | None = None,
    ) -> Any:
        encoded = urlencode(query or {}, doseq=True)
        url = f"{self.base_url}{path}"
        if encoded:
            url = f"{url}?{encoded}"
        headers = {
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
            "Accept": "application/json",
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.request(method, url, headers=headers, json=json_body)
        except httpx.HTTPError as exc:
            raise BlogRepositoryError(f"Repository HTTP error: {_safe_error(exc)}") from exc
        if response.status_code >= 400:
            raise BlogRepositoryError(
                f"Repository request failed ({response.status_code}) path={path}: {_safe_error(response.text)}"
            )
        if not response.text.strip():
            return None
        try:
            return response.json()
        except Exception as exc:
            raise BlogRepositoryError(f"Repository returned non-JSON payload on {path}") from exc

    def get_profile(self, profile_id: str | None = None) -> dict[str, Any]:
        if profile_id:
            rows = self._request(
                "GET",
                "/rest/v1/seo_blog_agent_profiles",
                query={"select": "*", "id": f"eq.{profile_id}", "limit": "1"},
            )
        else:
            rows = self._request(
                "GET",
                "/rest/v1/seo_blog_agent_profiles",
                query={"select": "*", "status": "eq.active", "order": "activated_at.desc", "limit": "1"},
            )
        row = rows[0] if isinstance(rows, list) and rows else None
        if isinstance(row, dict):
            row["nodes_config"] = _merge_nodes_config(row.get("nodes_config"))
            row["run_config"] = _json_or_empty(row.get("run_config"))
            return row
        return {
            "id": None,
            "name": "Code default",
            "status": "active",
            "version": 1,
            "nodes_config": _merge_nodes_config({}),
            "run_config": {"defaultLocale": "fr", "saveToCms": True},
        }

    def create_run(self, *, job_id: str, profile_id: str | None, payload_input: dict[str, Any], user_id: str | None) -> dict[str, Any]:
        body = {
            "job_id": job_id,
            "profile_id": profile_id,
            "mode": "generate",
            "status": "running",
            "input": payload_input,
            "node_statuses": {},
            "created_by": user_id if user_id and UUID_RE.match(user_id) else None,
            "started_at": now_iso(),
        }
        rows = self._request(
            "POST",
            "/rest/v1/seo_blog_agent_runs",
            json_body=body,
            prefer="return=representation",
        )
        row = rows[0] if isinstance(rows, list) and rows else None
        if not isinstance(row, dict):
            raise BlogRepositoryError("Unable to create seo_blog_agent_runs row")
        return row

    def update_run(self, run_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        rows = self._request(
            "PATCH",
            "/rest/v1/seo_blog_agent_runs",
            query={"id": f"eq.{run_id}"},
            json_body=fields,
            prefer="return=representation",
        )
        row = rows[0] if isinstance(rows, list) and rows else None
        return row if isinstance(row, dict) else None

    def create_editorial_draft(self, *, article: dict[str, Any], user_id: str | None) -> dict[str, Any]:
        title = str(article.get("title") or "SEO Blog Draft").strip()[:220]
        locale = str(article.get("locale") or "fr").strip().lower()
        if locale not in {"en", "fr"}:
            locale = "fr"
        base_slug = _normalize_slug(str(article.get("slug") or title))
        slug = f"{base_slug}-{_stable_hash({'title': title, 'ts': now_iso()})[:6]}"
        author_user_id = user_id if user_id and UUID_RE.match(user_id) else None
        body = {
            "source_locale": locale,
            "locale": locale,
            "status": "draft",
            "slug": slug,
            "category": article.get("category") or "SEO",
            "title": title,
            "excerpt": article.get("excerpt"),
            "content_markdown": article.get("content_markdown") or "",
            "seo_title": article.get("seo_title") or title,
            "seo_description": article.get("seo_description") or article.get("excerpt"),
            "author_name": article.get("author_name"),
            "created_by": author_user_id,
            "updated_by": author_user_id,
        }
        rows = self._request(
            "POST",
            "/rest/v1/editorial_posts",
            json_body=body,
            prefer="return=representation",
        )
        row = rows[0] if isinstance(rows, list) and rows else None
        if not isinstance(row, dict):
            raise BlogRepositoryError("Unable to create editorial_posts draft")
        return row


def _extract_json_text(text: str, fallback: dict[str, Any]) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return fallback
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else fallback
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(raw[start : end + 1])
                return parsed if isinstance(parsed, dict) else fallback
            except Exception:
                return fallback
    return fallback


def _llm_provider() -> str | None:
    if _trim(os.getenv("ANTHROPIC_API_KEY")):
        return "anthropic"
    if _trim(os.getenv("OPENAI_API_KEY")):
        return "openai"
    if _trim(os.getenv("GEMINI_API_KEY")) or _trim(os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")):
        return "gemini"
    return None


def _call_llm(prompt: str, *, model: str | None = None, json_mode: bool = False, max_tokens: int = 4096) -> str:
    provider = _llm_provider()
    if not provider:
        raise BlogPipelineError("No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.")
    if provider == "anthropic":
        api_key = _trim(os.getenv("ANTHROPIC_API_KEY"))
        chosen_model = model or os.getenv("SEO_BLOG_ANTHROPIC_MODEL") or "claude-3-5-sonnet-latest"
        body = {
            "model": chosen_model,
            "max_tokens": max_tokens,
            "temperature": 0.2,
            "messages": [{"role": "user", "content": prompt}],
        }
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                ANTHROPIC_ENDPOINT,
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json=body,
            )
        if response.status_code >= 400:
            raise BlogPipelineError(f"Anthropic returned {response.status_code}: {_safe_error(response.text)}")
        data = response.json()
        parts = data.get("content") if isinstance(data, dict) else []
        return "\n".join(str(part.get("text") or "") for part in parts if isinstance(part, dict)).strip()
    if provider == "openai":
        api_key = _trim(os.getenv("OPENAI_API_KEY"))
        chosen_model = model or os.getenv("SEO_BLOG_OPENAI_MODEL") or "gpt-4.1-mini"
        body: dict[str, Any] = {
            "model": chosen_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                OPENAI_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}", "content-type": "application/json"},
                json=body,
            )
        if response.status_code >= 400:
            raise BlogPipelineError(f"OpenAI returned {response.status_code}: {_safe_error(response.text)}")
        data = response.json()
        return str(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    api_key = _trim(os.getenv("GEMINI_API_KEY")) or _trim(os.getenv("GOOGLE_GENERATIVE_AI_API_KEY"))
    chosen_model = model or os.getenv("SEO_BLOG_GEMINI_MODEL") or "gemini-2.0-flash"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_tokens,
            **({"responseMimeType": "application/json"} if json_mode else {}),
        },
    }
    with httpx.Client(timeout=120.0) as client:
        response = client.post(GEMINI_ENDPOINT.format(model=chosen_model), params={"key": api_key}, json=body)
    if response.status_code >= 400:
        raise BlogPipelineError(f"Gemini returned {response.status_code}: {_safe_error(response.text)}")
    data = response.json()
    candidates = data.get("candidates") if isinstance(data, dict) else []
    if not candidates:
        return ""
    content = candidates[0].get("content", {}) if isinstance(candidates[0], dict) else {}
    parts = content.get("parts") if isinstance(content, dict) else []
    return "\n".join(str(part.get("text") or "") for part in parts if isinstance(part, dict)).strip()


def _llm_json(prompt: str, *, fallback: dict[str, Any], model: str | None = None, max_tokens: int = 4096) -> dict[str, Any]:
    try:
        text = _call_llm(prompt, model=model, json_mode=True, max_tokens=max_tokens)
        return _extract_json_text(text, fallback)
    except Exception as exc:
        print(f"SEO blog LLM JSON fallback: {exc}")
        return fallback


def _llm_text(prompt: str, *, fallback: str, model: str | None = None, max_tokens: int = 8192) -> str:
    try:
        text = _call_llm(prompt, model=model, json_mode=False, max_tokens=max_tokens)
        return text or fallback
    except Exception as exc:
        print(f"SEO blog LLM text fallback: {exc}")
        return fallback


def _fetch_url_text(url: str, *, use_jina: bool = True, timeout: float = 20.0) -> dict[str, Any]:
    target = url.strip()
    if not target:
        return {"url": url, "status": 0, "text": "", "ok": False}
    fetch_url = f"https://r.jina.ai/{target}" if use_jina and target.startswith(("http://", "https://")) else target
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(fetch_url, headers={"User-Agent": "Kode01SeoBlogAgent/1.0"})
        text = response.text or ""
        if "<html" in text[:500].lower():
            text = _strip_html(text)
        return {
            "url": target,
            "fetch_url": fetch_url,
            "status": response.status_code,
            "text": _compact_text(text)[:24000],
            "ok": response.status_code < 400 and len(_strip_html(text)) > 120,
        }
    except Exception as exc:
        return {"url": target, "status": 0, "text": "", "ok": False, "error": _safe_error(exc)}


def _normalize_input(payload_input: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    run_config = _json_or_empty(profile.get("run_config"))
    keyword = _trim(payload_input.get("keyword") or payload_input.get("Keyword"))
    title = _trim(payload_input.get("title") or payload_input.get("articleTitle") or payload_input.get("Article Title"))
    locale = _trim(payload_input.get("locale") or payload_input.get("language") or payload_input.get("Langue") or run_config.get("defaultLocale") or "fr").lower()
    if locale not in {"en", "fr"}:
        locale = "fr"
    if not keyword:
        raise BlogPipelineError("input.keyword is required")
    if not title:
        title = keyword
    internal_links = payload_input.get("internalLinks") or payload_input.get("internal links") or []
    if isinstance(internal_links, str):
        internal_links = [item.strip() for item in re.split(r"[\n,]+", internal_links) if item.strip()]
    competitor_urls = payload_input.get("competitorUrls") or []
    if isinstance(competitor_urls, str):
        competitor_urls = [item.strip() for item in re.split(r"[\n,]+", competitor_urls) if item.strip()]
    return {
        "keyword": keyword,
        "title": title,
        "locale": locale,
        "locationName": _trim(payload_input.get("locationName") or payload_input.get("location") or "Canada"),
        "targetLanguage": _trim(payload_input.get("targetLanguage") or payload_input.get("languageName") or ("French" if locale == "fr" else "English")),
        "clientDomain": _trim(payload_input.get("clientDomain") or payload_input.get("domain")),
        "aboutPage": _trim(payload_input.get("aboutPage")),
        "authorPage": _trim(payload_input.get("authorPage")),
        "targetAudience": _trim(payload_input.get("targetAudience")),
        "briefSummary": _trim(payload_input.get("briefSummary")),
        "secondaryKeyword": _trim(payload_input.get("secondaryKeyword") or payload_input.get("keyword2")),
        "tertiaryKeyword": _trim(payload_input.get("tertiaryKeyword") or payload_input.get("keyword3")),
        "internalLinks": internal_links if isinstance(internal_links, list) else [],
        "competitorUrls": competitor_urls if isinstance(competitor_urls, list) else [],
        "category": _trim(payload_input.get("category") or "SEO"),
    }


def input_node(state: BlogGraphState) -> BlogGraphState:
    payload = state["payload"]
    repo = BlogRepository.from_env()
    profile = repo.get_profile(_trim(payload.get("profileId")) or None)
    normalized_input = _normalize_input(_json_or_empty(payload.get("input")), profile)
    job_id = _trim(payload.get("idempotencyKey")) or _trim(payload.get("requestId")) or str(uuid.uuid4())
    run = repo.create_run(
        job_id=job_id,
        profile_id=profile.get("id") if isinstance(profile.get("id"), str) else None,
        payload_input=normalized_input,
        user_id=_trim(payload.get("userId")) or None,
    )
    next_state = {**state, "profile": profile, "input": normalized_input, "run": run, "node_statuses": {}}
    _mark_node(next_state, "input", "succeeded")
    repo.update_run(run["id"], {"node_statuses": next_state["node_statuses"]})
    return next_state


def _fetch_serp(input_data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    explicit_urls = [url for url in input_data.get("competitorUrls", []) if isinstance(url, str) and url.startswith(("http://", "https://"))]
    results = [{"title": "", "url": url, "snippet": "", "source": "manual"} for url in explicit_urls]
    if results:
        return results[: max(1, int(config.get("depth") or 4))]
    serpapi_key = _trim(os.getenv("SERPAPI_API_KEY"))
    if serpapi_key:
        params = {
            "engine": "google",
            "q": input_data["keyword"],
            "location": input_data.get("locationName") or "Canada",
            "hl": "fr" if input_data.get("locale") == "fr" else "en",
            "api_key": serpapi_key,
            "num": str(max(1, min(int(config.get("depth") or 4), 10))),
        }
        with httpx.Client(timeout=40.0) as client:
            response = client.get(SERPAPI_ENDPOINT, params=params)
        if response.status_code >= 400:
            raise BlogPipelineError(f"SerpAPI returned {response.status_code}: {_safe_error(response.text)}")
        payload = response.json()
        organic = payload.get("organic_results") if isinstance(payload, dict) else []
        return [
            {
                "title": str(item.get("title") or ""),
                "url": str(item.get("link") or ""),
                "snippet": str(item.get("snippet") or ""),
                "source": "serpapi",
            }
            for item in organic
            if isinstance(item, dict) and str(item.get("link") or "").startswith(("http://", "https://"))
        ][: max(1, int(config.get("depth") or 4))]
    login = _trim(os.getenv("DATAFORSEO_LOGIN"))
    password = _trim(os.getenv("DATAFORSEO_PASSWORD"))
    if login and password:
        body = [{
            "keyword": input_data["keyword"],
            "location_name": input_data.get("locationName") or "Canada",
            "language_name": input_data.get("targetLanguage") or ("French" if input_data.get("locale") == "fr" else "English"),
            "device": config.get("device") or "mobile",
            "os": "ios",
            "depth": max(1, min(int(config.get("depth") or 4), 10)),
        }]
        with httpx.Client(timeout=60.0) as client:
            response = client.post(DATAFORSEO_ENDPOINT, auth=(login, password), json=body)
        if response.status_code >= 400:
            raise BlogPipelineError(f"DataForSEO returned {response.status_code}: {_safe_error(response.text)}")
        payload = response.json()
        items = (((payload.get("tasks") or [{}])[0].get("result") or [{}])[0].get("items") or []) if isinstance(payload, dict) else []
        return [
            {
                "title": str(item.get("title") or ""),
                "url": str(item.get("url") or ""),
                "snippet": str(item.get("description") or item.get("snippet") or ""),
                "source": "dataforseo",
            }
            for item in items
            if isinstance(item, dict) and str(item.get("url") or "").startswith(("http://", "https://"))
        ][: max(1, int(config.get("depth") or 4))]
    return results


def serp_node(state: BlogGraphState) -> BlogGraphState:
    if not _node_enabled(state, "serp"):
        _mark_node(state, "serp", "skipped")
        return state
    config = _node_config(state, "serp")
    results = _fetch_serp(state["input"], config)
    state["serp_results"] = results
    _mark_node(state, "serp", "succeeded", {"count": len(results)})
    _persist_node_status(state)
    return state


def competitor_scrape_node(state: BlogGraphState) -> BlogGraphState:
    if not _node_enabled(state, "competitor_scrape"):
        _mark_node(state, "competitor_scrape", "skipped")
        return state
    config = _node_config(state, "competitor_scrape")
    max_competitors = max(1, min(int(config.get("maxCompetitors") or 4), 8))
    urls = []
    for result in state.get("serp_results", []):
        url = result.get("url")
        if isinstance(url, str) and url.startswith(("http://", "https://")) and url not in urls:
            urls.append(url)
    docs = []
    for url in urls[:max_competitors]:
        fetched = _fetch_url_text(url, use_jina=(config.get("provider") != "direct"))
        fetched["title"] = next((item.get("title") for item in state.get("serp_results", []) if item.get("url") == url), "")
        docs.append(fetched)
    state["competitor_docs"] = docs
    _mark_node(state, "competitor_scrape", "succeeded", {"count": len(docs), "okCount": len([doc for doc in docs if doc.get("ok")])})
    _persist_node_status(state)
    return state


def _extract_headings_from_text(text: str) -> dict[str, Any]:
    h1 = ""
    h2: list[str] = []
    title = ""
    for line in (text or "").splitlines():
        cleaned = line.strip(" #\t")
        if not cleaned:
            continue
        if not title and len(cleaned) < 140:
            title = cleaned
        if not h1 and len(cleaned) < 140:
            h1 = cleaned
        if 12 <= len(cleaned) <= 120 and len(h2) < 10:
            h2.append(cleaned)
    questions = re.findall(r"([A-ZÀ-Ÿa-zà-ÿ0-9][^?]{12,120}\?)", text or "")
    facts = re.findall(r"([^.!?]*(?:\d{2,4}%?|\$|CAD|USD|20\d{2})[^.!?]*[.!?])", text or "")
    return {
        "h1": h1 or title,
        "title_tag": title or h1,
        "h2_subtopics": list(dict.fromkeys(h2[:8])),
        "questions": list(dict.fromkeys([_compact_text(q) for q in questions[:8]])),
        "facts": list(dict.fromkeys([_compact_text(f) for f in facts[:8]])),
        "content_format": "Primary: Guide | Structure: headings, factual snippets, FAQ signals",
    }


def competitor_extract_node(state: BlogGraphState) -> BlogGraphState:
    if not _node_enabled(state, "competitor_extract"):
        _mark_node(state, "competitor_extract", "skipped")
        return state
    insights = []
    for doc in state.get("competitor_docs", []):
        text = str(doc.get("text") or "")
        extracted = _extract_headings_from_text(text)
        extracted["url"] = doc.get("url")
        extracted["source_status"] = doc.get("status")
        insights.append(extracted)
    state["competitor_insights"] = insights
    _mark_node(state, "competitor_extract", "succeeded", {"count": len(insights)})
    _persist_node_status(state)
    return state


def aggregate_node(state: BlogGraphState) -> BlogGraphState:
    h2, questions, facts, urls = [], [], [], []
    for item in state.get("competitor_insights", []):
        h2.extend(_list_or_empty(item.get("h2_subtopics")))
        questions.extend(_list_or_empty(item.get("questions")))
        facts.extend(_list_or_empty(item.get("facts")))
        if item.get("url"):
            urls.append(item["url"])
    aggregate = {
        "h2_subtopics": list(dict.fromkeys([str(v) for v in h2 if v]))[:30],
        "questions": list(dict.fromkeys([str(v) for v in questions if v]))[:30],
        "facts": list(dict.fromkeys([str(v) for v in facts if v]))[:30],
        "competitor_urls": list(dict.fromkeys([str(v) for v in urls if v])),
    }
    state["aggregate"] = aggregate
    state["sources_used"] = [{"url": url, "type": "competitor"} for url in aggregate["competitor_urls"]]
    _mark_node(state, "aggregate", "succeeded")
    _persist_node_status(state)
    return state


def nlp_map_node(state: BlogGraphState) -> BlogGraphState:
    fallback = {
        "secondary_keywords": [state["input"]["keyword"], state["input"].get("secondaryKeyword") or ""],
        "lsi_terms": state.get("aggregate", {}).get("h2_subtopics", [])[:8],
        "question_variants": state.get("aggregate", {}).get("questions", [])[:8],
        "dominant_modifiers": ["guide", "how to", "best"],
        "content_gap_signal": "Use competitor headings as baseline and add first-hand, specific examples.",
    }
    prompt = f"""Return valid JSON only. Build an NLP keyword map for this SEO article.
Primary keyword: {state['input']['keyword']}
Title: {state['input']['title']}
Competitor data: {json.dumps(state.get('aggregate', {}), ensure_ascii=False)}
Schema: secondary_keywords array, lsi_terms array, question_variants array, dominant_modifiers array, content_gap_signal string."""
    config = _node_config(state, "nlp_map")
    state["nlp_map"] = _llm_json(prompt, fallback=fallback, model=config.get("model"), max_tokens=1600)
    _mark_node(state, "nlp_map", "succeeded")
    _persist_node_status(state)
    return state


def intent_node(state: BlogGraphState) -> BlogGraphState:
    fallback = {
        "search_intent": {
            "primary": "informational",
            "secondary": "commercial",
            "content_format": "comprehensive guide",
            "buying_stage": "awareness",
            "user_expectations": ["clear answer", "examples", "comparison", "FAQ"],
        },
        "target_audience": {
            "primary": state["input"].get("targetAudience") or "Canadian readers researching the topic",
            "pain_points": ["needs a clear decision framework"],
        },
        "content_strategy": {
            "tone": "professional, helpful, concrete",
            "target_word_count": 1500,
            "required_sections": ["definition", "benefits", "process", "FAQ"],
        },
        "recommendations": ["Open with a direct answer", "Use tables and examples", "Add EEAT signals"],
    }
    prompt = f"""Return valid JSON only. Classify search intent and audience.
Input: {json.dumps(state['input'], ensure_ascii=False)}
NLP map: {json.dumps(state.get('nlp_map', {}), ensure_ascii=False)}
Competitor aggregate: {json.dumps(state.get('aggregate', {}), ensure_ascii=False)}
Root keys: search_intent, target_audience, content_strategy, recommendations."""
    config = _node_config(state, "intent")
    state["intent"] = _llm_json(prompt, fallback=fallback, model=config.get("model"), max_tokens=2200)
    _mark_node(state, "intent", "succeeded")
    _persist_node_status(state)
    return state


def information_gain_node(state: BlogGraphState) -> BlogGraphState:
    fallback = {
        "competitor_gaps": ["Competitors do not provide a localized decision checklist."],
        "unique_attributes": ["Add Canada-specific examples", "Add first-hand implementation notes", "Add a comparison table"],
        "sme_quote_angles": ["What mistake do you see most often?", "What decision criteria matter in practice?"],
        "experience_annotations": ["Add an observation from a real client workflow or internal test."],
        "new_h2_recommendations": [
            f"How to evaluate {state['input']['keyword']} in practice",
            f"What competitors miss about {state['input']['keyword']}",
        ],
    }
    prompt = f"""Return valid JSON only. Build an Information Gain Plan.
Keyword: {state['input']['keyword']}
Intent: {json.dumps(state.get('intent', {}), ensure_ascii=False)}
NLP: {json.dumps(state.get('nlp_map', {}), ensure_ascii=False)}
Competitors: {json.dumps(state.get('aggregate', {}), ensure_ascii=False)}
Root keys: competitor_gaps, unique_attributes, sme_quote_angles, experience_annotations, new_h2_recommendations."""
    config = _node_config(state, "information_gain")
    state["information_gain"] = _llm_json(prompt, fallback=fallback, model=config.get("model"), max_tokens=2400)
    _mark_node(state, "information_gain", "succeeded")
    _persist_node_status(state)
    return state


def writer_directive_node(state: BlogGraphState) -> BlogGraphState:
    fallback = {
        "mandatory_h2s": [
            {"h2_text": f"What is {state['input']['keyword']}?", "word_count_target": 220, "must_include": ["clear definition"]},
            {"h2_text": f"How {state['input']['keyword']} works", "word_count_target": 280, "must_include": ["process", "examples"]},
            {"h2_text": f"How to choose the right approach", "word_count_target": 280, "must_include": ["criteria", "table"]},
        ],
        "unique_angles": state.get("information_gain", {}).get("unique_attributes", []),
        "eeat_injections": state.get("information_gain", {}).get("experience_annotations", []),
        "faq_questions": state.get("nlp_map", {}).get("question_variants", [])[:5],
        "forbidden_angles": [],
        "content_gap_hook": "This article adds practical selection criteria and localized examples missing from most ranking pages.",
    }
    prompt = f"""Return valid JSON only. Transform this Information Gain Plan into a writer directive.
Information gain: {json.dumps(state.get('information_gain', {}), ensure_ascii=False)}
Intent: {json.dumps(state.get('intent', {}), ensure_ascii=False)}
Schema keys: mandatory_h2s, unique_angles, eeat_injections, faq_questions, forbidden_angles, content_gap_hook."""
    config = _node_config(state, "writer_directive")
    state["writer_directive"] = _llm_json(prompt, fallback=fallback, model=config.get("model"), max_tokens=2200)
    _mark_node(state, "writer_directive", "succeeded")
    _persist_node_status(state)
    return state


def title_h1_node(state: BlogGraphState) -> BlogGraphState:
    keyword = state["input"]["keyword"]
    fallback = {
        "title_tag": state["input"]["title"],
        "h1": state["input"]["title"] if keyword.lower() in state["input"]["title"].lower() else f"{keyword}: {state['input']['title']}",
        "slug": _normalize_slug(state["input"]["title"] or keyword),
    }
    prompt = f"""Return valid JSON only. Create SEO title metadata.
Keyword: {keyword}
Proposed title: {state['input']['title']}
Locale: {state['input']['locale']}
Return title_tag under 70 chars, h1, slug."""
    config = _node_config(state, "title_h1")
    state["title_h1"] = _llm_json(prompt, fallback=fallback, model=config.get("model"), max_tokens=900)
    _mark_node(state, "title_h1", "succeeded")
    _persist_node_status(state)
    return state


def author_about_node(state: BlogGraphState) -> BlogGraphState:
    if not _node_enabled(state, "author_about"):
        _mark_node(state, "author_about", "skipped")
        return state
    out: dict[str, Any] = {"about_page": {}, "author_page": {}, "facts": []}
    for key, target in (("about_page", state["input"].get("aboutPage")), ("author_page", state["input"].get("authorPage"))):
        if isinstance(target, str) and target.startswith(("http://", "https://")):
            fetched = _fetch_url_text(target, use_jina=True, timeout=20.0)
            text = str(fetched.get("text") or "")
            out[key] = {"url": target, "summary": _compact_text(text[:900]), "ok": bool(fetched.get("ok"))}
            if fetched.get("ok"):
                out["facts"].append({"source": target, "detail": _compact_text(text[:240])})
    state["author_about"] = out
    _mark_node(state, "author_about", "succeeded", {"facts": len(out["facts"])})
    _persist_node_status(state)
    return state


def outline_node(state: BlogGraphState) -> BlogGraphState:
    keyword = state["input"]["keyword"]
    title_h1 = state.get("title_h1", {})
    fallback = {
        "h1": title_h1.get("h1") or state["input"]["title"],
        "keyword_strategy": {
            "primary_keyword": keyword,
            "secondary_keywords": [v for v in state.get("nlp_map", {}).get("secondary_keywords", []) if v],
            "search_intent": state.get("intent", {}).get("search_intent", {}).get("primary", "informational"),
        },
        "semantic_content_outline": {
            "heading_map": [
                {"h2": item.get("h2_text"), "goal": "Cover search intent with practical detail", "h3": []}
                for item in state.get("writer_directive", {}).get("mandatory_h2s", [])
                if isinstance(item, dict) and item.get("h2_text")
            ],
            "tables": [{"title": "Decision checklist", "columns": ["Criteria", "What to check", "Why it matters"]}],
        },
        "faq": [{"question": q, "answer": "Answer this directly in the article."} for q in state.get("writer_directive", {}).get("faq_questions", [])[:5]],
        "schema_recommendation": ["Article", "FAQPage", "BreadcrumbList"],
    }
    if not fallback["semantic_content_outline"]["heading_map"]:
        fallback["semantic_content_outline"]["heading_map"] = [
            {"h2": f"What is {keyword}?", "goal": "Definition", "h3": []},
            {"h2": f"How {keyword} works", "goal": "Process", "h3": []},
            {"h2": "How to make the right decision", "goal": "Selection", "h3": []},
        ]
    prompt = f"""Return valid JSON only. Create a semantic SEO outline.
Input: {json.dumps(state['input'], ensure_ascii=False)}
Title/H1: {json.dumps(state.get('title_h1', {}), ensure_ascii=False)}
NLP: {json.dumps(state.get('nlp_map', {}), ensure_ascii=False)}
Intent: {json.dumps(state.get('intent', {}), ensure_ascii=False)}
Writer directive: {json.dumps(state.get('writer_directive', {}), ensure_ascii=False)}
Use this root shape: h1, keyword_strategy, semantic_content_outline.heading_map, semantic_content_outline.tables, faq, schema_recommendation."""
    config = _node_config(state, "outline")
    state["outline"] = _llm_json(prompt, fallback=fallback, model=config.get("model"), max_tokens=3800)
    _mark_node(state, "outline", "succeeded")
    _persist_node_status(state)
    return state


def _fallback_article_html(state: BlogGraphState) -> str:
    outline = state.get("outline", {})
    h1 = str(outline.get("h1") or state["input"]["title"])
    keyword = state["input"]["keyword"]
    locale = state["input"].get("locale")
    intro = (
        f"{keyword} is a practical decision topic that deserves clear criteria, concrete examples, and source-backed guidance."
        if locale == "en"
        else f"{keyword} est un sujet de decision pratique qui merite des criteres clairs, des exemples concrets et des reperes fiables."
    )
    sections = []
    heading_map = _json_or_empty(outline.get("semantic_content_outline")).get("heading_map", [])
    for item in heading_map[:8]:
        if not isinstance(item, dict):
            continue
        h2 = str(item.get("h2") or "").strip()
        if not h2:
            continue
        goal = str(item.get("goal") or "Clarify the topic with practical detail.")
        sections.append(
            f"<section><h2>{h2}</h2><p>{goal} This section explains the decision context, the main tradeoffs, and the details a reader should verify before acting.</p>"
            f"<p><strong>Experience signal:</strong> Use this area to add a client observation, internal test, or expert note tied to {keyword}.</p>"
            f"<figure data-type=\"image\"><img src=\"#\" alt=\"Image illustrating {h2}\"/><figcaption>Visual placeholder supporting this section.</figcaption></figure></section>"
        )
    faqs = []
    for faq in _list_or_empty(outline.get("faq"))[:5]:
        if isinstance(faq, dict) and faq.get("question"):
            faqs.append(f"<h3>{faq['question']}</h3><p>{faq.get('answer') or 'Add a concise answer based on the article context.'}</p>")
    return (
        f"<article><h1>{h1}</h1><p>{intro}</p>"
        + "".join(sections)
        + "<section><h2>FAQ</h2>"
        + "".join(faqs)
        + "</section><!-- QA_CHECKLIST: {} --><!-- SOURCES_USED: [] --></article>"
    )


def article_html_node(state: BlogGraphState) -> BlogGraphState:
    config = _node_config(state, "article_html")
    fallback = _fallback_article_html(state)
    prompt = f"""Generate one complete semantic HTML article only. No markdown.
Locale: {state['input']['locale']}-CA
Primary keyword: {state['input']['keyword']}
Title: {state['input']['title']}
Outline JSON: {json.dumps(state.get('outline', {}), ensure_ascii=False)}
Brand/author facts: {json.dumps(state.get('author_about', {}), ensure_ascii=False)}
Competitor facts: {json.dumps(state.get('aggregate', {}).get('facts', []), ensure_ascii=False)}
Rules:
- Use <article>, <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <figure>, <img>, <figcaption>, <blockquote>, <section>, <a>.
- Preserve outline H1/H2/H3 order.
- Target {config.get('minWords', 1200)} to {config.get('maxWords', 1800)} words.
- Add internal links as placeholders when provided: {json.dumps(state['input'].get('internalLinks', []), ensure_ascii=False)}
- Add citation placeholders rather than invent facts.
- End with QA_CHECKLIST and SOURCES_USED HTML comments."""
    html = _llm_text(prompt, fallback=fallback, model=config.get("model"), max_tokens=12000)
    html = re.sub(r"^```(?:html)?\s*", "", html.strip())
    html = re.sub(r"\s*```$", "", html)
    state["article_html"] = html
    _mark_node(state, "article_html", "succeeded", {"chars": len(html)})
    _persist_node_status(state)
    return state


def html_cleanup_node(state: BlogGraphState) -> BlogGraphState:
    html = state.get("article_html", "")
    html = re.sub(r"\r\n?", "\n", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    html = re.sub(r">\s+<", "><", html)
    if "<article" not in html.lower():
        html = f"<article>{html}</article>"
    state["article_html"] = html.strip()
    _mark_node(state, "html_cleanup", "succeeded")
    _persist_node_status(state)
    return state


def html_to_markdown(html: str) -> str:
    value = HTML_COMMENT_RE.sub("", html or "")
    replacements = [
        (r"(?is)<h1[^>]*>(.*?)</h1>", r"# \1\n\n"),
        (r"(?is)<h2[^>]*>(.*?)</h2>", r"\n\n## \1\n\n"),
        (r"(?is)<h3[^>]*>(.*?)</h3>", r"\n\n### \1\n\n"),
        (r"(?is)<blockquote[^>]*>(.*?)</blockquote>", r"\n\n> \1\n\n"),
        (r"(?is)<li[^>]*>(.*?)</li>", r"- \1\n"),
        (r"(?is)<p[^>]*>(.*?)</p>", r"\1\n\n"),
        (r"(?is)<figcaption[^>]*>(.*?)</figcaption>", r"_\1_\n\n"),
        (r"(?is)<br\s*/?>", "\n"),
    ]
    for pattern, repl in replacements:
        value = re.sub(pattern, repl, value)
    value = re.sub(r"(?is)<a[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", r"[\2](\1)", value)
    value = re.sub(r"(?is)<img[^>]*alt=[\"']([^\"']*)[\"'][^>]*>", r"![\1](#)", value)
    value = re.sub(r"(?is)<strong[^>]*>(.*?)</strong>", r"**\1**", value)
    value = re.sub(r"(?is)<em[^>]*>(.*?)</em>", r"*\1*", value)
    value = TAG_RE.sub("\n", value)
    value = unescape(value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip() + "\n"


def markdown_convert_node(state: BlogGraphState) -> BlogGraphState:
    markdown = html_to_markdown(state.get("article_html", ""))
    state["article_markdown"] = markdown
    _mark_node(state, "markdown_convert", "succeeded", {"chars": len(markdown)})
    _persist_node_status(state)
    return state


def quality_gate_node(state: BlogGraphState) -> BlogGraphState:
    config = _node_config(state, "quality_gate")
    text = _strip_html(state.get("article_html", ""))
    words = re.findall(r"\b[\wÀ-ÿ'-]+\b", text)
    headings = re.findall(r"(?is)<h[1-3][^>]*>", state.get("article_html", ""))
    min_words = max(100, int(config.get("minWords") or 900))
    qa = {
        "word_count": len(words),
        "min_word_count": min_words,
        "min_word_count_met": len(words) >= min_words,
        "has_article_wrapper": "<article" in state.get("article_html", "").lower(),
        "heading_count": len(headings),
        "has_headings": len(headings) >= 2,
        "markdown_ready": len(state.get("article_markdown", "")) > 200,
        "passed": len(words) >= min_words and len(headings) >= 2 and len(state.get("article_markdown", "")) > 200,
    }
    state["qa_report"] = qa
    _mark_node(state, "quality_gate", "succeeded" if qa["passed"] else "failed", {"wordCount": len(words)})
    _persist_node_status(state)
    if not qa["passed"]:
        raise BlogPipelineError("quality_gate_failed")
    return state


def cms_draft_node(state: BlogGraphState) -> BlogGraphState:
    payload = state["payload"]
    run_config = _json_or_empty(state.get("profile", {}).get("run_config"))
    save_to_cms = payload.get("saveToCms")
    if save_to_cms is None:
        save_to_cms = run_config.get("saveToCms", True)
    if save_to_cms is False or not _node_enabled(state, "cms_draft"):
        _mark_node(state, "cms_draft", "skipped")
        _persist_node_status(state)
        return state
    repo = BlogRepository.from_env()
    config = _node_config(state, "cms_draft")
    title_meta = _json_or_empty(state.get("title_h1"))
    excerpt = _strip_html(state.get("article_html", ""))[:360]
    author_summary = _json_or_empty(state.get("author_about", {}).get("author_page"))
    post = repo.create_editorial_draft(
        article={
            "title": title_meta.get("title_tag") or state["input"]["title"],
            "slug": title_meta.get("slug") or state["input"]["title"],
            "locale": state["input"]["locale"],
            "category": state["input"].get("category") or config.get("category") or "SEO",
            "excerpt": excerpt,
            "content_markdown": state.get("article_markdown", ""),
            "seo_title": title_meta.get("title_tag") or state["input"]["title"],
            "seo_description": excerpt,
            "author_name": author_summary.get("summary", "")[:120] if isinstance(author_summary, dict) else None,
        },
        user_id=_trim(payload.get("userId")) or None,
    )
    state["editorial_post"] = post
    _mark_node(state, "cms_draft", "succeeded", {"postId": post.get("id"), "slug": post.get("slug")})
    _persist_node_status(state)
    return state


def _persist_node_status(state: BlogGraphState) -> None:
    run = _json_or_empty(state.get("run"))
    run_id = run.get("id")
    if not isinstance(run_id, str):
        return
    try:
        BlogRepository.from_env().update_run(run_id, {"node_statuses": state.get("node_statuses", {})})
    except Exception as exc:
        print(f"SEO blog node status persist failed: {exc}")


def finalize_output(state: BlogGraphState) -> dict[str, Any]:
    return {
        "status": "succeeded",
        "runId": state.get("run", {}).get("id"),
        "profileId": state.get("profile", {}).get("id"),
        "editorialPostId": state.get("editorial_post", {}).get("id"),
        "editorialSlug": state.get("editorial_post", {}).get("slug"),
        "outline_json": state.get("outline"),
        "article_html": state.get("article_html"),
        "article_markdown": state.get("article_markdown"),
        "qa_report": state.get("qa_report"),
        "sources_used": state.get("sources_used", []),
        "node_statuses": state.get("node_statuses", {}),
    }


blog_graph_builder = StateGraph(BlogGraphState)


def _graph_step_name(node_name: str) -> str:
    return f"step_{node_name}"


for graph_node in GRAPH_NODE_SEQUENCE:
    blog_graph_builder.add_node(_graph_step_name(graph_node), globals()[f"{graph_node}_node"])
blog_graph_builder.add_edge(START, _graph_step_name(GRAPH_NODE_SEQUENCE[0]))
for current, nxt in zip(GRAPH_NODE_SEQUENCE, GRAPH_NODE_SEQUENCE[1:]):
    blog_graph_builder.add_edge(_graph_step_name(current), _graph_step_name(nxt))
blog_graph_builder.add_edge(_graph_step_name(GRAPH_NODE_SEQUENCE[-1]), END)
if MemorySaver is not None:
    blog_graph = blog_graph_builder.compile(checkpointer=MemorySaver())
else:
    blog_graph = blog_graph_builder.compile()


def run_blog_graph(payload: dict[str, Any], *, thread_id: str | None = None) -> dict[str, Any]:
    started_at = now_iso()
    run_id = None
    try:
        state = blog_graph.invoke(
            {"payload": payload, "startedAt": started_at},
            config={"configurable": {"thread_id": thread_id or _trim(payload.get("idempotencyKey")) or str(uuid.uuid4())}},
        )
        finished_at = now_iso()
        output = finalize_output(state)
        run_id = output.get("runId")
        if isinstance(run_id, str):
            BlogRepository.from_env().update_run(
                run_id,
                {
                    "status": "succeeded",
                    "finished_at": finished_at,
                    "node_statuses": state.get("node_statuses", {}),
                    "output_outline": state.get("outline"),
                    "article_html": state.get("article_html"),
                    "article_markdown": state.get("article_markdown"),
                    "qa_report": state.get("qa_report", {}),
                    "sources_used": state.get("sources_used", []),
                    "editorial_post_id": state.get("editorial_post", {}).get("id"),
                },
            )
        return {
            "status": "succeeded",
            "flow": "seo-blog-writer",
            "mode": payload.get("mode"),
            "startedAt": started_at,
            "finishedAt": finished_at,
            "summary": {
                "runId": run_id,
                "profileId": output.get("profileId"),
                "editorialPostId": output.get("editorialPostId"),
                "qaPassed": output.get("qa_report", {}).get("passed"),
            },
            "output": output,
        }
    except Exception as exc:
        finished_at = now_iso()
        error = _safe_error(exc)
        try:
            job_id = _trim(payload.get("idempotencyKey")) or _trim(payload.get("requestId"))
            if job_id and not run_id:
                repo = BlogRepository.from_env()
                rows = repo._request(
                    "GET",
                    "/rest/v1/seo_blog_agent_runs",
                    query={"select": "id", "job_id": f"eq.{job_id}", "limit": "1"},
                )
                row = rows[0] if isinstance(rows, list) and rows else None
                if isinstance(row, dict):
                    run_id = row.get("id")
            if isinstance(run_id, str):
                BlogRepository.from_env().update_run(
                    run_id,
                    {"status": "failed", "finished_at": finished_at, "error_message": error},
                )
        except Exception as repo_exc:
            print(f"SEO blog run failure persist failed: {repo_exc}")
        return {
            "status": "failed",
            "flow": "seo-blog-writer",
            "mode": payload.get("mode"),
            "startedAt": started_at,
            "finishedAt": finished_at,
            "summary": {"runId": run_id},
            "output": {"status": 500, "body": {"status": "failed", "error": error, "runId": run_id}},
            "error": error,
        }

import hashlib
import ipaddress
import json
import os
import re
import socket
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import Any
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

import httpx
from zoneinfo import ZoneInfo

from recap_repository import RecapDayTheme, RecapRepository, RecapRepositoryError, RecapSource

FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape"
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages"
RSS_TIMEOUT_SECONDS = 10.0
RSS_MAX_ENTRIES = 5
RSS_MAX_BYTES = 1_000_000
RSS_MAX_REDIRECTS = 3
SCRAPLING_TIMEOUT_SECONDS = 18.0
FIRECRAWL_TIMEOUT_SECONDS = 20.0
ARTICLE_SELECTORS = ("article", "main", "[role='main']", ".post", ".article", ".content", "#content")
TAG_RE = re.compile(r"(?is)<[^>]+>")
RSS_REDIRECT_STATUSES = {301, 302, 303, 307, 308}
RSS_BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "host.docker.internal",
    "metadata.google.internal",
    "169.254.169.254",
}
RSS_BLOCKED_HOSTNAME_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")

ARTICLE_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "fr": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "introduction": {"type": "string"},
                "article_markdown": {"type": "string"},
            },
            "required": ["title", "introduction", "article_markdown"],
            "additionalProperties": False,
        },
        "en": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "introduction": {"type": "string"},
                "article_markdown": {"type": "string"},
            },
            "required": ["title", "introduction", "article_markdown"],
            "additionalProperties": False,
        },
    },
    "required": ["fr", "en"],
    "additionalProperties": False,
}

FACT_CHECK_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "claim": {"type": "string"},
                    "severity": {"type": "string"},
                    "reason": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
                "required": ["claim", "severity", "reason", "suggestion"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["issues"],
    "additionalProperties": False,
}

COPYRIGHT_COMPLIANCE_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "status": {"type": "string"},
        "max_risk": {"type": "string"},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "risk": {"type": "string"},
                    "rule_ids": {"type": "array", "items": {"type": "string"}},
                    "locale": {"type": "string"},
                    "passage": {"type": "string"},
                    "source_url": {"type": "string"},
                    "reason": {"type": "string"},
                    "suggestion": {"type": "string"},
                    "requires_external_verification": {"type": "boolean"},
                },
                "required": [
                    "risk",
                    "rule_ids",
                    "locale",
                    "passage",
                    "source_url",
                    "reason",
                    "suggestion",
                    "requires_external_verification",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["status", "max_risk", "issues"],
    "additionalProperties": False,
}

SUMMARY30_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "fr": {
            "type": "object",
            "properties": {
                "one_sentence_summary": {"type": "string"},
                "bullets": {"type": "array", "items": {"type": "string"}},
                "primary_source_url": {"type": "string"},
                "source_urls": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["one_sentence_summary", "bullets", "primary_source_url", "source_urls"],
            "additionalProperties": False,
        },
        "en": {
            "type": "object",
            "properties": {
                "one_sentence_summary": {"type": "string"},
                "bullets": {"type": "array", "items": {"type": "string"}},
                "primary_source_url": {"type": "string"},
                "source_urls": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["one_sentence_summary", "bullets", "primary_source_url", "source_urls"],
            "additionalProperties": False,
        },
    },
    "required": ["fr", "en"],
    "additionalProperties": False,
}


def _bounded_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _trim_or_none(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def _safe_error(error: Exception | str) -> str:
    message = str(error).strip()
    return f"{message[:400]}..." if len(message) > 400 else message


def _stable_input_hash(value: Any) -> str:
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _strip_html(value: str) -> str:
    return _compact_text(unescape(TAG_RE.sub(" ", re.sub(r"(?is)<!--.*?-->", " ", value or ""))))


def _extract_snippet(text: str, max_chars: int = 500) -> str:
    compact = _compact_text(text)
    if len(compact) <= max_chars:
        return compact
    return compact[: max(0, max_chars - 3)].rstrip() + "..."


def _normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or "recap"


def _canonical_source_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        return None
    if hostname.startswith("www."):
        hostname = hostname[4:]
    port = ""
    if parsed.port and not ((parsed.scheme == "http" and parsed.port == 80) or (parsed.scheme == "https" and parsed.port == 443)):
        port = f":{parsed.port}"
    path = re.sub(r"/{2,}", "/", parsed.path or "").rstrip("/")
    return f"{hostname}{port}{path}"


def _canonical_source_url_set(urls: list[str] | set[str] | tuple[str, ...]) -> set[str]:
    out: set[str] = set()
    for url in urls:
        canonical = _canonical_source_url(url)
        if canonical:
            out.add(canonical)
    return out


def _is_seen_source_url(source_url: str, seen_source_urls: set[str] | None) -> bool:
    if not seen_source_urls:
        return False
    canonical = _canonical_source_url(source_url)
    return bool(canonical and canonical in seen_source_urls)


def _duplicate_scrape_result(source: RecapSource, target_url: str, title: str | None = None) -> dict[str, Any]:
    return {
        "source_url": target_url,
        "title": (title or source.name)[:180],
        "text": "",
        "snippet": "",
        "status": 208,
        "scrape_ok": False,
        "scrape_method": "unknown",
        "quality": {"word_count": 0, "data_points": 0, "score": 0},
        "is_duplicate": True,
        "skip_reason": "source_url_already_published",
    }


def _parse_json_text(value: str, context: str) -> dict[str, Any]:
    # 1. Basic trim and markdown block removal
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", value.strip(), flags=re.I)
    
    # 2. Extract content between first { and last }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    candidate = cleaned[start : end + 1] if start >= 0 and end > start else cleaned
    
    # 3. Replace raw control characters (0-31) which are invalid in JSON strings
    candidate_cleaned = re.sub(r'[\x00-\x1f]', ' ', candidate)
    
    # 4. Handle common LLM JSON errors: trailing commas before closing braces/brackets
    # This regex looks for a comma followed by any amount of whitespace then a closing brace or bracket
    candidate_cleaned = re.sub(r',\s*([}\]])', r'\1', candidate_cleaned)

    try:
        parsed = json.loads(candidate_cleaned)
    except json.JSONDecodeError as exc:
        # Show context around the error for debugging
        start_pos = max(0, exc.pos - 100)
        end_pos = min(len(candidate_cleaned), exc.pos + 100)
        snippet = candidate_cleaned[start_pos:end_pos]
        print(f"DEBUG: JSON error in {context} at pos {exc.pos} around:\n{snippet}")
        
        # Unterminated string fix
        if "unterminated string" in str(exc).lower():
            try:
                # Try to close the string and any open objects
                fixed = candidate_cleaned + '"'
                # Count open braces
                open_braces = fixed.count("{") - fixed.count("}")
                fixed += "}" * open_braces
                parsed = json.loads(fixed)
                return parsed
            except Exception:
                pass

        raise RuntimeError(f"Invalid {context} JSON: {exc}") from exc
    
    if not isinstance(parsed, dict):
        raise RuntimeError(f"Invalid {context} JSON: expected object")
    return parsed


class RecapAiGenerationError(RuntimeError):
    def __init__(
        self,
        reason: str,
        message: str,
        *,
        stage: str | None = None,
        model: str | None = None,
        stop_reason: str | None = None,
        usage: dict[str, Any] | None = None,
    ):
        super().__init__(f"{reason}: {message}")
        self.reason = reason
        self.stage = stage
        self.model = model
        self.stop_reason = stop_reason
        self.usage = usage or {}


class RecapAiRunTracker:
    def __init__(self, max_anthropic_calls: int):
        self.max_anthropic_calls = max(0, max_anthropic_calls)
        self.ai_calls = 0
        self.artifact_reused = 0
        self.usage: list[dict[str, Any]] = []
        self.anthropic_model: str | None = None
        self.stop_reason: str | None = None
        self.failure_stage: str | None = None
        self.failure_reason: str | None = None

    def reserve_anthropic_call(self, stage: str, model: str) -> None:
        if self.ai_calls >= self.max_anthropic_calls:
            self.failure_stage = stage
            self.failure_reason = "anthropic_budget_exceeded"
            raise RecapAiGenerationError(
                "anthropic_budget_exceeded",
                f"Anthropic call budget exceeded before {stage}",
                stage=stage,
                model=model,
            )
        self.ai_calls += 1
        self.anthropic_model = model

    def record_usage(self, stage: str, model: str, stop_reason: str | None, usage: dict[str, Any]) -> None:
        self.anthropic_model = model
        self.stop_reason = stop_reason
        self.usage.append({"stage": stage, "model": model, "stop_reason": stop_reason, "usage": usage})

    def record_artifact_reused(self, stage: str, artifact: dict[str, Any]) -> None:
        self.artifact_reused += 1
        model = _trim_or_none(artifact.get("model"))
        if model:
            self.anthropic_model = model
        usage = artifact.get("usage_json")
        if isinstance(usage, dict):
            self.usage.append({"stage": stage, "model": model, "reused": True, "usage": usage})

    def record_failure(self, reason: str, stage: str | None = None) -> None:
        self.failure_reason = reason
        if stage:
            self.failure_stage = stage

    def snapshot(self) -> dict[str, Any]:
        return {
            "ai_calls": self.ai_calls,
            "artifact_reused": self.artifact_reused,
            "failure_stage": self.failure_stage,
            "failure_reason": self.failure_reason,
            "anthropic_model": self.anthropic_model,
            "stop_reason": self.stop_reason,
            "usage": self.usage,
        }


def _to_weekday_index_from_zone(now: datetime) -> int:
    return 0 if now.weekday() == 6 else now.weekday() + 1


def _weekday_to_day_theme_index(weekday_index: int) -> int | None:
    return weekday_index if 1 <= weekday_index <= 5 else None


def _resolve_edition_key(now_local: datetime) -> str:
    iso_year, iso_week, _ = now_local.isocalendar()
    weekday_tokens = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    return f"{iso_year}-W{iso_week:02d}-{weekday_tokens[now_local.weekday()]}"


def _week_bounds(now_local: datetime) -> tuple[str, str]:
    monday = (now_local - timedelta(days=now_local.weekday())).date()
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def _is_slot_match(now_local: datetime, day: int, hour: int, minute: int) -> bool:
    return _to_weekday_index_from_zone(now_local) == day and now_local.hour == hour and now_local.minute == minute


def _score_content(text: str) -> dict[str, int]:
    words = [token for token in re.split(r"\s+", text or "") if token]
    data_points = len(re.findall(r"\b\d[\d,.]*%|\$[\d,.]+[BMK]?|\b\d{4}\b|\b\d+\.\d+\b|\b\d{2,}\b", text or ""))
    return {"word_count": len(words), "data_points": data_points, "score": min(len(words), 2000) + data_points * 50}


def _extract_claims(text: str, max_claims: int) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", _compact_text(text))
    ranked: list[tuple[int, str]] = []
    for sentence in sentences:
        line = sentence.strip()
        if len(line) < 25:
            continue
        score = (3 if re.search(r"\d", line) else 0) + (
            2 if re.search(r"(%|\$|million|billion|benchmark|latency|accuracy|date|funding)", line, re.I) else 0
        ) + (1 if len(line) > 90 else 0)
        ranked.append((score, line))
    ranked.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
    out: list[str] = []
    seen: set[str] = set()
    for _, sentence in ranked:
        key = sentence.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(sentence)
        if len(out) >= max_claims:
            break
    return out


@dataclass(frozen=True)
class NativeRecapConfig:
    timezone: str
    max_sources: int
    target_successful_scrapes: int
    scrape_min_words: int
    evidence_snippet_max_chars: int
    evidence_claims_max_per_story: int
    evidence_pack_max_chars: int
    google_api_key: str | None
    summary_model: str
    anthropic_api_key: str | None
    max_articles_per_run: int
    article_model: str
    article_fallback_model: str | None
    article_max_tokens: int
    ai_fail_fast: bool
    allow_paid_fallback: bool
    max_anthropic_calls_per_run: int
    firecrawl_api_key: str | None
    app_base_url: str
    sendfox_api_token: str | None
    sendfox_list_id: str | None
    sendfox_test_list_id: str | None
    sendfox_base_url: str
    sendfox_from_name: str
    sendfox_from_email: str

    @classmethod
    def from_env(cls) -> "NativeRecapConfig":
        return cls(
            timezone=(os.getenv("RECAP_TIMEZONE") or "America/Toronto").strip(),
            max_sources=_bounded_int_env("RECAP_MAX_SOURCES", 12, 1, 30),
            target_successful_scrapes=_bounded_int_env("RECAP_TARGET_SUCCESSFUL_SCRAPES", 4, 1, 12),
            scrape_min_words=_bounded_int_env("RECAP_SCRAPE_MIN_WORDS", 120, 40, 1200),
            evidence_snippet_max_chars=_bounded_int_env("RECAP_EVIDENCE_SNIPPET_MAX_CHARS", 1800, 400, 5000),
            evidence_claims_max_per_story=_bounded_int_env("RECAP_EVIDENCE_CLAIMS_MAX_PER_STORY", 8, 2, 20),
            evidence_pack_max_chars=_bounded_int_env("RECAP_EVIDENCE_PACK_MAX_CHARS", 12000, 3000, 30000),
            google_api_key=_trim_or_none(os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")),
            summary_model=(os.getenv("RECAP_SUMMARY_MODEL") or "gemini-flash-latest").strip(),
            anthropic_api_key=_trim_or_none(os.getenv("ANTHROPIC_API_KEY")),
            max_articles_per_run=_bounded_int_env("RECAP_MAX_ARTICLES_PER_RUN", 20, 1, 100),
            article_model=(os.getenv("RECAP_ARTICLE_MODEL") or os.getenv("ANTHROPIC_MODEL_PRIMARY") or "claude-sonnet-4-6").strip(),
            article_fallback_model=_trim_or_none(os.getenv("ANTHROPIC_MODEL_FALLBACK")),
            article_max_tokens=_bounded_int_env("RECAP_ARTICLE_MAX_TOKENS", 6500, 1000, 8192),
            ai_fail_fast=_bool_env("RECAP_AI_FAIL_FAST", True),
            allow_paid_fallback=_bool_env("RECAP_ALLOW_PAID_FALLBACK", False),
            max_anthropic_calls_per_run=_bounded_int_env("RECAP_MAX_ANTHROPIC_CALLS_PER_RUN", 4, 0, 20),
            firecrawl_api_key=_trim_or_none(os.getenv("FIRECRAWL_API_KEY")),
            app_base_url=(os.getenv("APP_BASE_URL") or "https://kode01.com").strip().rstrip("/"),
            sendfox_api_token=_trim_or_none(os.getenv("SENDFOX_API_TOKEN")),
            sendfox_list_id=_trim_or_none(os.getenv("SENDFOX_LIST_ID")),
            sendfox_test_list_id=_trim_or_none(os.getenv("SENDFOX_TEST_LIST_ID")),
            sendfox_base_url=(os.getenv("SENDFOX_API_BASE_URL") or "https://api.sendfox.com").strip().rstrip("/"),
            sendfox_from_name=(os.getenv("SENDFOX_FROM_NAME") or "KODE01").strip(),
            sendfox_from_email=(os.getenv("SENDFOX_FROM_EMAIL") or os.getenv("RESEND_FROM_EMAIL") or "news@kode01.com").strip(),
        )


def _is_blocked_rss_hostname(hostname: str) -> bool:
    normalized = (hostname or "").strip().lower().rstrip(".")
    if not normalized:
        return True
    if normalized in RSS_BLOCKED_HOSTNAMES:
        return True
    return any(normalized.endswith(suffix) for suffix in RSS_BLOCKED_HOSTNAME_SUFFIXES)


def _is_blocked_rss_ip_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_rss_hostname(hostname: str) -> list[str]:
    records = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    out: list[str] = []
    for record in records:
        address = str(record[4][0])
        if address not in out:
            out.append(address)
    return out


def _validate_public_https_url(raw_url: str, base_url: str | None = None) -> str:
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise RuntimeError("blocked_url:invalid_url")
    try:
        candidate = urljoin(base_url, raw_url.strip()) if base_url else raw_url.strip()
        parsed = urlparse(candidate)
    except Exception as exc:
        raise RuntimeError("blocked_url:invalid_url") from exc

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if parsed.scheme.lower() != "https" or not hostname:
        raise RuntimeError("blocked_url:invalid_protocol")
    if parsed.username or parsed.password:
        raise RuntimeError("blocked_url:contains_credentials")
    if _is_blocked_rss_hostname(hostname):
        raise RuntimeError("blocked_url:blocked_hostname")

    try:
        ipaddress.ip_address(hostname)
        addresses = [hostname]
    except ValueError:
        try:
            addresses = _resolve_rss_hostname(hostname)
        except Exception as exc:
            raise RuntimeError("blocked_url:hostname_resolution_failed") from exc
        if not addresses:
            raise RuntimeError("blocked_url:hostname_resolution_empty")

    blocked_address = next((address for address in addresses if _is_blocked_rss_ip_address(address)), None)
    if blocked_address:
        raise RuntimeError(f"blocked_url:blocked_ip:{blocked_address}")

    return parsed.geturl()


def _fetch_url_text(url: str, timeout_seconds: float, *, user_agent: str | None = None) -> tuple[int, str]:
    headers = {"User-Agent": user_agent} if user_agent else {}
    current_url = _validate_public_https_url(url)
    with httpx.Client(timeout=timeout_seconds, follow_redirects=False) as client:
        for redirect_count in range(RSS_MAX_REDIRECTS + 1):
            response = client.get(current_url, headers=headers)
            if response.status_code not in RSS_REDIRECT_STATUSES:
                content = getattr(response, "content", None)
                if isinstance(content, bytes):
                    if len(content) > RSS_MAX_BYTES:
                        raise RuntimeError("RSS response too large")
                else:
                    text_bytes = str(getattr(response, "text", "")).encode("utf-8", errors="ignore")
                    if len(text_bytes) > RSS_MAX_BYTES:
                        raise RuntimeError("RSS response too large")
                return response.status_code, response.text

            location = response.headers.get("location") if getattr(response, "headers", None) is not None else None
            if not location:
                raise RuntimeError("RSS redirect missing location")
            if redirect_count >= RSS_MAX_REDIRECTS:
                raise RuntimeError("RSS redirect limit exceeded")
            current_url = _validate_public_https_url(urljoin(current_url, location))

    raise RuntimeError("RSS redirect limit exceeded")


def _response_status(page: Any) -> int:
    value = getattr(page, "status", None)
    return int(value) if isinstance(value, int) else 200


def _response_html(page: Any) -> str:
    for attr in ("html_content", "text", "body"):
        value = getattr(page, attr, None)
        if isinstance(value, bytes):
            return value.decode(getattr(page, "encoding", None) or "utf-8", errors="ignore")
        if isinstance(value, str):
            return value
    return str(page)


def _selector_text(selector: Any) -> str:
    if selector is None:
        return ""
    get_all_text = getattr(selector, "get_all_text", None)
    if callable(get_all_text):
        try:
            return _compact_text(str(get_all_text(strip=True)))
        except TypeError:
            return _compact_text(str(get_all_text()))
    text = getattr(selector, "text", None)
    if isinstance(text, str):
        return _compact_text(text)
    return _strip_html(str(selector))


def _scrapling_fetch(url: str, *, stealth: bool = False) -> Any:
    safe_url = _validate_public_https_url(url)
    try:
        from scrapling.fetchers import Fetcher, StealthyFetcher
    except Exception as exc:
        raise RuntimeError("scrapling[fetchers] is not installed in the Modal image") from exc

    if stealth:
        return StealthyFetcher.fetch(safe_url, headless=True, network_idle=True, timeout=int(SCRAPLING_TIMEOUT_SECONDS * 1000))
    return Fetcher.get(safe_url, timeout=int(SCRAPLING_TIMEOUT_SECONDS))


def _extract_links_from_page(page: Any, base_url: str) -> list[str]:
    out: list[str] = []
    try:
        raw_links = page.css("a::attr(href)")
    except Exception:
        raw_links = []
    for raw in raw_links or []:
        href = str(raw).strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        try:
            absolute = _validate_public_https_url(href, base_url)
        except RuntimeError:
            continue
        if absolute not in out:
            out.append(absolute)
    if out:
        return out

    html = _response_html(page)
    for match in re.finditer(r"""(?is)<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1""", html):
        href = unescape((match.group(2) or "").strip())
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        try:
            absolute = _validate_public_https_url(href, base_url)
        except RuntimeError:
            continue
        if absolute not in out:
            out.append(absolute)
    return out


def _is_likely_article_url(candidate: str, source_url: str) -> bool:
    try:
        parsed_candidate = urlparse(candidate)
        parsed_source = urlparse(source_url)
        if parsed_candidate.scheme != "https" or parsed_source.scheme != "https":
            return False
        if parsed_candidate.hostname != parsed_source.hostname:
            return False
        path = (parsed_candidate.path or "").lower()
        return bool(re.search(r"(blog|news|article|post|research|release|updates|announc|202[0-9]|/p/)", path))
    except Exception:
        return False


def _score_article_url(candidate: str, source_url: str) -> int:
    parsed_candidate = urlparse(candidate)
    parsed_source = urlparse(source_url)
    path = (parsed_candidate.path or "").lower()
    return (
        (20 if parsed_candidate.hostname == parsed_source.hostname else 0)
        + (30 if re.search(r"(blog|news|article|post|research|release|updates|announc)", path) else 0)
        + (20 if re.search(r"202[0-9]", path) else 0)
        + (10 if len([chunk for chunk in path.split("/") if chunk]) >= 2 else 0)
        + (5 if not parsed_candidate.query else 0)
        + (5 if len(path) > 10 else 0)
    )


def _discover_best_article_url(source: RecapSource) -> str:
    safe_source_url = _validate_public_https_url(source.url)
    try:
        page = _scrapling_fetch(safe_source_url)
    except Exception:
        return safe_source_url
    candidates = [url for url in _extract_links_from_page(page, safe_source_url) if _is_likely_article_url(url, safe_source_url)]
    if not candidates:
        return safe_source_url
    return sorted(candidates, key=lambda item: _score_article_url(item, safe_source_url), reverse=True)[0]


def _extract_main_content_from_scrapling_page(source: RecapSource, target_url: str, page: Any) -> dict[str, Any]:
    title = source.name
    for selector in ("meta[property='og:title']::attr(content)", "h1::text", "title::text"):
        try:
            values = page.css(selector)
            if values:
                title = _compact_text(str(values[0]))[:180] or title
                break
        except Exception:
            continue

    best_text = ""
    for selector in ARTICLE_SELECTORS:
        try:
            nodes = page.css(selector)
        except Exception:
            nodes = []
        for node in nodes or []:
            text = _selector_text(node)
            if len(text) > len(best_text):
                best_text = text

    if not best_text:
        get_all_text = getattr(page, "get_all_text", None)
        if callable(get_all_text):
            try:
                best_text = _compact_text(str(get_all_text(strip=True)))
            except TypeError:
                best_text = _compact_text(str(get_all_text()))
    if not best_text:
        best_text = _strip_html(_response_html(page))

    return {
        "source_url": target_url,
        "title": title,
        "text": best_text,
        "snippet": _extract_snippet(best_text),
    }


def _scrape_with_scrapling(source: RecapSource, target_url: str, config: NativeRecapConfig) -> dict[str, Any]:
    started = time.monotonic()
    try:
        safe_target_url = _validate_public_https_url(target_url)
    except Exception as exc:
        return {
            "source_url": target_url,
            "title": source.name,
            "text": "",
            "snippet": "",
            "status": 400,
            "scrape_ok": False,
            "scrape_method": "scrapling",
            "duration_ms": int((time.monotonic() - started) * 1000),
            "quality": {"word_count": 0, "data_points": 0, "score": 0},
            "error": _safe_error(exc),
        }
    last_error: Exception | None = None
    for stealth in (False, True):
        try:
            page = _scrapling_fetch(safe_target_url, stealth=stealth)
            extracted = _extract_main_content_from_scrapling_page(source, safe_target_url, page)
            quality = _score_content(extracted["text"])
            status = _response_status(page)
            scrape_ok = status < 400 and quality["word_count"] >= config.scrape_min_words and quality["score"] >= config.scrape_min_words
            result = {
                **extracted,
                "status": status,
                "scrape_ok": scrape_ok,
                "scrape_method": "scrapling",
                "duration_ms": int((time.monotonic() - started) * 1000),
                "quality": quality,
            }
            if scrape_ok or stealth:
                return result
        except Exception as exc:
            last_error = exc
            continue
    return {
        "source_url": safe_target_url,
        "title": source.name,
        "text": "",
        "snippet": "",
        "status": 500,
        "scrape_ok": False,
        "scrape_method": "scrapling",
        "duration_ms": int((time.monotonic() - started) * 1000),
        "quality": {"word_count": 0, "data_points": 0, "score": 0},
        "error": _safe_error(last_error or "Scrapling extraction failed"),
    }


def _scrape_with_firecrawl(source: RecapSource, target_url: str, config: NativeRecapConfig) -> dict[str, Any]:
    try:
        safe_target_url = _validate_public_https_url(target_url)
    except Exception as exc:
        return {
            "source_url": target_url,
            "title": source.name,
            "text": "",
            "snippet": "",
            "status": 400,
            "scrape_ok": False,
            "scrape_method": "firecrawl",
            "quality": {"word_count": 0, "data_points": 0, "score": 0},
            "error": _safe_error(exc),
        }

    if not config.firecrawl_api_key:
        return {
            "source_url": safe_target_url,
            "title": source.name,
            "text": "",
            "snippet": "",
            "status": 503,
            "scrape_ok": False,
            "scrape_method": "firecrawl",
            "quality": {"word_count": 0, "data_points": 0, "score": 0},
            "error": "Missing FIRECRAWL_API_KEY",
        }
    try:
        with httpx.Client(timeout=FIRECRAWL_TIMEOUT_SECONDS) as client:
            response = client.post(
                FIRECRAWL_SCRAPE_URL,
                headers={"Authorization": f"Bearer {config.firecrawl_api_key}", "Content-Type": "application/json"},
                json={"url": safe_target_url, "formats": ["markdown"]},
            )
        body = response.json() if response.text else {}
        markdown = str((body.get("data") or {}).get("markdown") or "") if isinstance(body, dict) else ""
    except Exception as exc:
        return {
            "source_url": safe_target_url,
            "title": source.name,
            "text": "",
            "snippet": "",
            "status": 500,
            "scrape_ok": False,
            "scrape_method": "firecrawl",
            "quality": {"word_count": 0, "data_points": 0, "score": 0},
            "error": _safe_error(exc),
        }
    text = _compact_text(markdown)
    quality = _score_content(text)
    return {
        "source_url": safe_target_url,
        "title": (markdown.strip().splitlines()[0] if markdown.strip() else source.name).replace("#", "").strip()[:180],
        "text": text,
        "snippet": _extract_snippet(text),
        "status": response.status_code,
        "scrape_ok": response.status_code < 400 and quality["word_count"] >= config.scrape_min_words,
        "scrape_method": "firecrawl",
        "quality": quality,
    }


def _xml_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _xml_text(node: ElementTree.Element | None) -> str:
    if node is None:
        return ""
    return _compact_text(" ".join(chunk for chunk in node.itertext() if chunk))


def _first_entry_child(entry: ElementTree.Element, *names: str) -> ElementTree.Element | None:
    wanted = set(names)
    for child in list(entry):
        if _xml_local_name(child.tag) in wanted:
            return child
    return None


def _extract_rss_entry_link(entry: ElementTree.Element) -> str:
    text_link = _xml_text(_first_entry_child(entry, "link"))
    if text_link:
        return text_link

    fallback_href = ""
    for child in list(entry):
        if _xml_local_name(child.tag) != "link":
            continue
        href = (child.attrib.get("href") or "").strip()
        if not href:
            continue
        rel = (child.attrib.get("rel") or "alternate").strip().lower()
        if rel in {"", "alternate"}:
            return href
        if not fallback_href:
            fallback_href = href
    return fallback_href


def _parse_rss_entries(xml_text: str, max_entries: int = RSS_MAX_ENTRIES) -> list[dict[str, str]]:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError:
        return []
    candidates = root.findall(".//item") + root.findall(".//{*}entry")
    if not candidates:
        return []

    entries: list[dict[str, str]] = []
    for entry in candidates[:max(1, max_entries)]:
        title = _xml_text(_first_entry_child(entry, "title"))
        link = _extract_rss_entry_link(entry)
        description_node = _first_entry_child(entry, "description")
        if description_node is None:
            description_node = _first_entry_child(entry, "summary")
        if description_node is None:
            description_node = _first_entry_child(entry, "content")
        if description_node is None:
            description_node = _first_entry_child(entry, "encoded")
        description = _strip_html(_xml_text(description_node))
        if link:
            entries.append({"title": title, "link": link, "description": description})
    return entries


def _scrape_via_rss(source: RecapSource, config: NativeRecapConfig, seen_source_urls: set[str] | None = None) -> dict[str, Any]:
    if not source.feed_url:
        return {"source_url": source.url, "title": source.name, "text": "", "snippet": "", "status": 400, "scrape_ok": False, "scrape_method": "rss", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": "RSS route missing feed_url"}
    try:
        feed_url = _validate_public_https_url(source.feed_url)
        status, xml_text = _fetch_url_text(feed_url, RSS_TIMEOUT_SECONDS)
    except Exception as exc:
        return {"source_url": source.url, "title": source.name, "text": "", "snippet": "", "status": 500, "scrape_ok": False, "scrape_method": "rss", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": _safe_error(exc)}
    if status >= 400 or not xml_text:
        return {"source_url": source.url, "title": source.name, "text": "", "snippet": "", "status": status, "scrape_ok": False, "scrape_method": "rss", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": f"RSS HTTP status {status}"}
    entries = _parse_rss_entries(xml_text)
    if not entries:
        return {"source_url": source.url, "title": source.name, "text": "", "snippet": "", "status": status, "scrape_ok": False, "scrape_method": "rss", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": "RSS entry parse failed"}

    last_result: dict[str, Any] | None = None
    for entry in entries:
        try:
            target_url = _validate_public_https_url(urljoin(feed_url, entry["link"]))
        except Exception as exc:
            last_result = {"source_url": source.url, "title": entry.get("title") or source.name, "text": "", "snippet": "", "status": 400, "scrape_ok": False, "scrape_method": "rss", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": _safe_error(exc)}
            continue

        if _is_seen_source_url(target_url, seen_source_urls):
            print(f"[Dedupe] Skipping already published article: {target_url}")
            last_result = _duplicate_scrape_result(source, target_url, entry.get("title") or source.name)
            continue

        scrapling = _scrape_with_scrapling(source, target_url, config)
        if scrapling["scrape_ok"]:
            scrapling["scrape_method"] = "rss+scrapling"
            return scrapling
        last_result = scrapling

        if source.rss_allow_firecrawl_fallback:
            fallback = _scrape_with_firecrawl(source, target_url, config)
            fallback["scrape_method"] = "rss+firecrawl"
            if fallback["scrape_ok"]:
                return fallback
            last_result = fallback

        rss_text = entry["description"] or entry["title"]
        quality = _score_content(rss_text)
        rss_result = {
            "source_url": target_url,
            "title": (entry["title"] or source.name)[:180],
            "text": rss_text,
            "snippet": _extract_snippet(rss_text),
            "status": status,
            "scrape_ok": quality["word_count"] >= config.scrape_min_words,
            "scrape_method": "rss",
            "quality": quality,
        }
        if rss_result["scrape_ok"]:
            return rss_result
        last_result = rss_result

    return last_result or {"source_url": source.url, "title": source.name, "text": "", "snippet": "", "status": status, "scrape_ok": False, "scrape_method": "rss", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": "RSS entries exhausted"}


def _scrape_source(source: RecapSource, config: NativeRecapConfig, seen_source_urls: set[str] | None = None) -> dict[str, Any]:
    if source.scrape_route == "rss":
        result = _scrape_via_rss(source, config, seen_source_urls)
        if result.get("scrape_ok") or not source.rss_allow_firecrawl_fallback:
            return result
        return result
    target_url = _discover_best_article_url(source)
    if _is_seen_source_url(target_url, seen_source_urls):
        print(f"[Dedupe] Skipping already published article: {target_url}")
        return _duplicate_scrape_result(source, target_url)
    scrapling = _scrape_with_scrapling(source, target_url, config)
    if scrapling["scrape_ok"]:
        return scrapling
    fallback = _scrape_with_firecrawl(source, target_url, config)
    if fallback["scrape_ok"]:
        fallback["scrape_method"] = "scrapling+firecrawl"
    return fallback


def _pick_stories(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = [doc for doc in docs if doc.get("scrape_ok")]
    ranked.sort(key=lambda row: (int(row.get("priority", 0)), int((row.get("quality") or {}).get("score", 0))), reverse=True)
    return [
        {
            "source_id": row.get("source_id"),
            "source_url": row.get("source_url"),
            "source_name": row.get("source_name"),
            "title": row.get("title"),
            "snippet": row.get("snippet"),
            "priority": row.get("priority", 0),
            "text": row.get("text", ""),
            "quality": row.get("quality", {}),
            "scrape_method": row.get("scrape_method"),
        }
        for row in ranked
    ]


def _build_evidence_pack(stories: list[dict[str, Any]], config: NativeRecapConfig) -> dict[str, Any]:
    selected: list[dict[str, Any]] = []
    total_chars = 0
    truncated_count = 0
    for story in stories:
        text = _compact_text(str(story.get("text") or ""))
        snippet = text[: config.evidence_snippet_max_chars]
        if len(text) > len(snippet):
            truncated_count += 1
        claims = _extract_claims(snippet, config.evidence_claims_max_per_story)
        projected = total_chars + len(snippet) + len(" ".join(claims)) + len(str(story.get("title") or ""))
        if selected and projected > config.evidence_pack_max_chars:
            break
        selected.append({**story, "snippet": snippet, "claims": claims})
        total_chars = projected
    return {"stories": selected, "source_urls": [story.get("source_url") for story in selected if story.get("source_url")], "total_chars": total_chars, "truncated_stories": truncated_count, "token_estimate": max(1, total_chars // 4)}


def _gemini_json(config: NativeRecapConfig, system: str, user: str, *, max_output_tokens: int = 4096) -> dict[str, Any]:
    if not config.google_api_key:
        raise RuntimeError("Missing GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY")
    
    url = GEMINI_ENDPOINT.format(model=config.summary_model)
    last_error: Exception | None = None
    
    for attempt in range(1, 3):  # Max 2 attempts
        try:
            with httpx.Client(timeout=300.0) as client:
                response = client.post(
                    url,
                    params={"key": config.google_api_key},
                    json={
                        "contents": [{"role": "user", "parts": [{"text": system + "\n\n" + user}]}],
                        "generationConfig": {
                            "temperature": 0.0,
                            "maxOutputTokens": max_output_tokens,
                        },
                        "safetySettings": [
                            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
                        ]
                    },
                )
            
            if response.status_code >= 400:
                print(f"DEBUG: Gemini API Error Body: {response.text}")
                raise RuntimeError(f"Gemini API error {response.status_code}: {response.text[:500]}")
            
            payload = response.json()
            if not payload.get("candidates"):
                print(f"DEBUG: Gemini Payload (No Candidates): {json.dumps(payload)}")
                if payload.get("promptFeedback"):
                    print(f"DEBUG: Gemini Prompt Feedback: {json.dumps(payload['promptFeedback'])}")
            
            text = "\n".join(
                part.get("text", "")
                for candidate in payload.get("candidates", [])
                for part in ((candidate.get("content") or {}).get("parts") or [])
                if isinstance(part, dict)
            ).strip()
            
            if not text:
                raise RuntimeError("Empty Gemini response")
            
            try:
                return _parse_json_text(text, "Gemini")
            except Exception as exc:
                print(f"DEBUG: Gemini raw text causing error (attempt {attempt}):\n{text[:1000]}...")
                if attempt < 2:
                    print("Retrying Gemini with temperature 0.1 to get a different result...")
                    continue
                raise exc
        except Exception as exc:
            last_error = exc
            if attempt >= 2:
                break
            time.sleep(1)
            
    raise last_error or RuntimeError("Gemini generation failed")


def _anthropic_models(config: NativeRecapConfig) -> list[str]:
    models = [config.article_model]
    if config.allow_paid_fallback and config.article_fallback_model and config.article_fallback_model not in models:
        models.append(config.article_fallback_model)
    return models


def _get_generation_artifact(
    repo: RecapRepository | None,
    *,
    edition_key: str,
    stage: str,
    input_hash: str,
) -> dict[str, Any] | None:
    if repo is None or not hasattr(repo, "get_generation_artifact"):
        return None
    try:
        artifact = repo.get_generation_artifact(edition_key, stage, input_hash)
    except Exception as exc:
        print(f"WARNING: generation artifact lookup failed for {stage}: {_safe_error(exc)}")
        return None
    if isinstance(artifact, dict) and artifact.get("status") == "succeeded" and isinstance(artifact.get("output_json"), dict):
        return artifact
    return None


def _upsert_generation_artifact(
    repo: RecapRepository | None,
    *,
    edition_key: str,
    run_id: str | None,
    stage: str,
    input_hash: str,
    provider: str,
    model: str,
    status: str,
    output_json: dict[str, Any] | None = None,
    error_message: str | None = None,
    usage_json: dict[str, Any] | None = None,
) -> None:
    if repo is None or not hasattr(repo, "upsert_generation_artifact"):
        return
    try:
        repo.upsert_generation_artifact(
            {
                "edition_key": edition_key.strip().upper(),
                "run_id": run_id,
                "stage": stage,
                "input_hash": input_hash,
                "provider": provider,
                "model": model,
                "status": status,
                "output_json": output_json,
                "error_message": error_message,
                "usage_json": usage_json or {},
            }
        )
    except Exception as exc:
        print(f"WARNING: generation artifact write failed for {stage}: {_safe_error(exc)}")


def _anthropic_json(
    config: NativeRecapConfig,
    system: str,
    user: str,
    *,
    output_schema: dict[str, Any],
    stage: str,
    edition_key: str | None = None,
    run_id: str | None = None,
    repo: RecapRepository | None = None,
    tracker: RecapAiRunTracker | None = None,
    input_payload: dict[str, Any] | None = None,
    max_output_tokens: int = 4000,
) -> dict[str, Any]:
    if not config.anthropic_api_key:
        raise RuntimeError("Missing ANTHROPIC_API_KEY")
    models = _anthropic_models(config)
    artifact_hash: str | None = None
    normalized_edition_key = edition_key.strip().upper() if isinstance(edition_key, str) and edition_key.strip() else None
    if normalized_edition_key:
        artifact_hash = _stable_input_hash(
            {
                "provider": "anthropic",
                "stage": stage,
                "models": models,
                "max_output_tokens": max_output_tokens,
                "system": system,
                "user": user,
                "input_payload": input_payload,
                "output_schema": output_schema,
            }
        )
        artifact = _get_generation_artifact(repo, edition_key=normalized_edition_key, stage=stage, input_hash=artifact_hash)
        if artifact:
            if tracker:
                tracker.record_artifact_reused(stage, artifact)
            return artifact["output_json"]

    last_error: Exception | None = None
    for model in models:
        try:
            if tracker:
                tracker.reserve_anthropic_call(stage, model)
            with httpx.Client(timeout=300.0) as client:
                response = client.post(
                    ANTHROPIC_ENDPOINT,
                    headers={
                        "x-api-key": config.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": max_output_tokens,
                        "temperature": 0.2,
                        "system": system,
                        "messages": [{"role": "user", "content": user}],
                        "output_config": {"format": {"type": "json_schema", "schema": output_schema}},
                    },
                )
            if response.status_code >= 400:
                raise RecapAiGenerationError(
                    "anthropic_api_error",
                    f"Anthropic API error {response.status_code}: {response.text[:500]}",
                    stage=stage,
                    model=model,
                )
            try:
                payload = response.json()
            except Exception as exc:
                raise RecapAiGenerationError(
                    "anthropic_response_invalid",
                    "Anthropic returned a non-JSON API response",
                    stage=stage,
                    model=model,
                ) from exc
            stop_reason = _trim_or_none(payload.get("stop_reason"))
            usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
            if tracker:
                tracker.record_usage(stage, model, stop_reason, usage)
            if stop_reason == "max_tokens":
                raise RecapAiGenerationError(
                    "anthropic_max_tokens",
                    "Anthropic stopped at max_tokens before producing a complete structured output",
                    stage=stage,
                    model=model,
                    stop_reason=stop_reason,
                    usage=usage,
                )
            if stop_reason == "refusal":
                raise RecapAiGenerationError(
                    "anthropic_refusal",
                    "Anthropic refused the structured output request",
                    stage=stage,
                    model=model,
                    stop_reason=stop_reason,
                    usage=usage,
                )
            text = "\n".join(entry.get("text", "") for entry in payload.get("content", []) if isinstance(entry, dict)).strip()
            if not text:
                raise RecapAiGenerationError(
                    "anthropic_empty_response",
                    "Empty Anthropic response",
                    stage=stage,
                    model=model,
                    stop_reason=stop_reason,
                    usage=usage,
                )
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise RecapAiGenerationError(
                    "anthropic_invalid_json",
                    f"Anthropic returned malformed structured JSON: {exc}",
                    stage=stage,
                    model=model,
                    stop_reason=stop_reason,
                    usage=usage,
                ) from exc
            if not isinstance(parsed, dict):
                raise RecapAiGenerationError(
                    "anthropic_invalid_json",
                    "Anthropic structured output was not a JSON object",
                    stage=stage,
                    model=model,
                    stop_reason=stop_reason,
                    usage=usage,
                )
            if normalized_edition_key and artifact_hash:
                _upsert_generation_artifact(
                    repo,
                    edition_key=normalized_edition_key,
                    run_id=run_id,
                    stage=stage,
                    input_hash=artifact_hash,
                    provider="anthropic",
                    model=model,
                    status="succeeded",
                    output_json=parsed,
                    usage_json=usage,
                )
            return parsed
        except Exception as exc:
            last_error = exc
            if tracker:
                if isinstance(exc, RecapAiGenerationError):
                    tracker.record_failure(exc.reason, exc.stage)
                else:
                    tracker.record_failure("anthropic_generation_failed", stage)
            if normalized_edition_key and artifact_hash:
                _upsert_generation_artifact(
                    repo,
                    edition_key=normalized_edition_key,
                    run_id=run_id,
                    stage=stage,
                    input_hash=artifact_hash,
                    provider="anthropic",
                    model=model,
                    status="failed",
                    error_message=_safe_error(exc),
                    usage_json=getattr(exc, "usage", None) if isinstance(getattr(exc, "usage", None), dict) else {},
                )
            if config.ai_fail_fast:
                break
    raise last_error or RuntimeError("Anthropic generation failed")


def _generate_brief(stories: list[dict[str, Any]], evidence_pack: dict[str, Any], edition_key: str, config: NativeRecapConfig) -> dict[str, Any]:
    allowed_urls = [str(story["source_url"]) for story in stories if story.get("source_url")]
    system = "You are a precise AI news editor. Return JSON only. Use only source URLs from the allowed set."
    user = json.dumps({"editionKey": edition_key, "allowedUrls": allowed_urls, "stories": stories, "schema": {"tags": ["AI & LLM"], "fr": {"title": "", "introduction": "", "bigNews": {"name": "", "impact": "", "source_url": ""}, "quickHits": [], "lookingAhead": ""}, "en": {"title": "", "introduction": "", "bigNews": {"name": "", "impact": "", "source_url": ""}, "quickHits": [], "lookingAhead": ""}}}, ensure_ascii=False)
    draft = _gemini_json(config, system, user, max_output_tokens=8192)
    # Support wrapped responses (sometimes Gemini puts the result inside a 'schema' or 'result' key)
    if not isinstance(draft.get("fr"), dict) and isinstance(draft.get("schema"), dict):
        draft = draft["schema"]
    elif not isinstance(draft.get("fr"), dict) and isinstance(draft.get("result"), dict):
        draft = draft["result"]

    for locale in ("fr", "en"):
        if not isinstance(draft.get(locale), dict):
            print(f"DEBUG: Gemini Brief Keys: {list(draft.keys())}")
            raise RuntimeError("Brief missing bilingual locale payload")
        big_news = draft[locale].get("bigNews") or {}
        if big_news.get("source_url") not in allowed_urls:
            big_news["source_url"] = allowed_urls[0]
        draft[locale]["bigNews"] = big_news
    tags = draft.get("tags")
    draft["tags"] = [item for item in tags if isinstance(item, str)][:3] if isinstance(tags, list) else ["AI & LLM"]
    return draft


def _generate_article(
    stories: list[dict[str, Any]],
    brief: dict[str, Any],
    evidence_pack: dict[str, Any],
    edition_key: str,
    config: NativeRecapConfig,
    *,
    repo: RecapRepository | None = None,
    run_id: str | None = None,
    tracker: RecapAiRunTracker | None = None,
) -> dict[str, Any]:
    system = "You are the lead editor of a premium bilingual AI news publication. Return only the requested structured output."
    request_payload = {
        "editionKey": edition_key,
        "brief": brief,
        "stories": stories,
        "evidence": evidence_pack.get("stories", []),
        "rules": [
            "Write original journalism.",
            "Do not invent facts.",
            "French and English must both be complete.",
            "Use markdown for article_markdown.",
            "Add proximity attribution in the relevant paragraph for dates, numbers, benchmarks, product announcements, quotes, and specific claims, using markdown links such as Selon [OpenAI](https://example.com)...",
            "Do not copy full sentences, closely translate paragraphs, reproduce third-party tables, or describe unlicensed images/logos as reused assets.",
            "Use sources only for facts, dates, figures, declarations, events, and general ideas; change the structure, angle, examples, and transitions.",
            "Do not include a Sources, References, source-credit, or URL list section in article_markdown; sources are rendered separately.",
        ],
    }
    user = json.dumps(request_payload, ensure_ascii=False)
    article = _anthropic_json(
        config,
        system,
        user,
        output_schema=ARTICLE_OUTPUT_SCHEMA,
        stage="article",
        edition_key=edition_key,
        run_id=run_id,
        repo=repo,
        tracker=tracker,
        input_payload=request_payload,
        max_output_tokens=config.article_max_tokens,
    )
    for locale in ("fr", "en"):
        row = article.get(locale)
        if not isinstance(row, dict) or not row.get("article_markdown"):
            raise RuntimeError(f"Article generation missing {locale} markdown")
    return article


def _fact_check(
    article: dict[str, Any],
    evidence_pack: dict[str, Any],
    config: NativeRecapConfig,
    *,
    edition_key: str | None = None,
    run_id: str | None = None,
    repo: RecapRepository | None = None,
    tracker: RecapAiRunTracker | None = None,
) -> dict[str, Any]:
    system = "You are a strict fact checker. Return only the requested structured output."
    request_payload = {
        "evidence": evidence_pack.get("stories", []),
        "fr": article["fr"].get("article_markdown"),
        "en": article["en"].get("article_markdown"),
    }
    user = json.dumps(request_payload, ensure_ascii=False)
    print(f"DEBUG: Fact check input size: {len(user)} chars")
    result = _anthropic_json(
        config,
        system,
        user,
        output_schema=FACT_CHECK_OUTPUT_SCHEMA,
        stage="fact_check",
        edition_key=edition_key,
        run_id=run_id,
        repo=repo,
        tracker=tracker,
        input_payload=request_payload,
        max_output_tokens=2000,
    )
    issues = result.get("issues") if isinstance(result.get("issues"), list) else []
    major_count = len([issue for issue in issues if isinstance(issue, dict) and issue.get("severity") == "major"])
    return {"status": "fail" if major_count else "warn" if issues else "pass", "issues": issues}


COPYRIGHT_RISK_RANK = {"low": 0, "medium": 1, "high": 2}


def _normalize_copyright_risk(value: Any) -> str:
    risk = str(value or "").strip().lower()
    return risk if risk in COPYRIGHT_RISK_RANK else "low"


def _normalize_copyright_issue(issue: Any) -> dict[str, Any] | None:
    if not isinstance(issue, dict):
        return None
    rule_ids = issue.get("rule_ids")
    if not isinstance(rule_ids, list):
        rule_ids = []
    locale = str(issue.get("locale") or "unknown").strip().lower()
    if locale not in {"fr", "en", "both", "unknown"}:
        locale = "unknown"
    return {
        "risk": _normalize_copyright_risk(issue.get("risk")),
        "rule_ids": [str(item).strip()[:24] for item in rule_ids if str(item).strip()][:12],
        "locale": locale,
        "passage": _extract_snippet(str(issue.get("passage") or ""), 500),
        "source_url": str(issue.get("source_url") or "").strip()[:2000],
        "reason": _extract_snippet(str(issue.get("reason") or ""), 800),
        "suggestion": _extract_snippet(str(issue.get("suggestion") or ""), 800),
        "requires_external_verification": bool(issue.get("requires_external_verification")),
    }


def _normalize_copyright_compliance_report(report: dict[str, Any]) -> dict[str, Any]:
    raw_issues = report.get("issues") if isinstance(report.get("issues"), list) else []
    issues = [normalized for issue in raw_issues if (normalized := _normalize_copyright_issue(issue))]
    issue_max_risk = max((COPYRIGHT_RISK_RANK[item["risk"]] for item in issues), default=0)
    reported_risk = COPYRIGHT_RISK_RANK[_normalize_copyright_risk(report.get("max_risk"))]
    max_risk_rank = max(issue_max_risk, reported_risk)
    max_risk = next(risk for risk, rank in COPYRIGHT_RISK_RANK.items() if rank == max_risk_rank)
    status = "fail" if max_risk_rank >= COPYRIGHT_RISK_RANK["medium"] else "warn" if issues else "pass"
    return {"status": status, "max_risk": max_risk, "issues": issues}


def _copyright_compliance_should_block(report: dict[str, Any]) -> bool:
    return COPYRIGHT_RISK_RANK.get(str(report.get("max_risk") or "low"), 0) >= COPYRIGHT_RISK_RANK["medium"]


def _copyright_compliance_check(
    article: dict[str, Any],
    evidence_pack: dict[str, Any],
    config: NativeRecapConfig,
    *,
    edition_key: str | None = None,
    run_id: str | None = None,
    repo: RecapRepository | None = None,
    tracker: RecapAiRunTracker | None = None,
) -> dict[str, Any]:
    system = (
        "You are an editorial copyright, anti-plagiarism, and journalistic quality compliance reviewer. "
        "Return only the requested structured output. Do not call uncertain passages plagiarism; mark them as requiring external verification."
    )
    request_payload = {
        "rules": [
            "Flag copied full sentences unless they are short attributed quotes.",
            "Flag close translations or paragraph-level paraphrases of source text.",
            "Flag facts, dates, figures, product announcements, benchmarks, quotes, or specific claims without proximity attribution in the same paragraph.",
            "Flag long quotes, reproduced source tables, charts, screenshots, logos, or illustrations without clear permission.",
            "Use low for public facts correctly cited, medium for close paraphrase or weak attribution, high for copying, close translation, long excerpt, unauthorized media, or missing source.",
        ],
        "risk_policy": "Publication must fail when max_risk is medium or high.",
        "evidence": evidence_pack.get("stories", []),
        "fr": article["fr"].get("article_markdown"),
        "en": article["en"].get("article_markdown"),
    }
    user = json.dumps(request_payload, ensure_ascii=False)
    print(f"DEBUG: Copyright compliance input size: {len(user)} chars")
    result = _anthropic_json(
        config,
        system,
        user,
        output_schema=COPYRIGHT_COMPLIANCE_OUTPUT_SCHEMA,
        stage="copyright_compliance",
        edition_key=edition_key,
        run_id=run_id,
        repo=repo,
        tracker=tracker,
        input_payload=request_payload,
        max_output_tokens=2400,
    )
    return _normalize_copyright_compliance_report(result)


def _generate_summary30(
    article: dict[str, Any],
    stories: list[dict[str, Any]],
    config: NativeRecapConfig,
    *,
    edition_key: str | None = None,
    run_id: str | None = None,
    repo: RecapRepository | None = None,
    tracker: RecapAiRunTracker | None = None,
) -> dict[str, Any]:
    allowed_urls = [str(story["source_url"]) for story in stories if story.get("source_url")]
    system = "You are a world-class newsletter editor. Create high-impact, punchy summaries. Return only the requested structured output."
    request_payload = {
        "allowedUrls": allowed_urls,
        "articleIntro": {"fr": article["fr"].get("introduction"), "en": article["en"].get("introduction")},
    }
    user = json.dumps(request_payload, ensure_ascii=False)
    print(f"DEBUG: Summary30 input size: {len(user)} chars")
    summary = _anthropic_json(
        config,
        system,
        user,
        output_schema=SUMMARY30_OUTPUT_SCHEMA,
        stage="summary30",
        edition_key=edition_key,
        run_id=run_id,
        repo=repo,
        tracker=tracker,
        input_payload=request_payload,
        max_output_tokens=1500,
    )
    for locale in ("fr", "en"):
        row = summary.get(locale)
        if not isinstance(row, dict):
            row = {}
        row["one_sentence_summary"] = str(row.get("one_sentence_summary") or "").strip()
        bullets = row.get("bullets") if isinstance(row.get("bullets"), list) else []
        row["bullets"] = [str(item).strip() for item in bullets if str(item).strip()][:3] or [_extract_snippet(article[locale].get("introduction", ""), 220)]
        if row.get("primary_source_url") not in allowed_urls:
            row["primary_source_url"] = allowed_urls[0] if allowed_urls else ""
        row["source_urls"] = [url for url in row.get("source_urls", []) if url in allowed_urls] if isinstance(row.get("source_urls"), list) else allowed_urls[:2]
        summary[locale] = row
    summary["generated_at"] = datetime.now(timezone.utc).isoformat()
    summary["generated_by"] = config.article_model
    return summary


def _build_excerpt(introduction: str, markdown: str, fallback: str) -> str:
    base = _compact_text(introduction) or _compact_text(re.sub(r"[#*_>`\[\]()-]", " ", markdown)) or fallback
    return _extract_snippet(base, 220)


def _render_newsletter_html(config: NativeRecapConfig, edition_key: str, fr: dict[str, Any], en: dict[str, Any]) -> str:
    fr_url = f"{config.app_base_url}/fr/news/{fr['slug']}"
    en_url = f"{config.app_base_url}/en/news/{en['slug']}"
    
    fr_content = fr.get("content_json") or {}
    en_content = en.get("content_json") or {}
    fr_sum = fr_content.get("summary30s", {}).get("fr", {})
    en_sum = en_content.get("summary30s", {}).get("en", {})
    
    fr_bullets_html = "".join([f"<p style='margin:0 0 12px;font-size:16px;line-height:1.5;'>{b}</p>" for b in fr_sum.get("bullets", [])])
    en_bullets_html = "".join([f"<p style='margin:0 0 12px;font-size:16px;line-height:1.5;'>{b}</p>" for b in en_sum.get("bullets", [])])

    return f"""
<table border="0" style="background-color:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif;padding:40px 0;width:100%;" cellpadding="0" cellspacing="0">
  <tbody>
    <tr>
      <td align="center">
        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background-color:#FFFFFF;margin:0 auto;border-radius:0;border:3px solid #1A1A1A;box-shadow:6px 6px 0 #1A1A1A;overflow:hidden;">
          <tbody>
            <tr>
              <td>
                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#1A1A1A;padding:24px 48px;text-align:center;">
                  <tbody>
                    <tr>
                      <td>
                        <img src="https://kode01.com/logo_v2.png" alt="KODE01" width="140" style="display:block;margin:0 auto;height:auto;border:0;outline:none;text-decoration:none;">
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 48px 32px;">
                  <tbody>
                    <tr>
                      <td>
                        <!-- ENGLISH SECTION -->
                        <div style="margin-bottom:40px;">
                          <h1 style="color:#1A1A1A;font-size:24px;font-weight:900;line-height:1.3;text-align:left;margin:0 0 12px;letter-spacing:-0.5px;">{en['title']}</h1>
                          <p style="font-size:16px;line-height:24px;color:#555555;text-align:left;margin:0 0 20px;">{en['excerpt']}</p>
                          
                          <div style="background-color:#F9F9F9;border-left:4px solid #1A1A1A;padding:16px;margin:20px 0;">
                            <h2 style="font-size:16px;font-weight:800;margin:0 0 12px;color:#1A1A1A;text-transform:uppercase;letter-spacing:1px;">30-second Recap</h2>
                            <p style="font-size:16px;line-height:24px;color:#1A1A1A;margin:0 0 16px;font-weight:600;">{en_sum.get('one_sentence_summary') or en['intro']}</p>
                            <div style="color:#333333;">
                              {en_bullets_html}
                            </div>
                            <a href="{en_url}" style="color:#1A1A1A;text-decoration:underline;font-weight:800;font-size:14px;display:inline-block;margin-top:12px;">Read full article (EN) &rarr;</a>
                          </div>
                        </div>

                        <div style="height:1px;background-color:#1A1A1A;margin:40px 0;opacity:0.1;"></div>

                        <!-- FRENCH SECTION -->

                        <div style="margin-bottom:32px;">
                          <h1 style="color:#1A1A1A;font-size:24px;font-weight:900;line-height:1.3;text-align:left;margin:0 0 12px;letter-spacing:-0.5px;">{fr['title']}</h1>
                          <p style="font-size:16px;line-height:24px;color:#555555;text-align:left;margin:0 0 20px;">{fr['excerpt']}</p>
                          
                          <div style="background-color:#F9F9F9;border-left:4px solid #F291C8;padding:16px;margin:20px 0;">
                            <h2 style="font-size:16px;font-weight:800;margin:0 0 12px;color:#1A1A1A;text-transform:uppercase;letter-spacing:1px;">Ce qu'il faut retenir</h2>
                            <p style="font-size:16px;line-height:24px;color:#1A1A1A;margin:0 0 16px;font-weight:600;">{fr_sum.get('one_sentence_summary') or fr['intro']}</p>
                            <div style="color:#333333;">
                              {fr_bullets_html}
                            </div>
                            <a href="{fr_url}" style="color:#1A1A1A;text-decoration:underline;font-weight:800;font-size:14px;display:inline-block;margin-top:12px;">Lire l'article complet (FR) &rarr;</a>
                          </div>
                        </div>

                        
                          
                            
                              

                              
                            
                          

                        
                        <p style="font-size:12px;line-height:18px;color:#888888;text-align:center;margin:40px 0 0;">
                          Édition : {edition_key}<br><br>
                          <a href="{{{{unsubscribe_url}}}}" style="color:#666666;text-decoration:underline;">Unsubscribe / Se desinscrire</a>
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  </tbody>
</table>
""".strip()


def _sendfox_request(config: NativeRecapConfig, path: str, payload: dict[str, Any], method: str = "POST") -> dict[str, Any]:
    if not config.sendfox_api_token:
        raise RuntimeError("Missing SENDFOX_API_TOKEN")
    with httpx.Client(timeout=40.0) as client:
        response = client.request(method, f"{config.sendfox_base_url}{path}", headers={"Authorization": f"Bearer {config.sendfox_api_token}", "Content-Type": "application/json"}, json=payload if method == "POST" else None)
    if response.status_code >= 400:
        raise RuntimeError(f"SendFox API error {response.status_code}: {response.text[:500]}")
    try:
        return response.json()
    except Exception:
        return {}


def _send_newsletter_for_edition(repo: RecapRepository, config: NativeRecapConfig, edition_id: str, edition_key: str, *, test_email: str | None = None, test_mode: bool = False) -> dict[str, Any]:
    posts = repo.get_posts_for_edition(edition_id)
    fr = posts.get("fr")
    en = posts.get("en")
    if not fr or not en:
        raise RuntimeError("Newsletter blocked because FR/EN article is not ready")
    list_id = config.sendfox_test_list_id if test_mode else config.sendfox_list_id
    if not list_id:
        raise RuntimeError("Missing SendFox list id")
    if not test_mode and repo.get_sent_dispatch(edition_id):
        return {"success": True, "skipped": True, "reason": "newsletter_already_sent"}

    html = _render_newsletter_html(config, edition_key, fr, en)
    payload = {
        "title": f"KODE01 AI recap {edition_key}",
        "subject": ("[TEST] " if test_mode else "") + f"AI Weekly Recap / Le Recap IA - {edition_key}",
        "subject_line": ("[TEST] " if test_mode else "") + f"AI Weekly Recap / Le Recap IA - {edition_key}",
        "from_name": config.sendfox_from_name,
        "from_email": config.sendfox_from_email,
        "html": html,
        "body": html,
        "list_id": int(list_id),
        "list_ids": [int(list_id)],
        "lists": [int(list_id)],
    }
    if test_email:
        payload["emails"] = [test_email]
    response = _sendfox_request(config, "/campaigns", payload)
    campaign_id = str(response.get("id") or response.get("campaign_id") or "")
    
    if campaign_id and not test_mode:
        print(f"Triggering automated SendFox dispatch for campaign {campaign_id}...")
        _sendfox_request(config, f"/campaigns/{campaign_id}/send", {})
    
    repo.upsert_dispatch(edition_id, {"provider": "sendfox", "sendfox_campaign_id": campaign_id or None, "status": "sent", "payload_json": payload, "sent_at": datetime.now(timezone.utc).isoformat()})
    return {"success": True, "campaignId": campaign_id or None, "automatedSend": not test_mode}


def _collect_documents(
    repo: RecapRepository,
    run_id: str,
    sources: list[RecapSource],
    config: NativeRecapConfig,
    seen_source_urls: set[str] | None = None,
) -> tuple[list[dict[str, Any]], int, dict[str, int]]:
    docs: list[dict[str, Any]] = []
    failed_sources = 0
    breakdown: dict[str, int] = {}
    seen = set(seen_source_urls or set())
    for source in sources:
        try:
            scraped = _scrape_source(source, config, seen)
        except Exception as exc:
            scraped = {"source_url": source.url, "title": source.name, "text": "", "snippet": "", "status": 500, "scrape_ok": False, "scrape_method": "unknown", "quality": {"word_count": 0, "data_points": 0, "score": 0}, "error": _safe_error(exc)}
        doc = {**scraped, "source_id": source.id, "source_name": source.name, "priority": source.priority}
        repo.persist_document(run_id, source, doc)
        docs.append(doc)
        method = str(doc.get("skip_reason") or doc.get("scrape_method") or "unknown")
        breakdown[method] = breakdown.get(method, 0) + 1
        if doc.get("scrape_ok"):
            canonical = _canonical_source_url(str(doc.get("source_url") or ""))
            if canonical:
                seen.add(canonical)
        elif not doc.get("is_duplicate"):
            failed_sources += 1
        if len([item for item in docs if item.get("scrape_ok")]) >= config.target_successful_scrapes:
            break
    return docs, failed_sources, breakdown


def _run_build_article(payload: dict[str, Any], *, repo: RecapRepository, config: NativeRecapConfig, schedule_timezone: str) -> dict[str, Any]:
    now_local = datetime.now(ZoneInfo(schedule_timezone))
    edition_key = _trim_or_none(payload.get("editionKey")) or _resolve_edition_key(now_local)
    run = repo.create_run(edition_key, str(payload.get("trigger") or "manual"), "build_article")
    week_start, week_end = _week_bounds(now_local)
    edition = repo.ensure_edition(edition_key, run["id"], week_start, week_end)
    ai_tracker = RecapAiRunTracker(config.max_anthropic_calls_per_run)
    try:
        day_theme_index = _weekday_to_day_theme_index(_to_weekday_index_from_zone(now_local))
        day_theme = repo.get_day_theme(day_theme_index) if day_theme_index is not None else None
        if day_theme_index is not None and (not day_theme or not day_theme.source_ids):
            raise RuntimeError("day_theme_missing: Day theme configuration missing or has no source_ids")
        sources = repo.get_active_sources(max_sources=config.max_sources, source_ids=day_theme.source_ids if isinstance(day_theme, RecapDayTheme) and day_theme.source_ids else None)
        if len(sources) > config.max_articles_per_run:
            print(f"WARNING: Found {len(sources)} sources, but RECAP_MAX_ARTICLES_PER_RUN is {config.max_articles_per_run}. Truncating.")
            sources = sources[:config.max_articles_per_run]
        if not sources:
            raise RuntimeError("no_active_sources: No active recap sources available")
        published_source_urls = repo.get_published_source_urls(exclude_edition_key=edition_key)
        seen_source_urls = _canonical_source_url_set(published_source_urls)
        docs, failed_sources, breakdown = _collect_documents(repo, run["id"], sources, config, seen_source_urls)
        stories = _pick_stories(docs)[:4]
        if not stories:
            raise RuntimeError("no_reliable_stories: No reliable stories after scraping")
        evidence_pack = _build_evidence_pack(stories, config)
        brief = _generate_brief(stories, evidence_pack, edition_key, config)
        article = _generate_article(stories, brief, evidence_pack, edition_key, config, repo=repo, run_id=run["id"], tracker=ai_tracker)
        fact_check = _fact_check(article, evidence_pack, config, edition_key=edition_key, run_id=run["id"], repo=repo, tracker=ai_tracker)
        if fact_check["status"] == "fail":
            ai_tracker.record_failure("fact_check_failed", "fact_check")
            repo.update_edition(edition["id"], {"status": "failed", "run_id": run["id"], "fact_check_result": fact_check, "quality_report": {"stage": "fact_check", "status": "failed", "fact_check": fact_check}})
            raise RuntimeError("fact_check_failed: Fact-check blocked publication")
        try:
            copyright_compliance = _copyright_compliance_check(
                article,
                evidence_pack,
                config,
                edition_key=edition_key,
                run_id=run["id"],
                repo=repo,
                tracker=ai_tracker,
            )
        except Exception as exc:
            ai_tracker.record_failure("copyright_compliance_failed", "copyright_compliance")
            raise RuntimeError(f"copyright_compliance_failed: {_safe_error(exc)}") from exc
        if _copyright_compliance_should_block(copyright_compliance):
            ai_tracker.record_failure("copyright_compliance_failed", "copyright_compliance")
            message = f"Copyright compliance blocked publication with max risk \"{copyright_compliance['max_risk']}\""
            quality_report = {
                "stage": "copyright_compliance",
                "status": "failed",
                "fact_check": fact_check,
                "copyright_compliance": copyright_compliance,
                "evidence_pack": evidence_pack,
            }
            metrics = {
                "mode": "build_article",
                "editionKey": edition_key,
                "sourcesConfigured": len(sources),
                "sourcesScraped": len([doc for doc in docs if doc.get("scrape_ok")]),
                "sourcesFailed": failed_sources,
                "storiesSelected": len(stories),
                "scrape_methods_breakdown": breakdown,
                "fact_check_status": fact_check["status"],
                "copyright_compliance_status": copyright_compliance["status"],
                "copyright_compliance_max_risk": copyright_compliance["max_risk"],
                "copyright_compliance_issues": len(copyright_compliance["issues"]),
                "copyright_compliance_issues_detail": copyright_compliance["issues"],
                "newsletter_after_publish": {"status": "skipped", "reason": "copyright_compliance_failed"},
                "article_ready": False,
                **ai_tracker.snapshot(),
            }
            repo.update_edition(
                edition["id"],
                {
                    "status": "failed",
                    "run_id": run["id"],
                    "fact_check_result": fact_check,
                    "quality_report": quality_report,
                },
            )
            repo.mark_run(run["id"], "failed", metrics, message, "copyright_compliance_failed")
            return {
                "status": "failed",
                "reason": "copyright_compliance_failed",
                "error": message,
                "editionKey": edition_key,
                "runId": run["id"],
                "editionId": edition["id"],
                "copyrightCompliance": copyright_compliance,
            }
        summary30 = _generate_summary30(article, stories, config, edition_key=edition_key, run_id=run["id"], repo=repo, tracker=ai_tracker)
        now_iso = datetime.now(timezone.utc).isoformat()
        slug_token = _normalize_slug(edition_key)
        tags = brief.get("tags") if isinstance(brief.get("tags"), list) else ["AI & LLM"]
        source_manifest = {"primary_source_url": stories[0].get("source_url"), "used_source_urls": list(dict.fromkeys([story.get("source_url") for story in stories if story.get("source_url")])), "scrape_methods_breakdown": breakdown, "generated_at": now_iso, "generated_by": "modal-native-scrapling"}
        posts = []
        for locale, prefix in (("fr", "recap-ia"), ("en", "ai-weekly-recap")):
            title = str(article[locale].get("title") or brief[locale].get("title") or stories[0].get("title") or "AI News")
            intro = str(article[locale].get("introduction") or brief[locale].get("introduction") or stories[0].get("snippet") or "")
            markdown = str(article[locale].get("article_markdown") or "")
            content_json = {**brief[locale], "title": title, "introduction": intro, "tags": tags, "summary30s": summary30, "source_manifest": source_manifest, "sourceStories": stories}
            posts.append({"edition_id": edition["id"], "locale": locale, "slug": f"{prefix}-{slug_token}", "title": title, "intro": intro, "excerpt": _build_excerpt(intro, markdown, str(stories[0].get("snippet") or "")), "content_json": content_json, "content_markdown": markdown, "tags": tags[:3], "is_published": True, "published_at": now_iso})
        saved_posts = repo.upsert_posts(posts)
        repo.update_edition(edition["id"], {"status": "published", "run_id": run["id"], "published_at": now_iso, "fact_check_result": fact_check, "quality_report": {"stage": "completed", "status": "pass", "fact_check": fact_check, "copyright_compliance": copyright_compliance, "evidence_pack": evidence_pack, "summary30s": {"status": "pass"}}})
        newsletter_result = {"status": "skipped", "reason": "manual_build_no_auto_dispatch"}
        if payload.get("trigger") != "manual" or payload.get("force"):
            newsletter_result = _send_newsletter_for_edition(repo, config, edition["id"], edition_key)
        metrics = {"mode": "build_article", "editionKey": edition_key, "sourcesConfigured": len(sources), "sourcesScraped": len([doc for doc in docs if doc.get("scrape_ok")]), "sourcesFailed": failed_sources, "storiesSelected": len(stories), "scrape_methods_breakdown": breakdown, "fact_check_status": fact_check["status"], "copyright_compliance_status": copyright_compliance["status"], "copyright_compliance_max_risk": copyright_compliance["max_risk"], "copyright_compliance_issues": len(copyright_compliance["issues"]), "copyright_compliance_issues_detail": copyright_compliance["issues"], "newsletter_after_publish": newsletter_result, "article_ready": True, **ai_tracker.snapshot()}
        repo.mark_run(run["id"], "succeeded", metrics)
        return {"status": "succeeded", "editionKey": edition_key, "runId": run["id"], "editionId": edition["id"], "posts": saved_posts, "newsletter": newsletter_result, "metrics": metrics}
    except Exception as exc:
        if isinstance(exc, RecapAiGenerationError):
            reason = exc.reason
            ai_tracker.record_failure(exc.reason, exc.stage)
        else:
            reason = str(exc).split(":", 1)[0] if ":" in str(exc) else "build_article_failed"
            if not ai_tracker.failure_reason:
                ai_tracker.record_failure(reason)
        message = _safe_error(exc)
        failure_metrics = {"mode": "build_article", "editionKey": edition_key, "article_ready": False, **ai_tracker.snapshot()}
        repo.update_edition(edition["id"], {"status": "failed", "run_id": run["id"], "quality_report": {"stage": ai_tracker.failure_stage or reason, "status": "failed", "reason": reason, "ai": ai_tracker.snapshot()}})
        repo.mark_run(run["id"], "failed", failure_metrics, message, reason)
        return {"status": "failed", "reason": reason, "error": message, "editionKey": edition_key, "runId": run["id"], "editionId": edition["id"]}


def _run_send_newsletter(payload: dict[str, Any], *, repo: RecapRepository, config: NativeRecapConfig, schedule_timezone: str) -> dict[str, Any]:
    now_local = datetime.now(ZoneInfo(schedule_timezone))
    edition_key = _trim_or_none(payload.get("editionKey")) or _resolve_edition_key(now_local)
    run = repo.create_run(edition_key, str(payload.get("trigger") or "manual"), "send_newsletter")
    week_start, week_end = _week_bounds(now_local)
    edition = repo.ensure_edition(edition_key, run["id"], week_start, week_end)
    try:
        result = _send_newsletter_for_edition(repo, config, edition["id"], edition_key, test_email=_trim_or_none(payload.get("testEmail")), test_mode=bool(payload.get("testMode") if payload.get("testMode") is not None else payload.get("trigger") == "manual"))
        repo.mark_run(run["id"], "succeeded", {"mode": "send_newsletter", "editionKey": edition_key, "newsletter": result})
        return {"status": "succeeded", "editionKey": edition_key, "runId": run["id"], "editionId": edition["id"], "newsletter": result}
    except Exception as exc:
        repo.mark_run(run["id"], "failed", {"mode": "send_newsletter", "editionKey": edition_key}, _safe_error(exc), "send_newsletter_failed")
        return {"status": "failed", "reason": "send_newsletter_failed", "error": _safe_error(exc), "editionKey": edition_key, "runId": run["id"], "editionId": edition["id"]}


def _run_retry_newsletter(payload: dict[str, Any], *, repo: RecapRepository, config: NativeRecapConfig) -> dict[str, Any]:
    edition_key = _trim_or_none(payload.get("editionKey"))
    edition = repo.get_edition_by_key(edition_key) if edition_key else repo.get_latest_published_edition()
    if not edition:
        return {"status": "failed", "reason": "edition_not_found", "error": "No edition available for newsletter retry"}
    result = _send_newsletter_for_edition(repo, config, edition["id"], edition["edition_key"], test_email=_trim_or_none(payload.get("testEmail")), test_mode=bool(payload.get("testMode")))
    return {"status": "succeeded", "editionKey": edition["edition_key"], "editionId": edition["id"], "newsletter": result}


def run_modal_native_recap(payload: dict[str, Any], *, shadow_mode: bool) -> dict[str, Any]:
    config = NativeRecapConfig.from_env()
    mode = str(payload.get("mode") or "tick").strip().lower()
    if shadow_mode:
        return {
            "statusCode": 200,
            "body": {
                "status": "skipped",
                "reason": "shadow_mode_disabled_for_full_native_recap",
                "mode": mode,
                "shadowMode": True,
            },
        }
    try:
        repo = RecapRepository.from_env()
        schedule = repo.get_schedule(config.timezone)
    except RecapRepositoryError as exc:
        return {"statusCode": 500, "body": {"status": "failed", "reason": "repository_init_failed", "error": _safe_error(exc), "shadowMode": shadow_mode}}
    if not schedule.is_enabled:
        return {"statusCode": 200, "body": {"status": "skipped", "reason": "schedule_disabled", "shadowMode": shadow_mode}}
    timezone_name = schedule.timezone or config.timezone
    now_local = datetime.now(ZoneInfo(timezone_name))
    if mode == "tick":
        if not any(_is_slot_match(now_local, slot.day, slot.hour, slot.minute) for slot in schedule.slots):
            return {"statusCode": 200, "body": {"status": "skipped", "reason": "outside_scheduled_window", "shadowMode": shadow_mode}}
        mode = "build_article"
    if shadow_mode:
        payload = {**payload, "trigger": payload.get("trigger") or "manual"}
    if mode == "build_article":
        body = _run_build_article(payload, repo=repo, config=config, schedule_timezone=timezone_name)
    elif mode == "send_newsletter":
        body = _run_send_newsletter(payload, repo=repo, config=config, schedule_timezone=timezone_name)
    elif mode == "retry_newsletter":
        body = _run_retry_newsletter(payload, repo=repo, config=config)
    else:
        body = {"status": "failed", "reason": "unsupported_mode", "error": f"Unsupported recap mode: {mode}"}
    body["mode"] = mode
    body["shadowMode"] = shadow_mode
    return {"statusCode": 200 if body.get("status") in {"succeeded", "skipped"} else 500, "body": body}

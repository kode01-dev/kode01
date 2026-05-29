import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx


class RecapRepositoryError(RuntimeError):
    pass


def _to_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return default


def _to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_url(value: str | None) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().rstrip("/")


def _derive_supabase_base_url() -> str:
    direct = _normalize_url(os.getenv("SUPABASE_URL"))
    if direct:
        return direct

    functions_url = _normalize_url(os.getenv("SUPABASE_FUNCTIONS_URL"))
    if not functions_url:
        return ""
    suffix = "/functions/v1"
    if functions_url.endswith(suffix):
        return functions_url[: -len(suffix)]
    return functions_url


def _redact_error_message(message: str) -> str:
    trimmed = (message or "").strip()
    if len(trimmed) <= 320:
        return trimmed
    return f"{trimmed[:320]}..."


def _extract_recap_source_urls(content: Any) -> list[str]:
    if not isinstance(content, dict):
        return []

    out: list[str] = []

    def add(value: Any) -> None:
        if isinstance(value, str) and value.strip().lower().startswith(("http://", "https://")):
            out.append(value.strip())

    manifest = content.get("source_manifest")
    if isinstance(manifest, dict):
        add(manifest.get("primary_source_url"))
        used_urls = manifest.get("used_source_urls")
        if isinstance(used_urls, list):
            for value in used_urls:
                add(value)

    source_stories = content.get("sourceStories")
    if isinstance(source_stories, list):
        for story in source_stories:
            if isinstance(story, dict):
                add(story.get("source_url"))

    big_news = content.get("bigNews")
    if isinstance(big_news, dict):
        add(big_news.get("source_url"))

    quick_hits = content.get("quickHits")
    if isinstance(quick_hits, list):
        for hit in quick_hits:
            if isinstance(hit, dict):
                add(hit.get("source_url"))

    return list(dict.fromkeys(out))


@dataclass(frozen=True)
class RecapScheduleSlot:
    day: int
    hour: int
    minute: int


@dataclass(frozen=True)
class RecapSchedule:
    is_enabled: bool
    timezone: str
    slots: list[RecapScheduleSlot]


@dataclass(frozen=True)
class RecapDayTheme:
    day_index: int
    theme_key: str
    source_ids: list[str]
    is_active: bool
    skip_if_quiet: bool


@dataclass(frozen=True)
class RecapSource:
    id: str
    name: str
    url: str
    feed_url: str | None
    scrape_route: str
    rss_allow_firecrawl_fallback: bool
    priority: int
    is_active: bool


class RecapRepository:
    def __init__(self, *, base_url: str, service_role_key: str, timeout_seconds: float = 20.0):
        if not base_url:
            raise RecapRepositoryError("SUPABASE_URL (or SUPABASE_FUNCTIONS_URL derivation) is missing")
        if not service_role_key:
            raise RecapRepositoryError("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY is required for modal-native recap repository")
        self.base_url = base_url.rstrip("/")
        self.service_role_key = service_role_key.strip()
        self.timeout_seconds = max(1.0, min(timeout_seconds, 120.0))

    @classmethod
    def from_env(cls) -> "RecapRepository":
        base_url = _derive_supabase_base_url()
        service_role_key = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        timeout_seconds = _to_float(os.getenv("AGENT_RECAP_REPO_TIMEOUT_SECONDS"), 20.0)
        return cls(
            base_url=base_url,
            service_role_key=service_role_key,
            timeout_seconds=timeout_seconds,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, str] | None = None,
        json_body: Any = None,
        extra_headers: dict[str, str] | None = None,
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
        if extra_headers:
            headers.update(extra_headers)

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.request(
                    method,
                    url,
                    headers=headers,
                    json=json_body,
                )
        except httpx.HTTPError as exc:
            raise RecapRepositoryError(f"Repository HTTP error: {_redact_error_message(str(exc))}") from exc

        if response.status_code >= 400:
            body_preview = response.text.strip()
            raise RecapRepositoryError(
                f"Repository request failed ({response.status_code}) path={path}: {_redact_error_message(body_preview)}"
            )

        if not response.text.strip():
            return None

        try:
            return response.json()
        except Exception as exc:
            print(f"DEBUG REPO JSON ERROR: {response.text}")
            raise RecapRepositoryError(f"Repository returned non-JSON payload on {path}") from exc

    def get_schedule(self, fallback_timezone: str) -> RecapSchedule:
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_schedule_settings",
            query={
                "select": "is_enabled,timezone,slot_a_day,slot_a_hour,slot_a_minute,slot_b_day,slot_b_hour,slot_b_minute,slot_c_day,slot_c_hour,slot_c_minute,slot_d_day,slot_d_hour,slot_d_minute,slot_e_day,slot_e_hour,slot_e_minute",
                "id": "eq.true",
                "limit": "1",
            },
        )
        row = rows[0] if isinstance(rows, list) and rows else None
        if not isinstance(row, dict):
            return RecapSchedule(
                is_enabled=True,
                timezone=fallback_timezone,
                slots=[
                    RecapScheduleSlot(day=1, hour=6, minute=0),
                    RecapScheduleSlot(day=2, hour=6, minute=0),
                    RecapScheduleSlot(day=3, hour=6, minute=0),
                    RecapScheduleSlot(day=4, hour=6, minute=0),
                    RecapScheduleSlot(day=5, hour=6, minute=0),
                ],
            )

        slots: list[RecapScheduleSlot] = []
        for key in ("a", "b", "c", "d", "e"):
            day = row.get(f"slot_{key}_day")
            hour = row.get(f"slot_{key}_hour")
            minute = row.get(f"slot_{key}_minute")
            if day is None or hour is None or minute is None:
                continue
            day_int = _to_int(day, -1)
            hour_int = _to_int(hour, -1)
            minute_int = _to_int(minute, -1)
            if 0 <= day_int <= 6 and 0 <= hour_int <= 23 and minute_int in {0, 15, 30, 45}:
                slots.append(RecapScheduleSlot(day=day_int, hour=hour_int, minute=minute_int))

        return RecapSchedule(
            is_enabled=_to_bool(row.get("is_enabled"), True),
            timezone=str(row.get("timezone") or fallback_timezone),
            slots=slots,
        )

    def get_day_theme(self, day_index: int) -> RecapDayTheme | None:
        if day_index < 1 or day_index > 5:
            return None

        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_day_themes",
            query={
                "select": "day_index,theme_key,source_ids,is_active,skip_if_quiet",
                "day_index": f"eq.{day_index}",
                "is_active": "eq.true",
                "limit": "1",
            },
        )
        row = rows[0] if isinstance(rows, list) and rows else None
        if not isinstance(row, dict):
            return None
        source_ids = row.get("source_ids")
        source_list = [item for item in source_ids if isinstance(item, str) and item.strip()] if isinstance(source_ids, list) else []
        return RecapDayTheme(
            day_index=_to_int(row.get("day_index"), day_index),
            theme_key=str(row.get("theme_key") or ""),
            source_ids=source_list,
            is_active=_to_bool(row.get("is_active"), True),
            skip_if_quiet=_to_bool(row.get("skip_if_quiet"), True),
        )

    def get_active_sources(self, *, max_sources: int, source_ids: list[str] | None = None) -> list[RecapSource]:
        query = {
            "select": "id,name,url,feed_url,scrape_route,rss_allow_firecrawl_fallback,priority,is_active",
            "is_active": "eq.true",
            "order": "priority.desc",
            "limit": str(max(1, min(max_sources, 30))),
        }
        cleaned_ids = [value.strip() for value in (source_ids or []) if isinstance(value, str) and value.strip()]
        if cleaned_ids:
            query["id"] = f"in.({','.join(cleaned_ids)})"

        rows = self._request("GET", "/rest/v1/ai_recap_sources", query=query)
        if not isinstance(rows, list):
            return []

        out: list[RecapSource] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            source_id = str(row.get("id") or "").strip()
            source_name = str(row.get("name") or "").strip()
            source_url = str(row.get("url") or "").strip()
            if not source_id or not source_name or not source_url:
                continue
            out.append(
                RecapSource(
                    id=source_id,
                    name=source_name,
                    url=source_url,
                    feed_url=str(row.get("feed_url")).strip() if row.get("feed_url") else None,
                    scrape_route=str(row.get("scrape_route") or "firecrawl").strip().lower(),
                    rss_allow_firecrawl_fallback=_to_bool(row.get("rss_allow_firecrawl_fallback"), False),
                    priority=_to_int(row.get("priority"), 0),
                    is_active=_to_bool(row.get("is_active"), True),
                )
            )
        return out

    def log_audit_event(self, event_type: str, metadata: dict[str, Any]) -> None:
        try:
            self._request(
                "POST",
                "/rest/v1/audit_logs",
                json_body={
                    "event_type": event_type,
                    "metadata": metadata
                }
            )
        except Exception as exc:
            print(f"Warning: Failed to write audit log ({event_type}): {exc}")

    def create_run(self, edition_key: str, trigger_type: str, mode: str) -> dict[str, Any]:
        normalized = edition_key.strip().upper()
        existing = self._request(
            "GET",
            "/rest/v1/ai_recap_runs",
            query={
                "select": "id,attempt",
                "edition_key": f"eq.{normalized}",
                "trigger_type": f"eq.{trigger_type}",
                "mode": f"eq.{mode}",
                "status": "eq.running",
                "order": "started_at.desc",
                "limit": "1",
            },
        )
        if isinstance(existing, list) and existing:
            return existing[0]

        latest = self._request(
            "GET",
            "/rest/v1/ai_recap_runs",
            query={
                "select": "attempt",
                "edition_key": f"eq.{normalized}",
                "order": "attempt.desc",
                "limit": "1",
            },
        )
        attempt = _to_int(latest[0].get("attempt"), 0) + 1 if isinstance(latest, list) and latest else 1
        inserted = self._request(
            "POST",
            "/rest/v1/ai_recap_runs",
            json_body={
                "edition_key": normalized,
                "trigger_type": trigger_type if trigger_type in {"cron", "manual", "retry"} else "manual",
                "mode": mode,
                "attempt": attempt,
                "status": "running",
            },
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(inserted, list) or not inserted:
            raise RecapRepositoryError("Unable to create ai_recap_runs row")
        return inserted[0]

    def mark_run(
        self,
        run_id: str,
        status: str,
        metrics: dict[str, Any],
        error_message: str | None = None,
        failure_reason: str | None = None,
    ) -> None:
        self._request(
            "PATCH",
            "/rest/v1/ai_recap_runs",
            query={"id": f"eq.{run_id}"},
            json_body={
                "status": status,
                "metrics_json": metrics,
                "error_message": error_message,
                "failure_reason": failure_reason,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            },
            extra_headers={"Prefer": "return=minimal"},
        )

    def has_blocking_running_run(self, edition_key: str, mode: str, *, older_than_minutes: int = 60) -> bool:
        cutoff = datetime.now(timezone.utc).timestamp() - max(1, older_than_minutes) * 60
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_runs",
            query={
                "select": "id,started_at",
                "edition_key": f"eq.{edition_key.strip().upper()}",
                "mode": f"eq.{mode}",
                "status": "eq.running",
                "order": "started_at.desc",
                "limit": "10",
            },
        )
        if not isinstance(rows, list):
            return False
        for row in rows:
            started_at = str(row.get("started_at") or "")
            try:
                started_ts = datetime.fromisoformat(started_at.replace("Z", "+00:00")).timestamp()
            except Exception:
                continue
            if started_ts <= cutoff:
                return True
        return False

    def get_admin_profile_ids(self, *, limit: int = 50) -> list[str]:
        rows = self._request(
            "GET",
            "/rest/v1/profiles",
            query={
                "select": "id",
                "role": "eq.admin",
                "limit": str(max(1, min(limit, 200))),
            },
        )
        if not isinstance(rows, list):
            return []
        return [str(row.get("id")) for row in rows if isinstance(row, dict) and row.get("id")]

    def find_recent_ai_recap_alert(self, dedupe_key: str, since_iso: str) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/notifications",
            query={
                "select": "id,metadata,created_at,email_status",
                "template_key": "eq.ai_recap_failure_alert",
                "created_at": f"gte.{since_iso}",
                "order": "created_at.desc",
                "limit": "100",
            },
        )
        if not isinstance(rows, list):
            return None
        for row in rows:
            metadata = row.get("metadata") if isinstance(row, dict) else None
            if isinstance(metadata, dict) and metadata.get("dedupe_key") == dedupe_key:
                return row
        return None

    def create_notification(self, fields: dict[str, Any]) -> dict[str, Any] | None:
        inserted = self._request(
            "POST",
            "/rest/v1/notifications",
            json_body=fields,
            extra_headers={"Prefer": "return=representation"},
        )
        return inserted[0] if isinstance(inserted, list) and inserted else None

    def update_notification(self, notification_id: str, fields: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            "/rest/v1/notifications",
            query={"id": f"eq.{notification_id}"},
            json_body=fields,
            extra_headers={"Prefer": "return=minimal"},
        )

    def ensure_edition(self, edition_key: str, run_id: str, week_start: str, week_end: str) -> dict[str, Any]:
        normalized = edition_key.strip().upper()
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_editions",
            query={"select": "id,edition_key,status", "edition_key": f"eq.{normalized}", "limit": "1"},
        )
        if isinstance(rows, list) and rows:
            existing = rows[0]
            self.update_edition(existing["id"], {"run_id": run_id, "status": "published" if existing.get("status") == "published" else "draft"})
            return existing
        inserted = self._request(
            "POST",
            "/rest/v1/ai_recap_editions",
            json_body={
                "edition_key": normalized,
                "run_id": run_id,
                "status": "draft",
                "week_start": week_start,
                "week_end": week_end,
            },
            extra_headers={"Prefer": "return=representation"},
        )
        if not isinstance(inserted, list) or not inserted:
            raise RecapRepositoryError(f"Unable to create edition {normalized}")
        return inserted[0]

    def update_edition(self, edition_id: str, fields: dict[str, Any]) -> None:
        self._request(
            "PATCH",
            "/rest/v1/ai_recap_editions",
            query={"id": f"eq.{edition_id}"},
            json_body=fields,
            extra_headers={"Prefer": "return=minimal"},
        )

    def get_generation_artifact(self, edition_key: str, stage: str, input_hash: str) -> dict[str, Any] | None:
        normalized = edition_key.strip().upper()
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_generation_artifacts",
            query={
                "select": "id,edition_key,run_id,stage,input_hash,provider,model,status,output_json,error_message,usage_json,created_at",
                "edition_key": f"eq.{normalized}",
                "stage": f"eq.{stage}",
                "input_hash": f"eq.{input_hash}",
                "status": "eq.succeeded",
                "limit": "1",
            },
        )
        return rows[0] if isinstance(rows, list) and rows else None

    def upsert_generation_artifact(self, fields: dict[str, Any]) -> None:
        payload = {
            "edition_key": str(fields.get("edition_key") or "").strip().upper(),
            "run_id": fields.get("run_id"),
            "stage": str(fields.get("stage") or "").strip(),
            "input_hash": str(fields.get("input_hash") or "").strip(),
            "provider": str(fields.get("provider") or "").strip(),
            "model": str(fields.get("model") or "").strip(),
            "status": str(fields.get("status") or "").strip(),
            "output_json": fields.get("output_json"),
            "error_message": fields.get("error_message"),
            "usage_json": fields.get("usage_json") if isinstance(fields.get("usage_json"), dict) else {},
        }
        self._request(
            "POST",
            "/rest/v1/ai_recap_generation_artifacts",
            query={"on_conflict": "edition_key,stage,input_hash"},
            json_body=payload,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    def get_edition_by_key(self, edition_key: str | None) -> dict[str, Any] | None:
        if not edition_key:
            return None
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_editions",
            query={"select": "id,edition_key,status,published_at,run_id", "edition_key": f"eq.{edition_key.strip().upper()}", "limit": "1"},
        )
        return rows[0] if isinstance(rows, list) and rows else None

    def get_latest_published_edition(self) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_editions",
            query={"select": "id,edition_key,status", "status": "eq.published", "order": "published_at.desc", "limit": "1"},
        )
        return rows[0] if isinstance(rows, list) and rows else None

    def get_published_source_urls(self, *, exclude_edition_key: str | None = None, max_editions: int = 500) -> list[str]:
        normalized_exclude = (exclude_edition_key or "").strip().upper()
        edition_rows = self._request(
            "GET",
            "/rest/v1/ai_recap_editions",
            query={
                "select": "id,edition_key",
                "status": "eq.published",
                "order": "published_at.desc.nullslast,created_at.desc",
                "limit": str(max(1, min(max_editions, 1000))),
            },
        )
        if not isinstance(edition_rows, list):
            return []

        edition_ids = [
            str(row.get("id"))
            for row in edition_rows
            if isinstance(row, dict)
            and row.get("id")
            and str(row.get("edition_key") or "").strip().upper() != normalized_exclude
        ]
        if not edition_ids:
            return []

        urls: list[str] = []
        chunk_size = 80
        for index in range(0, len(edition_ids), chunk_size):
            chunk = edition_ids[index : index + chunk_size]
            rows = self._request(
                "GET",
                "/rest/v1/ai_recap_posts",
                query={
                    "select": "content_json",
                    "is_published": "eq.true",
                    "edition_id": f"in.({','.join(chunk)})",
                    "limit": str(len(chunk) * 2),
                },
            )
            if not isinstance(rows, list):
                continue
            for row in rows:
                if isinstance(row, dict):
                    urls.extend(_extract_recap_source_urls(row.get("content_json")))
        return list(dict.fromkeys(urls))

    def persist_document(self, run_id: str, source: RecapSource, scrape: dict[str, Any]) -> None:
        self._request(
            "POST",
            "/rest/v1/ai_recap_documents",
            json_body={
                "run_id": run_id,
                "source_id": source.id,
                "source_url": scrape.get("source_url") or source.url,
                "raw_markdown": scrape.get("raw_markdown") or None,
                "cleaned_text": scrape.get("text") or scrape.get("cleaned_text") or None,
                "http_status": scrape.get("status") if isinstance(scrape.get("status"), int) else None,
                "scrape_ok": bool(scrape.get("scrape_ok")),
                "scrape_method": scrape.get("scrape_method"),
            },
            extra_headers={"Prefer": "return=minimal"},
        )

    def upsert_posts(self, posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows = self._request(
            "POST",
            "/rest/v1/ai_recap_posts",
            query={"on_conflict": "edition_id,locale"},
            json_body=posts,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )
        return rows if isinstance(rows, list) else []

    def get_posts_for_edition(self, edition_id: str) -> dict[str, dict[str, Any]]:
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_posts",
            query={
                "select": "id,locale,slug,title,intro,excerpt,content_json,content_markdown,is_published",
                "edition_id": f"eq.{edition_id}",
                "is_published": "eq.true",
            },
        )
        out: dict[str, dict[str, Any]] = {}
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict) and row.get("locale") in {"fr", "en"}:
                    out[str(row["locale"])] = row
        return out

    def get_sent_dispatch(self, edition_id: str) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/ai_recap_newsletter_dispatches",
            query={
                "select": "id,status,sent_at",
                "edition_id": f"eq.{edition_id}",
                "provider": "eq.sendfox",
                "status": "eq.sent",
                "limit": "1",
            },
        )
        return rows[0] if isinstance(rows, list) and rows else None

    def upsert_dispatch(self, edition_id: str, fields: dict[str, Any]) -> None:
        payload = {
            "edition_id": edition_id,
            "provider": "sendfox",
            **fields,
        }
        self._request(
            "POST",
            "/rest/v1/ai_recap_newsletter_dispatches",
            query={"on_conflict": "edition_id,provider"},
            json_body=payload,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

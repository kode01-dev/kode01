import hashlib
import hmac
import json
import os
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, TypedDict

import httpx
import modal
from fastapi import FastAPI, HTTPException, Request
from langgraph.graph import END, START, StateGraph
from blog_pipeline import run_blog_graph
from pydantic import BaseModel
from recap_pipeline import run_modal_native_recap

try:
    from langgraph.checkpoint.memory import MemorySaver
except Exception:
    MemorySaver = None

APP_NAME = "kode01-agent-runtime-sync"

INTERNAL_AUTH_TIMESTAMP_HEADER = "x-kode01-internal-timestamp"
INTERNAL_AUTH_SIGNATURE_HEADER = "x-kode01-internal-signature"
INTERNAL_AUTH_NONCE_HEADER = "x-kode01-internal-nonce"
DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS = 300

AGENT_FLOWS = {"weekly-ai-recap", "seo-blog-writer"}
WEEKLY_RECAP_MODES = {"tick", "build_article", "send_newsletter", "retry_newsletter"}
SEO_BLOG_WRITER_MODES = {"generate"}
TERMINAL_STATUSES = {"succeeded", "failed", "dead_letter"}
CRON_OWNER_VALUES = {"vercel", "modal"}
CRON_DISABLED_FLOW_VALUES = {"weekly-ai-recap"}
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
DEFAULT_UPSTREAM_TIMEOUT_SECONDS = 300
DEFAULT_UPSTREAM_MAX_ATTEMPTS = 3
DEFAULT_UPSTREAM_BACKOFF_BASE_MS = 250
DEFAULT_UPSTREAM_BACKOFF_MAX_MS = 4000
DEFAULT_UPSTREAM_BACKOFF_JITTER_MS = 200
RECAP_EXECUTION_TARGET_VALUES = {"edge_proxy", "modal_native", "dual_shadow"}

app = modal.App(APP_NAME)
print(f"DEBUG: App {APP_NAME} starting up...")
AGENT_RUNTIME_SECRETS = [
    modal.Secret.from_name("kode01-agent-runtime-secrets"),
    modal.Secret.from_name("kode01-agent-runtime-supabase-cutover"),
]
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements("services/modal-agent-runtime/requirements.txt")
    .run_commands("scrapling install --force")
    .add_local_dir("services/modal-agent-runtime", remote_path="/root")
)
jobs_store = modal.Dict.from_name(f"{APP_NAME}-jobs", create_if_missing=True)

used_nonces: dict[str, int] = {}
graph_checkpointer = MemorySaver() if MemorySaver else None


class EnqueuePayload(BaseModel):
    flow: Literal["weekly-ai-recap", "seo-blog-writer"]
    mode: str
    editionKey: str | None = None
    profileId: str | None = None
    input: dict[str, Any] | None = None
    saveToCms: bool | None = None
    userId: str | None = None
    force: bool | None = None
    testMode: bool | None = None
    testEmail: str | None = None
    requestId: str | None = None
    idempotencyKey: str | None = None
    trigger: Literal["cron", "manual", "retry"] | None = None


class GraphState(TypedDict, total=False):
    payload: dict[str, Any]
    startedAt: str
    output: Any
    error: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def trim_or_none(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized else None


def slugify_token(value: str) -> str:
    out = []
    prev_dash = False
    for ch in value.strip().lower():
        if ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch in {":", "_", "-"}:
            out.append(ch)
            prev_dash = False
            continue
        if not prev_dash:
            out.append("-")
            prev_dash = True
    token = "".join(out).strip("-")
    while "--" in token:
        token = token.replace("--", "-")
    return token[:160]


def to_base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    out = []
    current = value
    while current > 0:
        current, rem = divmod(current, 36)
        out.append(alphabet[rem])
    return "".join(reversed(out))


def stable_hash(input_text: str) -> str:
    hash_value = 2166136261
    for ch in input_text:
        hash_value ^= ord(ch)
        hash_value = (
            hash_value
            + (hash_value << 1)
            + (hash_value << 4)
            + (hash_value << 7)
            + (hash_value << 8)
            + (hash_value << 24)
        ) & 0xFFFFFFFF
    return to_base36(abs(hash_value))


def resolve_idempotency_key(payload: dict[str, Any]) -> str:
    explicit = trim_or_none(payload.get("idempotencyKey"))
    if explicit:
        return slugify_token(explicit)

    request_id = trim_or_none(payload.get("requestId"))
    if request_id:
        return slugify_token(f"req:{request_id}")

    if payload.get("flow") == "weekly-ai-recap":
        edition = trim_or_none(payload.get("editionKey")) or "editionless"
        trigger = trim_or_none(payload.get("trigger")) or "manual"
        mode = trim_or_none(payload.get("mode")) or "tick"
        return slugify_token(f"weekly-ai-recap:{mode}:{edition}:{trigger}")

    if payload.get("flow") == "seo-blog-writer":
        profile = trim_or_none(payload.get("profileId")) or "active"
        input_data = payload.get("input") if isinstance(payload.get("input"), dict) else {}
        keyword = trim_or_none(input_data.get("keyword")) or "keywordless"
        locale = trim_or_none(input_data.get("locale")) or "locale-less"
        trigger = trim_or_none(payload.get("trigger")) or "manual"
        mode = trim_or_none(payload.get("mode")) or "generate"
        return slugify_token(f"seo-blog-writer:{mode}:{profile}:{locale}:{keyword}:{trigger}")

    seed = json.dumps(
        {
            "flow": payload.get("flow"),
            "mode": payload.get("mode"),
        },
        sort_keys=True,
    )
    flow = trim_or_none(payload.get("flow")) or "unsupported"
    mode = trim_or_none(payload.get("mode")) or "unknown"
    return slugify_token(f"{flow}:{mode}:{stable_hash(seed)}")


def with_request_identity(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    normalized["requestId"] = trim_or_none(normalized.get("requestId")) or str(uuid.uuid4())
    normalized["idempotencyKey"] = resolve_idempotency_key(normalized)
    return normalized


def parse_bool(value: str | None) -> bool:
    if not isinstance(value, str):
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_disabled_flows(raw_value: str | None) -> set[str]:
    if not isinstance(raw_value, str):
        return set()
    values = {item.strip().lower() for item in raw_value.split(",")}
    return {value for value in values if value in CRON_DISABLED_FLOW_VALUES}


def parse_int_env(name: str, default: int, *, minimum: int | None = None, maximum: int | None = None) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def parse_float_env(name: str, default: float, *, minimum: float | None = None, maximum: float | None = None) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else default
    except (TypeError, ValueError):
        value = default
    if minimum is not None:
        value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def get_upstream_retry_config() -> dict[str, int | float]:
    return {
        "timeout_seconds": parse_float_env(
            "AGENT_UPSTREAM_TIMEOUT_SECONDS",
            DEFAULT_UPSTREAM_TIMEOUT_SECONDS,
            minimum=1,
            maximum=600,
        ),
        "max_attempts": parse_int_env(
            "AGENT_UPSTREAM_MAX_ATTEMPTS",
            DEFAULT_UPSTREAM_MAX_ATTEMPTS,
            minimum=1,
            maximum=8,
        ),
        "backoff_base_ms": parse_int_env(
            "AGENT_UPSTREAM_BACKOFF_BASE_MS",
            DEFAULT_UPSTREAM_BACKOFF_BASE_MS,
            minimum=10,
            maximum=60_000,
        ),
        "backoff_max_ms": parse_int_env(
            "AGENT_UPSTREAM_BACKOFF_MAX_MS",
            DEFAULT_UPSTREAM_BACKOFF_MAX_MS,
            minimum=50,
            maximum=120_000,
        ),
        "jitter_ms": parse_int_env(
            "AGENT_UPSTREAM_BACKOFF_JITTER_MS",
            DEFAULT_UPSTREAM_BACKOFF_JITTER_MS,
            minimum=0,
            maximum=10_000,
        ),
    }


def compute_retry_delay_seconds(attempt: int, *, base_ms: int, max_ms: int, jitter_ms: int) -> float:
    if attempt <= 1:
        exponential_ms = base_ms
    else:
        exponential_ms = base_ms * (2 ** (attempt - 1))
    jitter = random.randint(0, max(0, jitter_ms))
    delay_ms = min(max_ms, exponential_ms + jitter)
    return delay_ms / 1000.0


def post_json_with_retries(url: str, *, headers: dict[str, str], json_payload: dict[str, Any], retry_label: str) -> httpx.Response:
    retry_config = get_upstream_retry_config()
    timeout_seconds = float(retry_config["timeout_seconds"])
    max_attempts = int(retry_config["max_attempts"])
    backoff_base_ms = int(retry_config["backoff_base_ms"])
    backoff_max_ms = int(retry_config["backoff_max_ms"])
    jitter_ms = int(retry_config["jitter_ms"])

    last_request_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with httpx.Client(timeout=timeout_seconds) as client:
                response = client.post(
                    url,
                    headers=headers,
                    json=json_payload,
                )

            if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_attempts:
                delay = compute_retry_delay_seconds(
                    attempt,
                    base_ms=backoff_base_ms,
                    max_ms=backoff_max_ms,
                    jitter_ms=jitter_ms,
                )
                print(
                    f"{retry_label}: retrying retryable status {response.status_code} "
                    f"(attempt {attempt}/{max_attempts}, delay={delay:.3f}s)"
                )
                time.sleep(delay)
                continue

            return response
        except httpx.RequestError as exc:
            last_request_error = exc
            if attempt >= max_attempts:
                break
            delay = compute_retry_delay_seconds(
                attempt,
                base_ms=backoff_base_ms,
                max_ms=backoff_max_ms,
                jitter_ms=jitter_ms,
            )
            print(
                f"{retry_label}: request error {exc.__class__.__name__} "
                f"(attempt {attempt}/{max_attempts}, delay={delay:.3f}s)"
            )
            time.sleep(delay)

    if last_request_error is not None:
        raise RuntimeError(f"{retry_label} request failed after retries: {last_request_error}") from last_request_error
    raise RuntimeError(f"{retry_label} request failed after retries")


def parse_scheduler_owner(raw_value: str | None, fallback: str) -> str:
    if not isinstance(raw_value, str):
        return fallback
    normalized = raw_value.strip().lower()
    if normalized in CRON_OWNER_VALUES:
        return normalized
    return fallback


def default_scheduler_owner() -> str:
    execution_mode = (os.getenv("AGENT_EXECUTION_MODE") or "").strip().lower()
    if execution_mode == "vercel":
        return "vercel"
    if execution_mode == "modal":
        return "modal"
    return "modal"


def scheduler_owner_for_flow(flow: str) -> str:
    if flow != "weekly-ai-recap":
        return default_scheduler_owner()
    return parse_scheduler_owner(os.getenv("AGENT_CRON_OWNER_WEEKLY_RECAP"), default_scheduler_owner())


def resolve_recap_execution_target() -> str:
    raw = (os.getenv("RECAP_EXECUTION_TARGET") or "modal_native").strip().lower()
    if raw in RECAP_EXECUTION_TARGET_VALUES:
        return raw
    return "modal_native"


def should_run_modal_scheduler(flow: str) -> tuple[bool, str]:
    if flow not in AGENT_FLOWS:
        return False, "unsupported_flow"

    owner = scheduler_owner_for_flow(flow)
    if parse_bool(os.getenv("AGENT_CRON_KILL_SWITCH")):
        return False, "kill_switch"

    if parse_bool(os.getenv("AGENT_CRON_DISABLE_WEEKLY_RECAP")):
        return False, "flow_disabled"

    if flow in parse_disabled_flows(os.getenv("AGENT_CRON_DISABLED_FLOWS")):
        return False, "flow_disabled"

    if owner != "modal":
        return False, f"owner_mismatch:{owner}"

    return True, "enabled"


def validate_flow_mode(payload: EnqueuePayload) -> None:
    if payload.flow not in AGENT_FLOWS:
        raise HTTPException(status_code=400, detail=f"Invalid flow: {payload.flow}")
    if payload.flow == "weekly-ai-recap" and payload.mode not in WEEKLY_RECAP_MODES:
        raise HTTPException(status_code=400, detail=f'Invalid mode "{payload.mode}" for flow "{payload.flow}"')
    if payload.flow == "seo-blog-writer" and payload.mode not in SEO_BLOG_WRITER_MODES:
        raise HTTPException(status_code=400, detail=f'Invalid mode "{payload.mode}" for flow "{payload.flow}"')


def compute_internal_auth_signature(method: str, path: str, timestamp: int, nonce: str, secret: str) -> str:
    payload = f"{method.upper()}\n{path}\n{timestamp}\n{nonce}"
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def build_internal_auth_headers(method: str, path: str, secret: str) -> dict[str, str]:
    timestamp = int(time.time())
    nonce = str(uuid.uuid4())
    signature = compute_internal_auth_signature(method, path, timestamp, nonce, secret)
    return {
        "Authorization": f"Bearer {secret}",
        INTERNAL_AUTH_TIMESTAMP_HEADER: str(timestamp),
        INTERNAL_AUTH_NONCE_HEADER: nonce,
        INTERNAL_AUTH_SIGNATURE_HEADER: signature,
    }


def _prune_used_nonces(now_sec: int, max_skew_seconds: int) -> None:
    stale = [nonce for nonce, seen_sec in used_nonces.items() if now_sec - seen_sec > max_skew_seconds * 2]
    for nonce in stale:
        used_nonces.pop(nonce, None)


def _register_nonce_once(nonce: str, timestamp: int, max_skew_seconds: int) -> bool:
    now_sec = int(time.time())
    _prune_used_nonces(now_sec, max_skew_seconds)
    if nonce in used_nonces:
        return False
    used_nonces[nonce] = timestamp
    return True


def _extract_bearer_token(header_value: str | None) -> str | None:
    if not header_value:
        return None
    parts = header_value.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def verify_internal_auth(request: Request) -> None:
    accepted_secrets = [v.strip() for v in [os.getenv("AGENT_INTERNAL_TOKEN"), os.getenv("AGENT_INTERNAL_TOKEN_NEXT"), os.getenv("EDGE_INTERNAL_AUTH_TOKEN")] if v]
    if not accepted_secrets:
        raise HTTPException(status_code=500, detail="AGENT_INTERNAL_TOKEN is missing")

    signature = request.headers.get(INTERNAL_AUTH_SIGNATURE_HEADER, "").strip()
    nonce = request.headers.get(INTERNAL_AUTH_NONCE_HEADER, "").strip()
    timestamp_raw = request.headers.get(INTERNAL_AUTH_TIMESTAMP_HEADER, "").strip()
    bearer = _extract_bearer_token(request.headers.get("authorization"))
    if not signature or not nonce or not timestamp_raw or not bearer:
        print("Internal auth failed: missing required auth headers")
        raise HTTPException(status_code=401, detail="INTERNAL_AUTH_INVALID:missing_headers")

    try:
        timestamp = int(timestamp_raw)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="INTERNAL_AUTH_INVALID:invalid_timestamp") from exc

    try:
        max_skew_seconds = int(os.getenv("AGENT_INTERNAL_AUTH_MAX_SKEW_SECONDS", str(DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS)))
    except (TypeError, ValueError):
        max_skew_seconds = DEFAULT_INTERNAL_AUTH_MAX_SKEW_SECONDS
    now_sec = int(time.time())
    if abs(now_sec - timestamp) > max(1, max_skew_seconds):
        raise HTTPException(status_code=401, detail="INTERNAL_AUTH_INVALID:timestamp_expired")

    if not _register_nonce_once(nonce, timestamp, max_skew_seconds):
        raise HTTPException(status_code=401, detail="INTERNAL_AUTH_INVALID:replayed_nonce")

    path = request.url.path
    for secret in accepted_secrets:
        if not hmac.compare_digest(secret, bearer):
            continue
        expected = compute_internal_auth_signature(request.method, path, timestamp, nonce, secret)
        if hmac.compare_digest(expected, signature):
            return

    raise HTTPException(status_code=401, detail="INTERNAL_AUTH_INVALID:invalid_signature")


def pick_recap_mode(mode: str) -> str:
    if mode in {"build_article", "send_newsletter", "retry_newsletter"}:
        return mode
    return "tick"


def invoke_recap_upstream(payload: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    base_url = (os.getenv("SUPABASE_FUNCTIONS_URL") or "").strip().rstrip("/")
    if not base_url:
        raise RuntimeError("SUPABASE_FUNCTIONS_URL is missing")

    url = f"{base_url}/weekly-ai-recap-cron"

    bearer = (os.getenv("CRON_SECRET") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY") or "").strip()
    internal_token = (os.getenv("EDGE_INTERNAL_AUTH_TOKEN") or "").strip()
    if not bearer:
        raise RuntimeError("CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_SECRET_KEY is required for recap invocation")

    raw_body = {
        "mode": pick_recap_mode(payload.get("mode", "tick")),
        "trigger": payload.get("trigger") or "manual",
        "force": bool(payload.get("force")),
        "editionKey": payload.get("editionKey"),
        "testMode": payload.get("testMode"),
        "testEmail": payload.get("testEmail"),
    }
    request_body = {k: v for k, v in raw_body.items() if v is not None}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer}"
    }
    if internal_token:
        headers["x-internal-auth"] = internal_token

    response = post_json_with_retries(
        url,
        headers=headers,
        json_payload=request_body,
        retry_label="weekly-ai-recap-upstream",
    )

    try:
        body: Any = response.json()
    except Exception:
        body = {"error": response.text or "Invalid upstream response"}

    output = {"status": response.status_code, "body": body}
    if response.is_error:
        return output, f"Recap upstream failed ({response.status_code})"
    return output, None


def recap_mode_supports_native(mode: str) -> bool:
    return mode in {"tick", "build_article", "send_newsletter", "retry_newsletter"}


def run_recap_node(state: GraphState) -> GraphState:
    payload = state["payload"]
    mode = pick_recap_mode(str(payload.get("mode", "tick")))
    execution_target = resolve_recap_execution_target()

    try:
        if execution_target == "modal_native" and recap_mode_supports_native(mode):
            native = run_modal_native_recap(payload, shadow_mode=False)
            output = {
                "status": int(native.get("statusCode", 500)),
                "body": native.get("body") if isinstance(native.get("body"), dict) else native,
                "executionTarget": "modal_native",
            }
            if output["status"] >= 400:
                return {"output": output, "error": f"Modal native recap failed ({output['status']})"}
            return {"output": output}

        output, error = invoke_recap_upstream(payload)
        output["executionTarget"] = "edge_proxy" if execution_target == "edge_proxy" else execution_target

        if execution_target == "dual_shadow" and recap_mode_supports_native(mode):
            try:
                shadow = run_modal_native_recap(payload, shadow_mode=True)
                output["modalNativeShadow"] = shadow
            except Exception as shadow_exc:
                output["modalNativeShadow"] = {
                    "statusCode": 500,
                    "body": {
                        "status": "failed",
                        "reason": "shadow_execution_failed",
                        "error": str(shadow_exc),
                        "shadowMode": True,
                    },
                }

        if error:
            return {"output": output, "error": error}
        return {"output": output}
    except Exception as exc:
        return {"error": str(exc)}


recap_graph_builder = StateGraph(GraphState).add_node("invoke", run_recap_node).add_edge(START, "invoke").add_edge("invoke", END)
if graph_checkpointer is not None:
    recap_graph = recap_graph_builder.compile(checkpointer=graph_checkpointer)
else:
    recap_graph = recap_graph_builder.compile()


def resolve_thread_id(payload: dict[str, Any], fallback: str | None = None) -> str:
    return (
        trim_or_none(payload.get("idempotencyKey"))
        or trim_or_none(payload.get("requestId"))
        or fallback
        or str(uuid.uuid4())
    )


def run_recap_graph(payload: dict[str, Any], *, thread_id: str | None = None) -> dict[str, Any]:
    started_at = now_iso()
    state = recap_graph.invoke(
        {"payload": payload, "startedAt": started_at},
        config={"configurable": {"thread_id": resolve_thread_id(payload, thread_id)}},
    )
    finished_at = now_iso()
    output = state.get("output")
    error = state.get("error")
    output_dict = output if isinstance(output, dict) else {}
    body = output_dict.get("body") if isinstance(output_dict.get("body"), dict) else {}
    shadow = output_dict.get("modalNativeShadow") if isinstance(output_dict.get("modalNativeShadow"), dict) else {}
    shadow_body = shadow.get("body") if isinstance(shadow.get("body"), dict) else {}
    summary = {
        "upstreamStatus": output_dict.get("status"),
        "editionKey": payload.get("editionKey"),
        "executionTarget": output_dict.get("executionTarget"),
        "nativeStatus": body.get("status"),
        "shadowStatus": shadow_body.get("status"),
        "shadowReason": shadow_body.get("reason"),
    }
    return {
        "status": "failed" if error else "succeeded",
        "flow": "weekly-ai-recap",
        "mode": payload.get("mode"),
        "startedAt": started_at,
        "finishedAt": finished_at,
        "summary": summary,
        "output": output,
        "error": error,
    }


def build_job_id(payload: dict[str, Any]) -> str:
    explicit = trim_or_none(payload.get("idempotencyKey"))
    if explicit:
        return explicit
    return trim_or_none(payload.get("requestId")) or str(uuid.uuid4())


def enqueue_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = with_request_identity(payload)
    job_id = build_job_id(normalized)
    # Check if job already exists (idempotency)
    existing = jobs_store.get(job_id)
    if isinstance(existing, dict):
        return {"jobId": job_id, "status": existing.get("status", "queued")}

    # Initial state
    created_at = now_iso()
    job_data = {
        "id": job_id,
        "jobId": job_id,
        "flow": normalized["flow"],
        "mode": normalized["mode"],
        "status": "queued",
        "payload": normalized,
        "createdAt": created_at,
        "updatedAt": created_at,
        # Backward-compat aliases for historical logs/queries.
        "created_at": created_at,
        "updated_at": created_at,
    }
    jobs_store[job_id] = job_data

    # Spawn processing task (Async)
    print(f"Spawning process_job for {job_id}...")
    process_job.spawn(job_id, normalized)
    return {"jobId": job_id, "status": "queued"}

@app.function(
    image=image, 
    timeout=3600, 
    max_containers=int(os.environ.get("RECAP_MAX_CONCURRENT_JOBS", "2")),
    secrets=AGENT_RUNTIME_SECRETS,
)
def process_job(job_id: str, payload: dict[str, Any]) -> None:
    print(f"process_job started job_id={job_id} flow={payload.get('flow')} mode={payload.get('mode')}")
    
    from recap_repository import RecapRepository
    try:
        repo = RecapRepository.from_env()
    except Exception as e:
        print(f"Warning: Failed to initialize RecapRepository for audit logging: {e}")
        repo = None

    current = jobs_store.get(job_id) or {}
    current["status"] = "running"
    current["startedAt"] = now_iso()
    current["updatedAt"] = current["startedAt"]
    current["updated_at"] = current["startedAt"]
    current["payload"] = current.get("payload") if isinstance(current.get("payload"), dict) else payload
    jobs_store[job_id] = current

    if repo:
        repo.log_audit_event(
            "agent_job_started",
            {
                "job_id": job_id,
                "flow": payload.get("flow"),
                "mode": payload.get("mode"),
                "trigger": payload.get("trigger", "unknown")
            }
        )

    try:
        if payload.get("flow") == "weekly-ai-recap":
            result = run_recap_graph(payload, thread_id=job_id)
        elif payload.get("flow") == "seo-blog-writer":
            result = run_blog_graph(payload, thread_id=job_id)
        else:
            raise RuntimeError(f"Unsupported agent flow: {payload.get('flow')}")

        current["status"] = "failed" if result.get("status") == "failed" else "succeeded"
        current["result"] = result
        current["error"] = result.get("error")
        current["finishedAt"] = now_iso()
        current["updatedAt"] = current["finishedAt"]
        current["updated_at"] = current["finishedAt"]
        jobs_store[job_id] = current

        if repo:
            repo.log_audit_event(
                f"agent_job_{current['status']}",
                {
                    "job_id": job_id,
                    "flow": payload.get("flow"),
                    "mode": payload.get("mode"),
                    "error": result.get("error") if result else None
                }
            )
            
    except Exception as exc:
        current["status"] = "dead_letter"
        current["error"] = str(exc)
        current["finishedAt"] = now_iso()
        current["updatedAt"] = current["finishedAt"]
        current["updated_at"] = current["finishedAt"]
        jobs_store[job_id] = current

        if repo:
            repo.log_audit_event(
                "agent_job_dead_letter",
                {
                    "job_id": job_id,
                    "flow": payload.get("flow"),
                    "mode": payload.get("mode"),
                    "error": str(exc)
                }
            )


def get_job_status(job_id: str) -> dict[str, Any] | None:
    entry = jobs_store.get(job_id)
    if not isinstance(entry, dict):
        return None
    return {
        "jobId": job_id,
        "status": entry.get("status", "queued"),
        "result": entry.get("result"),
        "error": entry.get("error"),
    }


def get_slo_metrics() -> dict[str, Any]:
    now_ms = int(time.time() * 1000)
    counts = {"queued": 0, "running": 0, "retrying": 0, "succeeded": 0, "failed": 0, "dead_letter": 0}
    oldest_pending_age_ms = 0

    try:
        for _, entry in jobs_store.items():
            if not isinstance(entry, dict):
                continue
            status = entry.get("status", "queued")
            if status in counts:
                counts[status] += 1
            if status in {"queued", "running", "retrying"}:
                created_at = entry.get("createdAt")
                if isinstance(created_at, str):
                    try:
                        created_ms = int(datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp() * 1000)
                        oldest_pending_age_ms = max(oldest_pending_age_ms, max(0, now_ms - created_ms))
                    except Exception:
                        pass
    except Exception:
        pass

    return {
        "generatedAt": now_iso(),
        "totals": counts,
        "oldestPendingAgeMs": oldest_pending_age_ms,
    }


web_app = FastAPI()


@web_app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@web_app.get("/internal/slo")
def internal_slo(request: Request) -> dict[str, Any]:
    verify_internal_auth(request)
    return {"status": "ok", "queueMetrics": get_slo_metrics()}


@web_app.post("/internal/jobs")
async def internal_enqueue(request: Request) -> dict[str, Any]:
    verify_internal_auth(request)
    raw_payload = await request.json()
    payload = EnqueuePayload.model_validate(raw_payload)
    validate_flow_mode(payload)
    return enqueue_payload(payload.model_dump(exclude_none=True))


@web_app.get("/internal/jobs/{job_id}")
def internal_job_status(job_id: str, request: Request) -> dict[str, Any]:
    verify_internal_auth(request)
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail={"error": "Job not found", "code": "JOB_NOT_FOUND", "jobId": job_id})
    return status


@web_app.post("/internal/jobs/{job_id}/replay")
def internal_replay(job_id: str, request: Request) -> dict[str, Any]:
    verify_internal_auth(request)
    entry = jobs_store.get(job_id)
    if not isinstance(entry, dict):
        raise HTTPException(status_code=404, detail={"error": "Job not found", "code": "JOB_NOT_FOUND", "jobId": job_id})

    status = entry.get("status")
    if status not in {"dead_letter", "failed"}:
        raise HTTPException(status_code=400, detail={"error": f'Job "{job_id}" is not replayable', "code": "JOB_REPLAY_FAILED"})

    payload = entry.get("payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail={"error": "Job payload missing", "code": "JOB_REPLAY_FAILED"})

    replay_payload = dict(payload)
    now_ms = int(time.time() * 1000)
    replay_payload["trigger"] = "retry"
    replay_payload["requestId"] = f"replay:{job_id}:{now_ms}"
    replay_payload["idempotencyKey"] = f"replay:{job_id}:{now_ms}"
    replayed = enqueue_payload(replay_payload)
    return {"previousJobId": job_id, **replayed}

def enqueue_and_run_sync(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = with_request_identity(payload)
    job_id = build_job_id(normalized)
    
    existing = jobs_store.get(job_id)
    if isinstance(existing, dict) and existing.get("status") in {"queued", "running", "succeeded"}:
         return {"jobId": job_id, "status": existing.get("status")}
         
    created_at = now_iso()
    job_data = {
        "id": job_id,
        "jobId": job_id,
        "flow": normalized["flow"],
        "mode": normalized["mode"],
        "status": "queued",
        "payload": normalized,
        "createdAt": created_at,
        "updatedAt": created_at,
        "created_at": created_at,
        "updated_at": created_at,
    }
    jobs_store[job_id] = job_data
    
    print(f"Running process_job SYNCHRONOUSLY for {job_id}...")
    process_job.remote(job_id, normalized)
    return {"jobId": job_id, "status": "executed"}


def enqueue_scheduler_job(payload: dict[str, Any]) -> None:
    enqueue_payload(payload)


@app.function(
    image=image,
    schedule=modal.Cron("*/15 * * * *"),
    timeout=3600,
    secrets=AGENT_RUNTIME_SECRETS,
)
def schedule_recap_ticker() -> None:
    now_ms = int(time.time() * 1000)
    recap_enabled, recap_reason = should_run_modal_scheduler("weekly-ai-recap")
    if recap_enabled:
        print("schedule_recap_ticker: starting weekly-ai-recap (tick)")
        enqueue_and_run_sync({
            "flow": "weekly-ai-recap",
            "mode": "tick",
            "trigger": "cron",
            "requestId": f"scheduler:ticker:recap:{now_ms}",
            "idempotencyKey": f"scheduler:ticker:recap:{now_ms}",
        })
    else:
        print(f"schedule_recap_ticker skipped weekly-ai-recap ({recap_reason})")


@app.function(image=image, timeout=900, min_containers=0, secrets=AGENT_RUNTIME_SECRETS)
@modal.asgi_app()
def api():
    return web_app


@app.local_entrypoint()
def main() -> None:
    print("Modal agent runtime is ready. Use:")
    print("  modal serve services/modal-agent-runtime/runtime.py")
    print("or")
    print("  modal deploy services/modal-agent-runtime/runtime.py")

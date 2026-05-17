import base64
import json
from binascii import Error as Base64Error
from io import BytesIO
from pathlib import Path
from dataclasses import dataclass, field

import anyio
from anyio import Path as AsyncPath

from scrapling.core.utils import log
from scrapling.core._types import Any, Dict, Set, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from scrapling.spiders.request import Request


_CHECKPOINT_VERSION = 1
_VALUE_TYPE_KEY = "__scrapling_checkpoint_type__"
_DICT_VALUE = "dict"
_TUPLE_VALUE = "tuple"
_BYTES_VALUE = "bytes"
_BYTES_IO_VALUE = "bytes_io"


@dataclass
class CheckpointData:
    """Container for checkpoint state."""

    requests: List["Request"] = field(default_factory=list)
    seen: Set[bytes] = field(default_factory=set)


def _encode_bytes(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def _decode_bytes(value: object, context: str) -> bytes:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a base64 string")
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except (ValueError, Base64Error) as e:
        raise ValueError(f"{context} is not valid base64") from e


def _encode_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        return {_VALUE_TYPE_KEY: _BYTES_VALUE, "data": _encode_bytes(value)}
    if isinstance(value, BytesIO):
        return {_VALUE_TYPE_KEY: _BYTES_IO_VALUE, "data": _encode_bytes(value.getvalue())}
    if isinstance(value, tuple):
        return {_VALUE_TYPE_KEY: _TUPLE_VALUE, "items": [_encode_value(item) for item in value]}
    if isinstance(value, list):
        return [_encode_value(item) for item in value]
    if isinstance(value, dict):
        return {
            _VALUE_TYPE_KEY: _DICT_VALUE,
            "items": [[_encode_value(key), _encode_value(item)] for key, item in value.items()],
        }

    raise TypeError(f"Checkpoint value of type {type(value).__name__} is not JSON serializable")


def _decode_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [_decode_value(item) for item in value]
    if not isinstance(value, dict):
        raise ValueError(f"Unsupported checkpoint value: {type(value).__name__}")

    value_type = value.get(_VALUE_TYPE_KEY)
    if value_type == _BYTES_VALUE:
        return _decode_bytes(value.get("data"), "bytes value")
    if value_type == _BYTES_IO_VALUE:
        return BytesIO(_decode_bytes(value.get("data"), "BytesIO value"))
    if value_type == _TUPLE_VALUE:
        items = value.get("items")
        if not isinstance(items, list):
            raise ValueError("Tuple checkpoint value must contain an items list")
        return tuple(_decode_value(item) for item in items)
    if value_type == _DICT_VALUE:
        items = value.get("items")
        if not isinstance(items, list):
            raise ValueError("Dict checkpoint value must contain an items list")

        decoded: Dict[Any, Any] = {}
        for item in items:
            if not isinstance(item, list) or len(item) != 2:
                raise ValueError("Dict checkpoint item must be a key/value pair")
            decoded[_decode_value(item[0])] = _decode_value(item[1])
        return decoded

    raise ValueError("Unsupported checkpoint value type")


def _require_dict(value: object, context: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")
    return value


def _require_list(value: object, context: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{context} must be a list")
    return value


def _require_str(value: object, context: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    return value


def _require_bool(value: object, context: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{context} must be a boolean")
    return value


def _require_int(value: object, context: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{context} must be an integer")
    return value


def _request_callback_name(request: "Request") -> str | None:
    if request.callback is not None:
        return getattr(request.callback, "__name__", None)
    callback_name = getattr(request, "_callback_name", None)
    return callback_name if isinstance(callback_name, str) else None


def _request_to_json(request: "Request") -> Dict[str, Any]:
    fingerprint = request._fp
    return {
        "url": request.url,
        "sid": request.sid,
        "callback": _request_callback_name(request),
        "priority": request.priority,
        "dont_filter": request.dont_filter,
        "meta": _encode_value(request.meta),
        "retry_count": request._retry_count,
        "session_kwargs": _encode_value(request._session_kwargs),
        "fingerprint": _encode_value(fingerprint) if fingerprint is not None else None,
    }


def _request_from_json(value: object) -> "Request":
    from scrapling.spiders.request import Request

    payload = _require_dict(value, "request")
    callback_name = payload.get("callback")
    if callback_name is not None and not isinstance(callback_name, str):
        raise ValueError("request.callback must be a string or null")

    meta = _decode_value(payload.get("meta", {_VALUE_TYPE_KEY: _DICT_VALUE, "items": []}))
    if not isinstance(meta, dict):
        raise ValueError("request.meta must be a dict")

    session_kwargs = _decode_value(payload.get("session_kwargs", {_VALUE_TYPE_KEY: _DICT_VALUE, "items": []}))
    if not isinstance(session_kwargs, dict):
        raise ValueError("request.session_kwargs must be a dict")
    if any(not isinstance(key, str) for key in session_kwargs):
        raise ValueError("request.session_kwargs keys must be strings")

    request = Request(
        url=_require_str(payload.get("url"), "request.url"),
        sid=_require_str(payload.get("sid", ""), "request.sid"),
        callback=None,
        priority=_require_int(payload.get("priority", 0), "request.priority"),
        dont_filter=_require_bool(payload.get("dont_filter", False), "request.dont_filter"),
        meta=meta,
        _retry_count=_require_int(payload.get("retry_count", 0), "request.retry_count"),
        **session_kwargs,
    )

    fingerprint = payload.get("fingerprint")
    if fingerprint is not None:
        decoded_fingerprint = _decode_value(fingerprint)
        if not isinstance(decoded_fingerprint, bytes):
            raise ValueError("request.fingerprint must be bytes or null")
        request._fp = decoded_fingerprint

    if callback_name:
        request._callback_name = callback_name

    return request


def _checkpoint_to_json(data: CheckpointData) -> Dict[str, Any]:
    seen = [_encode_value(item) for item in data.seen]
    seen.sort(key=lambda item: json.dumps(item, sort_keys=True))
    return {
        "version": _CHECKPOINT_VERSION,
        "requests": [_request_to_json(request) for request in data.requests],
        "seen": seen,
    }


def _checkpoint_from_json(value: object) -> CheckpointData:
    payload = _require_dict(value, "checkpoint")
    if payload.get("version") != _CHECKPOINT_VERSION:
        raise ValueError("Unsupported checkpoint version")

    requests = [
        _request_from_json(request) for request in _require_list(payload.get("requests"), "checkpoint.requests")
    ]

    seen: set[bytes] = set()
    for item in _require_list(payload.get("seen"), "checkpoint.seen"):
        decoded = _decode_value(item)
        if not isinstance(decoded, bytes):
            raise ValueError("checkpoint.seen items must be bytes")
        seen.add(decoded)

    return CheckpointData(requests=requests, seen=seen)


class CheckpointManager:
    """Manages saving and loading checkpoint state to/from disk."""

    CHECKPOINT_FILE = "checkpoint.json"
    LEGACY_CHECKPOINT_FILE = "checkpoint.pkl"

    def __init__(self, crawldir: str | Path | AsyncPath, interval: float = 300.0):
        self.crawldir = AsyncPath(crawldir)
        self._checkpoint_path = self.crawldir / self.CHECKPOINT_FILE
        self._legacy_checkpoint_path = self.crawldir / self.LEGACY_CHECKPOINT_FILE
        self.interval = interval
        if not isinstance(interval, (int, float)):
            raise TypeError("Checkpoints interval must be integer or float.")
        else:
            if interval < 0:
                raise ValueError("Checkpoints interval must be equal or greater than 0.")

    async def has_checkpoint(self) -> bool:
        """Check if a checkpoint exists."""
        return await self._checkpoint_path.exists()

    async def save(self, data: CheckpointData) -> None:
        """Save checkpoint data to disk atomically."""
        await self.crawldir.mkdir(parents=True, exist_ok=True)

        temp_path = self._checkpoint_path.with_suffix(".tmp")

        try:
            serialized = json.dumps(_checkpoint_to_json(data), separators=(",", ":"), allow_nan=False).encode("utf-8")
            async with await anyio.open_file(temp_path, "wb") as f:
                await f.write(serialized)

            await temp_path.replace(self._checkpoint_path)

            log.info(f"Checkpoint saved: {len(data.requests)} requests, {len(data.seen)} seen URLs")
        except Exception as e:
            # Clean up temp file if it exists
            if await temp_path.exists():
                await temp_path.unlink()
            log.error(f"Failed to save checkpoint: {e}")
            raise

    async def load(self) -> Optional[CheckpointData]:
        """Load checkpoint data from disk.

        Returns None if no checkpoint exists or if loading fails.
        """
        if not await self.has_checkpoint():
            if await self._legacy_checkpoint_path.exists():
                log.error(
                    "Ignoring legacy pickle checkpoint for security; start a fresh crawl to create JSON checkpoint"
                )
            return None

        try:
            async with await anyio.open_file(self._checkpoint_path, "rb") as f:
                content = await f.read()
                data = _checkpoint_from_json(json.loads(content.decode("utf-8")))

            log.info(f"Checkpoint loaded: {len(data.requests)} requests, {len(data.seen)} seen URLs")
            return data

        except Exception as e:
            log.error(f"Failed to load checkpoint (starting fresh): {e}")
            return None

    async def cleanup(self) -> None:
        """Delete checkpoint file after successful completion."""
        try:
            if await self._checkpoint_path.exists():
                await self._checkpoint_path.unlink()
            if await self._legacy_checkpoint_path.exists():
                await self._legacy_checkpoint_path.unlink()
            log.debug("Checkpoint file cleaned up")
        except Exception as e:
            log.warning(f"Failed to cleanup checkpoint file: {e}")

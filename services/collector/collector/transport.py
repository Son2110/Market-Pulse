"""Bounded authenticated delivery transport shared by explicit collector commands."""

import hashlib
import json
import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import rfc8785

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def delivery_envelope(document: dict, delivery_id: str | None = None) -> dict:
    payload_digest = hashlib.sha256(rfc8785.dumps(document)).hexdigest()
    prefix = "observed" if document.get("schemaVersion") == "2.0.0" else "fixture"
    selected_id = delivery_id or f"{prefix}-{payload_digest}"
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", selected_id):
        raise ValueError("Invalid delivery ID")
    return {"deliveryId": selected_id, "payloadDigest": payload_digest, "payload": document}


def validate_submission_options(delivery_id: str | None = None, poll_seconds: int = 0) -> tuple[str, str]:
    if not isinstance(poll_seconds, int) or isinstance(poll_seconds, bool) or not 0 <= poll_seconds <= 60:
        raise ValueError("poll-seconds must be between 0 and 60")
    if delivery_id is not None and not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", delivery_id):
        raise ValueError("Invalid delivery ID")
    endpoint = os.environ.get("INGESTION_ENDPOINT", "")
    secret = os.environ.get("INGESTION_SECRET", "")
    parsed = urlsplit(endpoint)
    try:
        parsed.port
    except ValueError:
        raise ValueError("Invalid ingestion endpoint") from None
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != "/internal/ingestion/deliveries":
        raise ValueError("Invalid ingestion endpoint")
    if not parsed.hostname or not (parsed.scheme == "https" or (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1", "api"})):
        raise ValueError("Use HTTPS or the documented local ingestion host")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", secret):
        raise ValueError("INGESTION_SECRET must contain 64 hexadecimal characters")
    return endpoint, secret


def submit(document: dict, delivery_id: str | None = None, poll_seconds: int = 0) -> dict:
    endpoint, secret = validate_submission_options(delivery_id, poll_seconds)
    envelope = delivery_envelope(document, delivery_id)
    body = json.dumps(envelope, ensure_ascii=False, allow_nan=False).encode("utf-8")
    if len(body) > 1024 * 1024:
        raise ValueError("Submission exceeds 1 MiB")
    opener = build_opener(NoRedirect())

    def request(url: str, data: bytes | None = None) -> dict:
        req = Request(url, data=data, headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=5) as response:
                raw = response.read(65537)
                if len(raw) > 65536 or response.status not in (200, 202):
                    raise ValueError("Invalid ingestion response")
                result = json.loads(raw.decode("utf-8"))
        except HTTPError as error:
            raise ValueError(f"Ingestion HTTP status {error.code}") from None
        except (URLError, TimeoutError, OSError, UnicodeError, json.JSONDecodeError):
            raise ValueError("Ingestion request failed") from None
        if not isinstance(result, dict) or result.get("deliveryId") != envelope["deliveryId"] or result.get("payloadDigest") != envelope["payloadDigest"] or result.get("status") not in {"accepted", "queued", "running", "success", "failure"}:
            raise ValueError("Invalid ingestion receipt")
        counts = result.get("counts")
        if not isinstance(counts, dict) or any(not isinstance(counts.get(key), int) or isinstance(counts[key], bool) or counts[key] < 0 for key in ("assets", "observations")):
            raise ValueError("Invalid ingestion counts")
        return {"deliveryId": result["deliveryId"], "payloadDigest": result["payloadDigest"], "status": result["status"],
                "counts": {"assets": counts["assets"], "observations": counts["observations"]}}

    result = request(endpoint, body)
    deadline = time.monotonic() + poll_seconds
    while result["status"] not in {"success", "failure"} and time.monotonic() < deadline:
        time.sleep(min(0.25, max(0, deadline - time.monotonic())))
        result = request(f"{endpoint}/{envelope['deliveryId']}")
    return result



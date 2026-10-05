from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import rfc8785

from scripts.validate_market_data import validate_market_data


def read_fixture(path: Path) -> dict:
    try:
        raw = path.read_bytes()
        if len(raw) > 1024 * 1024:
            raise ValueError("Fixture exceeds 1 MiB")
        document = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_keys, parse_constant=reject_constant)
        safe_numbers(document)
        rfc8785.dumps(document)
    except (OSError, UnicodeError, ValueError, rfc8785.CanonicalizationError) as error:
        raise ValueError("Cannot read valid fixture JSON") from error
    errors = validate_market_data(document, fixture_only=True)
    if errors:
        raise ValueError("Fixture validation failed:\n" + "\n".join(f"- {error}" for error in errors))
    return document


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def reject_constant(_value):
    raise ValueError("Non-finite JSON number")


def safe_numbers(value):
    if isinstance(value, dict):
        for child in value.values():
            safe_numbers(child)
    elif isinstance(value, list):
        for child in value:
            safe_numbers(child)
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value) or (value == int(value) and abs(value) > 9007199254740991):
            raise ValueError("Unsafe JSON number")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def delivery_envelope(document: dict, delivery_id: str | None = None) -> dict:
    payload_digest = hashlib.sha256(rfc8785.dumps(document)).hexdigest()
    selected_id = delivery_id or f"fixture-{payload_digest}"
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", selected_id):
        raise ValueError("Invalid delivery ID")
    return {"deliveryId": selected_id, "payloadDigest": payload_digest, "payload": document}


def submit(document: dict, delivery_id: str | None = None, poll_seconds: int = 0) -> dict:
    endpoint = os.environ.get("INGESTION_ENDPOINT", "")
    secret = os.environ.get("INGESTION_SECRET", "")
    parsed = urlsplit(endpoint)
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != "/internal/ingestion/deliveries":
        raise ValueError("Invalid ingestion endpoint")
    if not parsed.hostname or not (parsed.scheme == "https" or (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1", "api"})):
        raise ValueError("Use HTTPS or the documented local ingestion host")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", secret):
        raise ValueError("INGESTION_SECRET must contain 64 hexadecimal characters")
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


def summarize(document: dict, path: Path) -> dict:
    providers = sorted({
        row["source"]["provider"]
        for group in ("candles", "quotes", "indexObservations")
        for row in document[group]
    })
    return {
        "fixture": path.as_posix(),
        "dataset": document["dataset"]["label"],
        "mode": document["dataset"]["mode"],
        "freshness": document["dataset"]["freshness"],
        "providers": providers,
        "recordCounts": {
            "assets": len(document["assets"]),
            "candles": len(document["candles"]),
            "quotes": len(document["quotes"]),
            "indexObservations": len(document["indexObservations"]),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate and summarize the synthetic market fixture.")
    parser.add_argument("fixture", type=Path, help="path to a contract-v1 fixture JSON file")
    parser.add_argument("--submit", action="store_true", help="explicitly submit to INGESTION_ENDPOINT with INGESTION_SECRET")
    parser.add_argument("--delivery-id", help="bounded idempotency key; default is fixture-<digest>")
    parser.add_argument("--poll-seconds", type=int, default=0, help="wait up to 0–60 seconds for terminal status")
    args = parser.parse_args(argv)
    try:
        document = read_fixture(args.fixture)
        if not 0 <= args.poll_seconds <= 60:
            raise ValueError("poll-seconds must be between 0 and 60")
        if args.submit:
            result = submit(document, args.delivery_id, args.poll_seconds)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 1 if result["status"] == "failure" else 0
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(summarize(document, args.fixture), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import rfc8785

from scripts.validate_market_data import validate_market_data
from collector.transport import delivery_envelope, submit


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

#!/usr/bin/env python3
"""Validate the synthetic gold contract offline; no provider or app imports."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal, localcontext
from pathlib import Path

import rfc8785
from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "packages/schemas/gold-quotes-v1.schema.json"
FIXTURE_PATH = ROOT / "fixtures/gold/mp-gold-synthetic.json"
MARKET_TZ = timezone(timedelta(hours=7))
POSITIVE = re.compile(r"(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?)")
SIGNED = re.compile(r"(?:0|-?(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?))")
FACTORS = {"thousand_vnd_per_chi": "10000", "thousand_vnd_per_tael": "1000", "vnd_per_tael": "1"}


def digest(value: object) -> str:
    return hashlib.sha256(rfc8785.dumps(value)).hexdigest()


def asset_identity(row: dict) -> list:
    return ["gold_asset", *[row[key] for key in ("provider", "brand", "product", "purity", "region")]]


def snapshot_identity(row: dict) -> list:
    time = row["time"]
    key = f"source:{time['sourceAsOf']}" if time["sourceAsOf"] is not None else f"observation:{time['collectedAt']}"
    return [row["assetId"], key]


def economic_content(row: dict) -> dict:
    return {"assetId": row["assetId"], "sourceAsOf": row["time"]["sourceAsOf"],
            "quotes": {key: row["quotes"][key] for key in ("buy", "sell", "spread", "currency", "unit")},
            "provenance": {key: row["provenance"][key] for key in
                           ("provider", "originalBuy", "originalSell", "originalUnit", "conversionFactor")}}


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    if parsed.isoformat(timespec="microseconds").replace("+00:00", "Z") != value:
        raise ValueError("timestamp must be canonical UTC with six fractional digits")
    return parsed


def validate_gold_quotes(document: object) -> list[str]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    errors = [f"/{'/'.join(map(str, error.absolute_path))}: {error.message}"
              for error in Draft202012Validator(schema).iter_errors(document)]
    if errors:
        return errors
    try:
        rfc8785.dumps(document)
    except (ValueError, rfc8785.CanonicalizationError) as error:
        return [f"invalid canonical JSON: {error}"]

    for index, row in enumerate(document["observations"]):
        prefix = f"/observations/{index}"

        def fail(message: str) -> None:
            errors.append(f"{prefix}: {message}")

        quotes, time, quality, provenance = [row[key] for key in ("quotes", "time", "qualityFlags", "provenance")]
        fields = [(quotes, key, SIGNED if key == "spread" else POSITIVE) for key in ("buy", "sell", "spread")]
        fields += [(provenance, key, POSITIVE) for key in ("originalBuy", "originalSell")]
        if any(obj[key] is not None and not pattern.fullmatch(obj[key]) for obj, key, pattern in fields):
            fail("noncanonical decimal string")
            continue
        try:
            collected = _timestamp(time["collectedAt"])
            source = _timestamp(time["sourceAsOf"]) if time["sourceAsOf"] is not None else None
            reference = (source or collected).astimezone(MARKET_TZ).date().isoformat()
        except (ValueError, OverflowError):
            fail("timestamp outside the canonical supported calendar")
            continue
        if source is not None and source > collected:
            fail("sourceAsOf must not be later than collectedAt")
        if time["referenceDate"] != reference or time["referenceDateType"] != ("source_date" if source is not None else "collected_date"):
            fail("reference date/type must follow source or collection in UTC+7")
        if quality["sourceTimestampStatus"] != ("verified" if source is not None else "unknown"):
            fail("source timestamp status disagrees with sourceAsOf")
        if ((row["region"] is not None) != (quality["regionStatus"] == "verified")
                or (quality["regionStatus"] == "not_applicable" and row["requestedRegion"] is not None)):
            fail("region status must honestly describe the applied region")
        if provenance["provider"] != row["provider"]:
            fail("provenance provider must match the series provider")
        factor = FACTORS[provenance["originalUnit"]]
        if provenance["conversionFactor"] != factor:
            fail("conversion factor does not match original unit")
        # Bounded 128-character inputs need at most 261 significant places for subtraction.
        with localcontext() as context:
            context.prec = 300
            for side in ("buy", "sell"):
                original = provenance[f"original{side.title()}"]
                if (original is None) != (quotes[side] is None):
                    fail(f"{side} and original side must be null together")
                elif original is not None and Decimal(quotes[side]) != Decimal(original) * Decimal(factor):
                    fail(f"{side} does not equal the exact unit conversion")
            complete = quotes["buy"] is not None and quotes["sell"] is not None
            spread = Decimal(quotes["sell"]) - Decimal(quotes["buy"]) if complete else None
            if ((spread is None) != (quotes["spread"] is None)
                    or (spread is not None and quotes["spread"] is not None and Decimal(quotes["spread"]) != spread)):
                fail("spread must be sell minus buy, or null when either side is missing")
            integrity = "spread_inverted" if spread is not None and spread < 0 else "valid"
            if quality["priceIntegrity"] != integrity:
                fail("price integrity must identify an inverted spread")
        if row["assetId"] != digest(asset_identity(row)):
            fail("asset identity mismatch")
        if row["snapshotId"] != digest(snapshot_identity(row)):
            fail("snapshot identity mismatch")
        if row["contentDigest"] != digest(economic_content(row)):
            fail("content digest mismatch")
    return errors


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON property: {key}")
        result[key] = value
    return result


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) == 2 else FIXTURE_PATH
    if len(sys.argv) > 2:
        print("Usage: python scripts/validate_gold_quotes.py [fixture.json]", file=sys.stderr)
        return 1
    try:
        document = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
        errors = validate_gold_quotes(document)
    except (OSError, ValueError) as error:
        errors = [str(error)]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(document['observations'])} synthetic gold observations offline (fixture / unknown).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

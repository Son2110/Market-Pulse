"""Validate the separate in-memory observed candle subset, without provider imports."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from jsonschema import Draft202012Validator
from scripts.validate_market_data import strict_format_checker


SCHEMA_PATH = Path(__file__).resolve().parents[1] / "packages/schemas/observed-candles-v2.schema.json"


def validate_observed_candles(document: object) -> list[str]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema, format_checker=strict_format_checker()).iter_errors(document))
    if errors:
        return ["observed schema violation"]
    request = document["request"]
    first, last = date.fromisoformat(request["start"]), date.fromisoformat(request["end"])
    result = []
    if not 0 <= (last - first).days <= 31:
        result.append("invalid date range")
    equity = request["symbol"] == "FPT"
    expected = {"assetId": f"VN:{'HOSE' if equity else 'INDEX'}:{request['symbol']}", "symbol": request["symbol"],
                "assetType": "equity" if equity else "index", "currency": "VND" if equity else None,
                "unit": "VND" if equity else "index_point", "timezone": "Asia/Ho_Chi_Minh"}
    if document["assets"][0] != expected:
        result.append("asset does not match request")
    previous = None
    for row in document["candles"]:
        day = date.fromisoformat(row["tradingDate"])
        if not first <= day <= last or (previous is not None and day <= previous):
            result.append("duplicate, unordered or out-of-range date")
        previous = day
        try:
            label = datetime.fromisoformat(row["providerTimeLabel"])
            if label.date() != day or label.tzinfo is not None:
                result.append("provider calendar label mismatch")
        except ValueError:
            result.append("invalid provider calendar label")
        if any(row[key] != expected[key] for key in ("assetId", "currency", "unit", "timezone")):
            result.append("candle asset/unit mismatch")
        if row["adjustmentBasis"] != ("unknown" if equity else "not_applicable"):
            result.append("unsupported adjustment basis")
        values = {key: Decimal(row[key]) for key in ("open", "high", "low", "close")}
        if any(value <= 0 for value in values.values()) or not values["low"] <= min(values["open"], values["close"]) <= max(values["open"], values["close"]) <= values["high"]:
            result.append("invalid OHLC")
        identity = ["KBS", *[row[key] for key in ("assetId", "interval", "tradingDate", "adjustmentBasis")]]
        if row["barId"] != hashlib.sha256(json.dumps(identity, separators=(",", ":")).encode()).hexdigest():
            result.append("bar identity mismatch")
        content = {key: value for key, value in row.items() if key not in {"collectedAt", "barId", "contentDigest"}}
        digest = hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        if row["contentDigest"] != digest:
            result.append("content digest mismatch")
    return result

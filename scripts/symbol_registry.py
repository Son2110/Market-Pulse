"""Shared observed-symbol registry; mirrors apps/api/src/symbol-registry.ts."""

from __future__ import annotations

import json
import re
from pathlib import Path


REGISTRY_PATH = Path(__file__).resolve().parents[1] / "packages/schemas/symbol-registry-v1.json"
_SYMBOL = re.compile(r"[A-Z0-9]{1,12}")
_EXCHANGES = {"HOSE", "HNX", "UPCOM", "INDEX"}


def _profile(entry: dict) -> dict:
    """Validate a raw symbol registry entry and derive its canonical asset profile."""
    index = entry["assetType"] == "index"
    hot_basket = entry.get("hotBasket")
    if (not isinstance(entry["symbol"], str) or not _SYMBOL.fullmatch(entry["symbol"]) or entry["exchange"] not in _EXCHANGES
            or entry["assetType"] not in {"equity", "index"} or index != (entry["exchange"] == "INDEX")
            or (hot_basket is not None and not isinstance(hot_basket, bool))):
        raise ValueError("invalid symbol registry entry")
    result = {"symbol": entry["symbol"], "assetType": "index" if index else "equity", "exchange": entry["exchange"],
              "assetId": f"VN:{entry['exchange']}:{entry['symbol']}", "currency": None if index else "VND",
              "unit": "index_point" if index else "VND", "adjustmentBasis": "not_applicable" if index else "unknown"}
    if hot_basket is not None:
        result["hotBasket"] = hot_basket
    return result


def create_registry(document: dict) -> dict[str, dict]:
    """Validate a registry document and derive each symbol's canonical profile."""
    if document.get("version") != 1 or not document.get("symbols"):
        raise ValueError("invalid symbol registry")
    profiles: dict[str, dict] = {}
    for entry in document["symbols"]:
        item = _profile(entry)
        if item["symbol"] in profiles:
            raise ValueError("duplicate symbol registry entry")
        profiles[item["symbol"]] = item
    return profiles


PROFILES = create_registry(json.loads(REGISTRY_PATH.read_text(encoding="utf-8")))
REGISTERED_SYMBOLS = tuple(PROFILES)


def symbol_profile(symbol: str) -> dict | None:
    """Return the canonical profile for a registered symbol, or None if unregistered."""
    return PROFILES.get(symbol)

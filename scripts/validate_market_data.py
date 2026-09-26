#!/usr/bin/env python3
"""Validate the committed MarketPulse market-data fixture offline."""

from __future__ import annotations

import json
import math
import re
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "packages/schemas/market-data-v1.schema.json"
FIXTURE_PATH = ROOT / "fixtures/market/mp-02-synthetic.json"
MARKET_TZ = timezone(timedelta(hours=7))
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATETIME_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


def strict_format_checker() -> FormatChecker:
    """Use strict stdlib checks so format validation has no optional dependency."""
    checker = FormatChecker()

    @checker.checks("date")
    def valid_date(value: object) -> bool:
        if not isinstance(value, str):
            return True
        if not DATE_PATTERN.fullmatch(value):
            return False
        try:
            return date.fromisoformat(value).isoformat() == value
        except ValueError:
            return False

    @checker.checks("date-time")
    def valid_datetime(value: object) -> bool:
        if not isinstance(value, str) or not DATETIME_PATTERN.fullmatch(value):
            return False
        offset = re.search(r"([+-])(\d{2}):(\d{2})$", value)
        if offset and (int(offset.group(2)) > 23 or int(offset.group(3)) > 59):
            return False
        if offset and offset.group(1) == "-" and offset.group(2, 3) == ("00", "00"):
            return False
        try:
            parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
        except ValueError:
            return False
        return parsed.tzinfo is not None and parsed.utcoffset() is not None

    return checker


def _schema_validator() -> Draft202012Validator:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=strict_format_checker())


def _pointer(path) -> str:
    parts = [str(part) for part in path]
    return "/" + "/".join(parts) if parts else "/"


def _as_date(value: str) -> date:
    return date.fromisoformat(value)


def _as_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)


def _decimal(value: object) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        return None
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def _finite_number_errors(value: object, path: str = "") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            errors.extend(_finite_number_errors(child, f"{path}/{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(_finite_number_errors(child, f"{path}/{index}"))
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and not math.isfinite(value):
            errors.append(f"{path or '/'}: numeric values must be finite")
    return errors


def _semantic_errors(document: dict, fixture_only: bool) -> list[str]:
    errors: list[str] = []

    def fail(path: str, message: str) -> None:
        errors.append(f"{path}: {message}")

    dataset = document["dataset"]
    if fixture_only:
        if dataset["mode"] != "fixture":
            fail("/dataset/mode", "fixture validation requires mode='fixture'")
        if dataset["label"] != "SYNTHETIC FIXTURE — NOT MARKET DATA":
            fail("/dataset/label", "fixture label must identify synthetic data")
        if dataset["freshness"] != "fixture / unknown":
            fail("/dataset/freshness", "fixture freshness must remain 'fixture / unknown'")
        if dataset["sessionCalendar"] != "unverified":
            fail("/dataset/sessionCalendar", "fixture session dates are not calendar-verified")

    assets_by_id: dict[str, dict] = {}
    seen_symbols: set[str] = set()
    for i, asset in enumerate(document["assets"]):
        path = f"/assets/{i}"
        asset_id = asset["assetId"]
        if asset_id in assets_by_id:
            fail(f"{path}/assetId", f"duplicate asset ID {asset_id!r}")
        else:
            assets_by_id[asset_id] = asset
        symbol = asset["symbol"]
        if symbol in seen_symbols:
            fail(f"{path}/symbol", f"duplicate symbol {symbol!r}")
        seen_symbols.add(symbol)
        if asset["assetType"] == "equity":
            if asset["currency"] != "VND" or asset["unit"] != "VND":
                fail(path, "equities must use currency VND and unit VND (not thousand-VND)")
            if asset["exchange"] == "INDEX":
                fail(f"{path}/exchange", "equities must identify a stock exchange")
        else:
            if asset["currency"] is not None or asset["unit"] != "index_point":
                fail(path, "indices must use null currency and unit index_point, never VND")
            if asset["exchange"] != "INDEX":
                fail(f"{path}/exchange", "indices must use exchange INDEX")
        if asset_id != f"VN:{asset['exchange']}:{symbol}":
            fail(f"{path}/assetId", "assetId must match VN:{exchange}:{symbol}")

    if fixture_only:
        expected_symbols = {"FPT", "VCB", "HPG", "VNM", "SSI", "VIC", "VHM", "MSN", "MWG", "BID", "VNINDEX"}
        if seen_symbols != expected_symbols or len(assets_by_id) != 11:
            fail("/assets", "fixture inventory must contain the ten named candidate symbols plus VNINDEX")
        for name, expected_count in (("candles", 33), ("quotes", 10), ("indexObservations", 1)):
            if len(document[name]) != expected_count:
                fail(f"/{name}", f"fixture must contain exactly {expected_count} records")

    observation_groups = (
        ("candles", document["candles"]),
        ("quotes", document["quotes"]),
        ("indexObservations", document["indexObservations"]),
    )
    all_observations: list[tuple[str, int, dict]] = []
    for group, observations in observation_groups:
        for i, row in enumerate(observations):
            path = f"/{group}/{i}"
            all_observations.append((group, i, row))
            asset = assets_by_id.get(row["assetId"])
            if asset is None:
                fail(f"{path}/assetId", f"unknown asset ID {row['assetId']!r}")
                continue
            if row["currency"] != asset["currency"] or row["unit"] != asset["unit"]:
                fail(path, "observation currency/unit must match its asset")
            if row["timezone"] != asset["timezone"]:
                fail(f"{path}/timezone", "observation timezone must match its asset")
            is_index = asset["assetType"] == "index"
            if group == "quotes" and is_index:
                fail(path, "quotes must reference an equity; use indexObservations for indices")
            if group == "indexObservations" and not is_index:
                fail(path, "indexObservations must reference an index")
            if row["adjustmentBasis"] == "not_applicable" and not is_index:
                fail(f"{path}/adjustmentBasis", "equity prices require an adjustment basis")
            if is_index and row["adjustmentBasis"] != "not_applicable":
                fail(f"{path}/adjustmentBasis", "index values use adjustmentBasis='not_applicable'")

            source = row["source"]
            if source["mode"] != dataset["mode"]:
                fail(f"{path}/source/mode", "source mode must match dataset mode")
            if fixture_only and (source["mode"] != "fixture" or source["provider"] != "marketpulse-fixture"):
                fail(f"{path}/source", "fixtures must use mode='fixture' and provider='marketpulse-fixture'")
            if fixture_only and not source["recordId"].startswith("synthetic-"):
                fail(f"{path}/source/recordId", "fixture source record IDs must be marked synthetic")

            as_of = _as_datetime(row["asOf"])
            ingested = _as_datetime(row["ingestedAt"])
            if as_of.astimezone(timezone.utc) > ingested.astimezone(timezone.utc):
                fail(f"{path}/ingestedAt", "ingestedAt must not be earlier than asOf")
            if as_of.astimezone(MARKET_TZ).date() != _as_date(row["tradingDate"]):
                fail(f"{path}/asOf", "asOf local date must match tradingDate in Asia/Ho_Chi_Minh")

            if group in ("candles", "quotes"):
                if is_index:
                    if row["volume"] is not None or row["volumeUnit"] != "not_available":
                        fail(path, "index volume must be null with volumeUnit='not_available'")
                elif not isinstance(row["volume"], int) or isinstance(row["volume"], bool) or row["volumeUnit"] != "shares":
                    fail(path, "equity volume must be a nonnegative integer measured in shares")

            if group == "candles":
                values = [_decimal(row[name]) for name in ("open", "high", "low", "close")]
                if all(value is not None for value in values):
                    open_value, high, low, close = values
                    if not (low <= open_value <= high and low <= close <= high):
                        fail(path, "OHLC must satisfy low <= open, close <= high")

    candles_by_series: dict[tuple, list[tuple[date, dict, int]]] = {}
    candle_keys: set[tuple] = set()
    for i, candle in enumerate(document["candles"]):
        source = candle["source"]
        key = (candle["assetId"], source["provider"], candle["interval"], candle["tradingDate"], candle["adjustmentBasis"])
        if key in candle_keys:
            fail(f"/candles/{i}", "duplicate candle identity (asset, provider, interval, date, adjustment)")
        candle_keys.add(key)
        series_key = (candle["assetId"], source["provider"], candle["interval"], candle["adjustmentBasis"])
        candles_by_series.setdefault(series_key, []).append((_as_date(candle["tradingDate"]), candle, i))
    for series_key, rows in candles_by_series.items():
        dates = [item[0] for item in rows]
        if dates != sorted(dates) or len(dates) != len(set(dates)):
            fail(f"/candles/{rows[0][2]}", f"candle dates must be strictly chronological within series {series_key[0]!r}")

    quote_keys: set[tuple] = set()
    index_keys: set[tuple] = set()
    for group, index, row in all_observations:
        if group == "candles":
            continue
        provider = row["source"]["provider"]
        key = (row["assetId"], provider, row["tradingDate"])
        seen = quote_keys if group == "quotes" else index_keys
        if key in seen:
            fail(f"/{group}/{index}", "duplicate observation identity (asset, provider, date)")
        seen.add(key)

        asset = assets_by_id.get(row["assetId"])
        if asset is None:
            continue
        basis = row["adjustmentBasis"]
        series_key = (row["assetId"], provider, "1d", basis)
        series = candles_by_series.get(series_key, [])
        date_value = _as_date(row["tradingDate"])
        matching = [(day, candle, ci) for day, candle, ci in series if day == date_value]
        if not matching:
            fail(f"/{group}/{index}/tradingDate", "observation must align with a daily candle")
            continue
        if date_value != max(day for day, _, _ in series):
            fail(f"/{group}/{index}/tradingDate", "quote/index observation must align with the latest candle")
        candle = matching[0][1]
        if _as_datetime(row["asOf"]).astimezone(timezone.utc) != _as_datetime(candle["asOf"]).astimezone(timezone.utc):
            fail(f"/{group}/{index}/asOf", "quote/index asOf must match the aligned candle asOf")
        value_field = "lastPrice" if group == "quotes" else "indexValue"
        if _decimal(row[value_field]) != _decimal(candle["close"]):
            fail(f"/{group}/{index}/{value_field}", "latest quote/index value must equal the matching candle close")
        if group == "quotes" and (row["volume"] != candle["volume"] or row["volumeUnit"] != candle["volumeUnit"]):
            fail(f"/{group}/{index}/volume", "quote volume must match the aligned candle")

        prior = [(day, prior_candle) for day, prior_candle, _ in series if day < date_value]
        prior.sort(key=lambda pair: pair[0])
        previous = prior[-1] if prior else None
        if previous is None:
            if row["previousTradingDate"] is not None or row["previousClose"] is not None:
                fail(f"/{group}/{index}/previousClose", "without a prior available candle the baseline date and close must be null")
            if row["change"] is not None or row["changePercent"] is not None:
                fail(f"/{group}/{index}/change", "change fields must be null when previousClose is null")
        else:
            prior_date, prior_candle = previous
            if row["previousTradingDate"] != prior_date.isoformat():
                fail(f"/{group}/{index}/previousTradingDate", "baseline must identify the prior available candle; do not fill calendar gaps")
            expected_close = _decimal(prior_candle["close"])
            actual_close = _decimal(row["previousClose"])
            if actual_close != expected_close:
                fail(f"/{group}/{index}/previousClose", "baseline must equal the identified prior candle close")
            current = _decimal(row[value_field])
            actual_change = _decimal(row["change"])
            actual_percent = _decimal(row["changePercent"])
            if current is not None and expected_close is not None:
                try:
                    expected_change = current - expected_close
                    expected_percent = (expected_change / expected_close * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                except (InvalidOperation, ArithmeticError):
                    fail(f"/{group}/{index}/changePercent", "values exceed supported decimal precision for derived changes")
                    continue
                if actual_change != expected_change:
                    fail(f"/{group}/{index}/change", "change must equal current value minus previousClose")
                if actual_percent != expected_percent:
                    fail(f"/{group}/{index}/changePercent", "changePercent must be the percent change rounded half-up to 2 decimals")

    return errors


def validate_market_data(document: object, *, fixture_only: bool = True) -> list[str]:
    """Return schema and cross-record contract errors for a document."""
    validator = _schema_validator()
    schema_errors = sorted(validator.iter_errors(document), key=lambda error: (list(error.absolute_path), error.message))
    finite_errors = _finite_number_errors(document)
    if finite_errors:
        return finite_errors
    errors = [f"{_pointer(error.absolute_path)}: {error.message}" for error in schema_errors]
    if errors:
        return errors
    errors.extend(_semantic_errors(document, fixture_only))
    return errors


def _reject_constant(value: str):
    raise ValueError(f"non-standard JSON numeric constant {value!r} is not permitted")


def main() -> int:
    try:
        document = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"), parse_constant=_reject_constant)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Cannot read market fixture: {error}", file=sys.stderr)
        return 1
    try:
        errors = validate_market_data(document, fixture_only=True)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Cannot load market-data schema: {error}", file=sys.stderr)
        return 1
    if errors:
        print(f"Market-data validation failed for {FIXTURE_PATH.relative_to(ROOT)}:")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    print(f"Market-data schema and synthetic fixture are valid: {FIXTURE_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Optional, bounded KBS daily candles; never imported by the fixture collector."""

from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import json
import multiprocessing
import os
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from scripts.validate_observed_candles import validate_observed_candles


VERSIONS = {"vnstock": "4.0.8", "vnai": "2.6.2"}
SYMBOLS = {"FPT", "VNINDEX"}
LABEL = "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN"


class AdapterError(ValueError):
    def __init__(self, code: str, metadata: dict | None = None):
        self.code = code
        self.metadata = metadata or {}
        super().__init__(code)


def validate_request(symbol: str, start: str, end: str, interval: str = "1d") -> None:
    if symbol not in SYMBOLS or interval != "1d":
        raise AdapterError("unsupported_request")
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        if first.isoformat() != start or last.isoformat() != end or not 0 <= (last - first).days <= 31:
            raise ValueError
    except (TypeError, ValueError):
        raise AdapterError("invalid_date_range") from None


def decimal_text(value: object) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise AdapterError("invalid_provider_number")
    lexical = str(value)
    if len(lexical) > 128:
        raise AdapterError("invalid_provider_number")
    try:
        number = Decimal(lexical)
    except InvalidOperation:
        raise AdapterError("invalid_provider_number") from None
    if not number.is_finite() or number <= 0 or not -32 <= number.as_tuple().exponent <= 32 or len(number.as_tuple().digits) > 64:
        raise AdapterError("invalid_provider_number")
    return format(number, "f").rstrip("0").rstrip(".") if "." in format(number, "f") else format(number, "f")


def provider_date(value: object) -> str:
    # Keep the naive label verbatim; its clock time is not a source as-of.
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?", value):
        raise AdapterError("invalid_provider_time")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise AdapterError("invalid_provider_time") from None
    return parsed.date().isoformat()


def normalize_rows(rows: object, symbol: str, start: str, end: str, collected_at: str) -> dict:
    validate_request(symbol, start, end)
    if not isinstance(rows, list) or len(rows) > 32:
        raise AdapterError("malformed_provider_response")
    equity = symbol == "FPT"
    asset = {"assetId": f"VN:{'HOSE' if equity else 'INDEX'}:{symbol}", "symbol": symbol,
             "assetType": "equity" if equity else "index", "currency": "VND" if equity else None,
             "unit": "VND" if equity else "index_point", "timezone": "Asia/Ho_Chi_Minh"}
    candles = []
    for raw in rows:
        if not isinstance(raw, dict) or not {"t", "o", "h", "l", "c"} <= raw.keys():
            raise AdapterError("malformed_provider_response")
        trading_date = provider_date(raw["t"])
        candle = {"assetId": asset["assetId"], "tradingDate": trading_date, "interval": "1d",
                  "currency": asset["currency"], "unit": asset["unit"], "timezone": asset["timezone"],
                  "adjustmentBasis": "unknown" if equity else "not_applicable",
                  **{key: decimal_text(raw[field]) for key, field in (("open", "o"), ("high", "h"), ("low", "l"), ("close", "c"))},
                  "volume": None, "volumeUnit": "not_available",
                  "providerTimeLabel": raw["t"], "timeProvenance": "provider_naive_calendar_label",
                  "sourceAsOf": None, "collectedAt": collected_at,
                  "source": {"provider": "KBS", "connector": "vnstock", "connectorVersion": VERSIONS["vnstock"],
                             "dependencyVersion": VERSIONS["vnai"], "mode": "observed"}}
        # Stable identity and content exclude retrieval time; revisions remain detectable.
        identity = [candle[key] for key in ("assetId", "interval", "tradingDate", "adjustmentBasis")]
        candle["barId"] = hashlib.sha256(json.dumps(["KBS", *identity], separators=(",", ":")).encode()).hexdigest()
        candle["contentDigest"] = content_digest(candle)
        candles.append(candle)
    candles.sort(key=lambda row: row["tradingDate"])
    document = {"schemaVersion": "2.0.0", "dataset": {"mode": "observed", "label": LABEL,
                 "freshness": "unknown", "sessionCalendar": "unverified"},
                "request": {"symbol": symbol, "start": start, "end": end, "interval": "1d"},
                "assets": [asset], "candles": candles}
    if validate_observed_candles(document):
        raise AdapterError("invalid_observed_contract")
    return document


def content_digest(candle: dict) -> str:
    content = {key: value for key, value in candle.items() if key not in {"collectedAt", "barId", "contentDigest"}}
    return hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def error_code(error: BaseException) -> str:
    kind = type(error).__name__
    if isinstance(error, AdapterError):
        return error.code
    if isinstance(error, (ImportError, importlib.metadata.PackageNotFoundError)):
        return "provider_not_installed"
    if isinstance(error, SystemExit) or kind in {"RateLimitedError", "RateLimitExceeded"}:
        return "rate_limited"
    if kind in {"DataSourceBlockedError", "ChallengeRequiredError", "AccessDeniedError", "CircuitOpenError"}:
        return "access_blocked"
    if isinstance(error, (TimeoutError, ConnectionError, OSError)):
        return "provider_transport_error"
    if isinstance(error, (ValueError, TypeError)):
        return "malformed_provider_response"
    return "provider_error"


def unique_keys(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise AdapterError("malformed_provider_response")
        result[key] = value
    return result


def reject_constant(value: str) -> None:
    raise AdapterError("malformed_provider_response")


def row_metadata(rows: object) -> dict:
    if not isinstance(rows, list) or len(rows) > 32 or any(not isinstance(row, dict) for row in rows):
        raise AdapterError("malformed_provider_response")
    return {"providerFieldTypes": {key: sorted({type(row.get(key)).__name__ for row in rows})
                                   for key in ("t", "o", "h", "l", "c", "v", "va") if any(key in row for row in rows)},
            "providerTimeFormat": sorted({"yyyy-MM-dd HH:mm" if isinstance(row.get("t"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", row["t"])
                                          else "other" for row in rows})}


def _collect_once(symbol: str, start: str, end: str) -> tuple[dict, dict]:
    os.environ["VNSTOCK_DISABLE_AGENT_SETUP"] = "1"
    os.environ["VNSTOCK_TELEMETRY"] = "off"
    installed = {name: importlib.metadata.version(name) for name in VERSIONS}
    if installed != VERSIONS:
        raise AdapterError("unsupported_provider_version")
    from tenacity import stop_after_attempt
    from vnstock.common.data import Quote
    from vnstock.config import Config

    Config.RETRY_AFTER_MAX_WAIT = 0
    quote = Quote(symbol=symbol, source="KBS")
    if quote.source != "KBS" or quote.data_source.data_source != "KBS":
        raise AdapterError("unexpected_provider")
    started = datetime.now(timezone.utc)
    try:
        raw = quote.history.retry_with(stop=stop_after_attempt(1))(
            quote, start=start, end=end, interval="1D", to_df=False, floating=None)
    except BaseException as error:
        finished = datetime.now(timezone.utc)
        raise AdapterError(error_code(error), {"requestStartedAt": started.isoformat(), "requestFinishedAt": finished.isoformat(),
                           "versions": installed, "errorType": type(error).__name__,
                           "causeType": type(error.__cause__).__name__ if error.__cause__ else None}) from None
    finished = datetime.now(timezone.utc)
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > 65536:
        raise AdapterError("malformed_provider_response")
    rows = json.loads(raw, parse_float=Decimal, object_pairs_hook=unique_keys, parse_constant=reject_constant)
    metadata = {"requestStartedAt": started.isoformat(), "requestFinishedAt": finished.isoformat(),
                "durationSeconds": round((finished - started).total_seconds(), 3), "versions": installed,
                **row_metadata(rows)}
    try:
        document = normalize_rows(rows, symbol, start, end, finished.isoformat())
    except AdapterError as error:
        raise AdapterError(error.code, {**metadata, "receivedRows": len(rows)}) from None
    metadata["invariantsValid"] = True
    return document, metadata


def _child(send, symbol: str, start: str, end: str) -> None:
    with open(os.devnull, "w") as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
        try:
            send.send((True, _collect_once(symbol, start, end)))
        except BaseException as error:
            send.send((False, (error_code(error), error.metadata if isinstance(error, AdapterError) else {})))
        finally:
            send.close()


def collect(symbol: str, start: str, end: str, *, timeout_seconds: int = 45) -> tuple[dict, dict]:
    """One library call in an isolated process with a hard wall-clock bound."""
    validate_request(symbol, start, end)
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int) or not 1 <= timeout_seconds <= 60:
        raise AdapterError("invalid_timeout")
    context = multiprocessing.get_context("spawn")
    receive, send = context.Pipe(duplex=False)
    process = context.Process(target=_child, args=(send, symbol, start, end))
    try:
        try:
            process.start()
        except OSError:
            raise AdapterError("provider_process_error") from None
        send.close()
        if not receive.poll(timeout_seconds):
            raise AdapterError("provider_timeout")
        try:
            ok, result = receive.recv()
        except EOFError:
            raise AdapterError("provider_process_error") from None
        if not ok:
            raise AdapterError(*result)
        return result
    finally:
        receive.close()
        send.close()
        if process.pid is not None and process.is_alive():
            process.terminate()
        if process.pid is not None:
            process.join(timeout=2)
            if process.is_alive():
                process.kill()
                process.join(timeout=2)


def summarize(document: dict, metadata: dict) -> dict:
    dates = [row["tradingDate"] for row in document["candles"]]
    return {"status": "available" if dates else "no_data", "schemaVersion": document["schemaVersion"],
            "provider": "KBS", "dataset": document["dataset"], "request": document["request"],
            "recordCounts": {"assets": len(document["assets"]), "candles": len(dates)},
            "returnedDateRange": {"first": min(dates) if dates else None, "last": max(dates) if dates else None},
            "sourceAsOf": None, "volumeAvailable": False, **metadata}

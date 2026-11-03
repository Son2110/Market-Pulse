"""Explicit, single-date local EOD foundation; no scheduler or durable spool."""

from __future__ import annotations

import copy
import socket
from datetime import datetime, timezone

from collector.transport import delivery_envelope, submit, validate_submission_options
from collector.vnstock_adapter import AdapterError, collect, error_code, validate_request


LOCK_ADDRESS = ("127.0.0.1", 47831)
SYMBOLS = ("FPT", "VNINDEX")
SAFE_PROVIDER_ERRORS = frozenset({
    "provider_not_installed", "rate_limited", "access_blocked", "provider_transport_error",
    "malformed_provider_response", "provider_error", "unsupported_provider_version",
    "unexpected_provider", "provider_process_error", "provider_timeout", "invalid_observed_contract",
    "invalid_provider_number", "invalid_provider_time",
})


class EodError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class LocalRunLock:
    """A bind-only lease shared by cooperating runs in one host network namespace."""

    def __init__(self, *, _address: tuple[str, int] = LOCK_ADDRESS):
        self._address = _address
        self._socket = None

    def __enter__(self):
        lease = None
        try:
            lease = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            lease.set_inheritable(False)
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                lease.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            lease.bind(self._address)
        except OSError:
            if lease is not None:
                lease.close()
            raise EodError("overlap_lock_unavailable") from None
        self._socket = lease
        return self

    def __exit__(self, *_):
        if self._socket is not None:
            self._socket.close()
            self._socket = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate(enable_eod: bool, target_date: str, submit_enabled: bool,
              poll_seconds: int | None, delivery_retries: int | None) -> tuple[int, int]:
    if enable_eod is not True:
        raise EodError("eod_opt_in_required")
    try:
        validate_request("FPT", target_date, target_date)
    except AdapterError:
        raise EodError("invalid_target_date") from None
    if not isinstance(submit_enabled, bool):
        raise EodError("invalid_submission_configuration")
    if not submit_enabled and (poll_seconds is not None or delivery_retries is not None):
        raise EodError("submit_required")
    poll = 0 if poll_seconds is None else poll_seconds
    retries = 0 if delivery_retries is None else delivery_retries
    if isinstance(retries, bool) or not isinstance(retries, int) or retries not in (0, 1):
        raise EodError("invalid_delivery_retries")
    if submit_enabled:
        try:
            validate_submission_options(poll_seconds=poll)
        except ValueError:
            raise EodError("invalid_submission_configuration") from None
    return poll, retries


def _deliver(document: dict, poll: int, retries: int) -> dict:
    # Identity and collection time remain unchanged throughout in-memory recovery.
    envelope = delivery_envelope(document)
    outcome = {"state": "unknown", "deliveryId": envelope["deliveryId"],
               "payloadDigest": envelope["payloadDigest"], "attempts": 0}
    for attempt in range(retries + 1):
        outcome["attempts"] = attempt + 1
        try:
            receipt = submit(document, envelope["deliveryId"], poll)
        except ValueError as error:
            outcome["errorCode"] = "submission_unacknowledged"
            # The shared transport exposes only this fixed request-failure category.
            if str(error) == "Ingestion request failed":
                continue
            return outcome
        outcome.pop("errorCode", None)
        outcome["state"] = {"success": "persisted", "failure": "failed"}.get(receipt["status"], "pending")
        outcome["receiptStatus"] = receipt["status"]
        outcome["counts"] = receipt["counts"]
        return outcome
    return outcome


def _status(results: list[dict], submit_enabled: bool) -> str:
    collected = [row for row in results if row["collection"]["state"] == "collected"]
    if len(collected) != len(SYMBOLS):
        if collected:
            return "partial"
        return "no_data" if all(row["collection"]["state"] == "no_data" for row in results) else "failed"
    if not submit_enabled:
        return "collected"
    states = [row["delivery"]["state"] for row in results]
    if all(state == "persisted" for state in states):
        return "persisted"
    if "unknown" in states:
        return "unknown"
    if "failed" in states:
        return "failed" if all(state == "failed" for state in states) else "partial"
    return "pending"


def run(*, enable_eod: bool = False, target_date: str, submit_enabled: bool = False,
        poll_seconds: int | None = None, delivery_retries: int | None = None) -> dict:
    """Collect each symbol once; optional delivery recovery never recollects it."""
    poll, retries = _validate(enable_eod, target_date, submit_enabled, poll_seconds, delivery_retries)
    results = []
    started = _now()
    with LocalRunLock():
        stop = False
        for symbol in SYMBOLS:
            result = {"symbol": symbol, "collection": {"state": "skipped"},
                      "delivery": {"state": "not_submitted", "attempts": 0}}
            results.append(result)
            if stop:
                result["collection"]["errorCode"] = "previous_collection_failed"
                continue
            collection_started = _now()
            try:
                document, _metadata = collect(symbol, target_date, target_date, timeout_seconds=45)
            except Exception as error:
                code = error_code(error)
                result["collection"] = {"state": "failed", "startedAt": collection_started,
                                        "finishedAt": _now(),
                                        "errorCode": code if code in SAFE_PROVIDER_ERRORS else "provider_error"}
                stop = True
                continue
            retained = copy.deepcopy(document)
            count = len(retained["candles"])
            result["collection"] = {"state": "collected" if count else "no_data",
                                    "startedAt": collection_started, "finishedAt": _now(),
                                    "counts": {"assets": len(retained["assets"]), "candles": count}}
            if submit_enabled and count:
                result["delivery"] = _deliver(retained, poll, retries)
    return {"status": _status(results, submit_enabled), "provider": "KBS", "targetDate": target_date,
            "timezone": "Asia/Ho_Chi_Minh", "sourceAsOf": None, "freshness": "unknown",
            "sessionCalendar": "unverified", "startedAt": started, "finishedAt": _now(), "symbols": results}

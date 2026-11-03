"""Opt-in local collect/persist/read diagnostic; market values stay in memory."""

from __future__ import annotations

import argparse
import contextlib
import importlib.metadata
import io
import json
import os
import re
import subprocess
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener

from collector.eod_runner import EodError, run
from collector.transport import NoRedirect, validate_submission_options
from collector.vnstock_adapter import VERSIONS, validate_request


def local_origin(endpoint: str) -> str:
    try:
        parsed = urlsplit(endpoint)
        port = parsed.port
    except ValueError:
        raise EodError("invalid_local_endpoint") from None
    if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "::1"}
            or not port or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path != "/internal/ingestion/deliveries"):
        raise EodError("loopback_endpoint_required")
    return f"http://{parsed.netloc}"


def read_json(url: str, *, allow_missing: bool = False, missing_error: str = "asset_not_found",
              auth_secret: str | None = None) -> tuple[int, dict]:
    # Only the explicit ingestion auth probe receives a bearer; proxies are disabled.
    headers = {"Authorization": f"Bearer {auth_secret}"} if auth_secret is not None else {}
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(Request(url, headers=headers), timeout=5) as response:
            raw = response.read(65537)
            if response.status != 200 or len(raw) > 65536:
                raise EodError("invalid_local_response")
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise EodError("invalid_local_response")
            return response.status, result
    except HTTPError as error:
        if allow_missing and error.code == 404:
            try:
                raw = error.read(65537)
                if len(raw) <= 65536 and json.loads(raw) == {"error": missing_error}:
                    return 404, {"error": missing_error}
            except (ValueError, UnicodeError, OSError):
                pass
        raise EodError("local_read_failed") from None
    except (URLError, OSError, ValueError, UnicodeError):
        raise EodError("local_read_failed") from None


def container_id(project: str, service: str) -> str:
    if not re.fullmatch(r"mp-eod-diagnostic-[a-z0-9-]{1,40}", project):
        raise EodError("diagnostic_project_required")
    try:
        result = subprocess.run(["docker", "ps", "--filter", f"label=com.docker.compose.project={project}",
                                 "--filter", f"label=com.docker.compose.service={service}", "--format", "{{.ID}}"],
                                capture_output=True, text=True, timeout=10, check=True)
        ids = result.stdout.split()
        if len(ids) != 1 or not re.fullmatch(r"[a-f0-9]{12,64}", ids[0]):
            raise EodError("worker_not_ready")
        return ids[0]
    except (OSError, subprocess.SubprocessError):
        raise EodError("diagnostic_stack_not_ready") from None


def stack_ready(project: str, origin: str) -> None:
    api = container_id(project, "api")
    worker = container_id(project, "worker")
    endpoint = urlsplit(origin)
    try:
        result = subprocess.run(["docker", "inspect", api, "--format", "{{json .NetworkSettings.Ports}}"],
                                capture_output=True, text=True, timeout=10, check=True)
        ports = json.loads(result.stdout)
        expected = {"HostIp": endpoint.hostname, "HostPort": str(endpoint.port)}
        if not isinstance(ports, dict) or expected not in (ports.get("3001/tcp") or []):
            raise EodError("diagnostic_api_mismatch")
        subprocess.run(["docker", "exec", worker, "node", "-e",
                        "fetch('http://127.0.0.1:3002/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                       capture_output=True, timeout=10, check=True)
    except (OSError, ValueError, subprocess.SubprocessError):
        raise EodError("worker_not_ready") from None


def preflight(*, enabled: bool, target_date: str, project: str) -> str:
    if enabled is not True:
        raise EodError("diagnostic_opt_in_required")
    try:
        validate_request("FPT", target_date, target_date)
        endpoint, secret = validate_submission_options(poll_seconds=60)
    except ValueError:
        raise EodError("invalid_diagnostic_configuration") from None
    origin = local_origin(endpoint)
    stack_ready(project, origin)
    auth_status, _ = read_json(endpoint + "/diagnostic-preflight-" + uuid.uuid4().hex,
                               allow_missing=True, missing_error="not_found", auth_secret=secret)
    if auth_status != 404:
        raise EodError("ingestion_auth_probe_failed")
    os.environ["VNSTOCK_DISABLE_AGENT_SETUP"] = "1"
    os.environ["VNSTOCK_TELEMETRY"] = "off"
    try:
        if {name: importlib.metadata.version(name) for name in VERSIONS} != VERSIONS:
            raise EodError("unsupported_provider_version")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            from vnstock.common.data import Quote  # noqa: F401
            from vnstock.config import Config  # noqa: F401
            import tenacity  # noqa: F401
            import jsonschema  # noqa: F401
            import rfc8785  # noqa: F401
    except (ImportError, importlib.metadata.PackageNotFoundError):
        raise EodError("diagnostic_dependency_missing") from None
    capabilities = read_json(origin + "/health/capabilities")[1].get("capabilities", {})
    if not isinstance(capabilities, dict) or any(capabilities.get(name) != "ready" for name in
                                               ("observedRead", "ingestionAcceptance", "queueDispatch")):
        raise EodError("local_capabilities_not_ready")
    read_json(origin + "/health/ready/ingestion")
    # A diagnostic starts with no selected bars, preventing previous data from passing.
    for symbol in ("FPT", "VNINDEX"):
        status, history = read_json(f"{origin}/api/observed/assets/{symbol}/history?from={target_date}&to={target_date}", allow_missing=True)
        if status != 404 and (not isinstance(history.get("data"), dict)
                              or history["data"].get("candles") != []):
            raise EodError("diagnostic_target_not_empty")
    return origin


def verify_document(origin: str, document: dict, delivery: dict) -> dict:
    request = document["request"]
    path = f"{origin}/api/observed/assets/{request['symbol']}"
    query = f"?from={request['start']}&to={request['end']}"
    try:
        history = read_json(path + "/history" + query)[1]
        status = read_json(path + "/collection-status" + query)[1]
        data, meta, collection = history.get("data", {}), history.get("meta", {}), status.get("meta", {})
        if any(not isinstance(value, dict) for value in (data, meta, collection)):
            raise EodError("invalid_local_response")
        count = len(document["candles"])
        checks = {
            "exactCandles": data.get("candles") == document["candles"],
            "exactAsset": data.get("asset") == document["assets"][0],
            "exactDataset": data.get("dataset") == document["dataset"],
            "receiptCounts": delivery.get("counts") == {"assets": len(document["assets"]), "observations": count},
            "historyMetadata": (meta.get("status") == "available" and meta.get("provider") == "KBS"
                                and meta.get("interval") == "1d" and "sourceAsOf" in meta
                                and meta["sourceAsOf"] is None and meta.get("completeness") == "unknown"
                                and meta.get("requestedRange") == {"from": request["start"], "to": request["end"]}),
            "collectionMetadata": (collection.get("selectedCandleCount") == count
                                   and collection.get("candleCountsByDeliveryStatus") == {
                                       "accepted": 0, "queued": 0, "running": 0, "success": count,
                                       "failure": 0, "unknown": 0}
                                   and collection.get("freshness") == "unknown"
                                   and collection.get("sessionCalendar") == "unverified"
                                   and "sourceAsOf" in collection and collection["sourceAsOf"] is None),
        }
        return {"state": "verified" if all(checks.values()) else "mismatch", "checks": checks,
                "comparedCandleCount": count}
    except EodError:
        return {"state": "failed", "errorCode": "local_read_failed"}


def diagnose(*, enabled: bool, target_date: str, project: str) -> dict:
    origin = preflight(enabled=enabled, target_date=target_date, project=project)
    result = run(enable_eod=True, target_date=target_date, submit_enabled=True, poll_seconds=60, delivery_retries=0,
                 verify_persisted=lambda document, delivery: verify_document(origin, document, delivery))
    verified = result["status"] == "persisted" and all(row.get("verification", {}).get("state") == "verified" for row in result["symbols"])
    result["diagnosticVerified"] = verified
    if result["status"] == "persisted" and not verified:
        result["status"] = "verification_failed"
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enable-local-diagnostic", action="store_true")
    parser.add_argument("--target-date", required=True)
    parser.add_argument("--compose-project", required=True)
    args = parser.parse_args(argv)
    try:
        result = diagnose(enabled=args.enable_local_diagnostic, target_date=args.target_date, project=args.compose_project)
    except EodError as error:
        result = {"status": "failed", "diagnosticVerified": False, "errorCode": error.code}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("diagnosticVerified") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Offline diagnostic checks; real provider acceptance is a separate manual run."""

import contextlib
import copy
import json
import os
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT), str(ROOT / "services/collector")]
from collector import eod_diagnostic as diagnostic
from collector import eod_runner as runner
from collector.eod_runner import EodError
from collector.transport import delivery_envelope, submit
from collector.vnstock_adapter import normalize_rows


TARGET = "2026-11-02"
ORIGIN = "http://127.0.0.1:3029"


def sample():
    document = normalize_rows([{"t": TARGET + " 07:00", "o": "1200.123456789",
                               "h": "1500", "l": "1000", "c": "1300"}],
                              "FPT", TARGET, TARGET, TARGET + "T10:00:00.123456+00:00")
    history = {"data": {"asset": copy.deepcopy(document["assets"][0]),
                        "dataset": copy.deepcopy(document["dataset"]),
                        "candles": copy.deepcopy(document["candles"])},
               "meta": {"status": "available", "provider": "KBS", "interval": "1d",
                        "sourceAsOf": None, "completeness": "unknown",
                        "requestedRange": {"from": TARGET, "to": TARGET}}}
    status = {"meta": {"selectedCandleCount": 1, "freshness": "unknown", "sessionCalendar": "unverified",
                       "sourceAsOf": None, "candleCountsByDeliveryStatus": {
                           "accepted": 0, "queued": 0, "running": 0, "success": 1, "failure": 0, "unknown": 0}}}
    delivery = {"counts": {"assets": 1, "observations": 1}}
    return document, history, status, delivery


@contextlib.contextmanager
def local_server(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


class DiagnosticTests(unittest.TestCase):
    def test_remote_ambiguous_and_credential_urls_rejected(self):
        for endpoint in ("https://127.0.0.1:3029/internal/ingestion/deliveries",
                         "http://localhost:3029/internal/ingestion/deliveries",
                         "http://api:3001/internal/ingestion/deliveries",
                         "http://127.0.0.1:3029/internal/ingestion/deliveries?token=secret",
                         "http://user:secret@127.0.0.1:3029/internal/ingestion/deliveries",
                         "http://127.0.0.1:bad/internal/ingestion/deliveries"):
            with self.subTest(endpoint=endpoint), self.assertRaises(EodError):
                diagnostic.local_origin(endpoint)
        self.assertEqual(diagnostic.local_origin(ORIGIN + "/internal/ingestion/deliveries"), ORIGIN)

    def test_preflight_failure_never_runs_provider(self):
        with patch.object(diagnostic, "run") as run, self.assertRaises(EodError):
            diagnostic.diagnose(enabled=False, target_date=TARGET, project="anything")
        run.assert_not_called()
        with patch.object(diagnostic, "preflight", side_effect=EodError("worker_not_ready")), \
                patch.object(diagnostic, "run") as run, self.assertRaises(EodError):
            diagnostic.diagnose(enabled=True, target_date=TARGET, project="mp-eod-diagnostic-test")
        run.assert_not_called()

    def test_exact_comparison_and_safe_output(self):
        document, history, status, delivery = sample()
        with patch.object(diagnostic, "read_json", side_effect=[(200, history), (200, status)]):
            result = diagnostic.verify_document(ORIGIN, document, delivery)
        self.assertEqual(result["state"], "verified")
        self.assertTrue(all(result["checks"].values()))
        output = json.dumps(result)
        for sensitive in ("1200.123456789", document["candles"][0]["barId"], document["candles"][0]["contentDigest"]):
            self.assertNotIn(sensitive, output)

    def test_changed_values_digest_nulls_and_counts_fail_comparison(self):
        for field, value in (("open", "1200.123456788"), ("barId", "wrong"), ("contentDigest", "wrong"),
                             ("sourceAsOf", TARGET + "T07:00:00Z"), ("volume", "0"),
                             ("collectedAt", TARGET + "T10:00:00+00:00")):
            document, history, status, delivery = sample()
            history["data"]["candles"][0][field] = value
            with self.subTest(field=field), patch.object(diagnostic, "read_json", side_effect=[(200, history), (200, status)]):
                self.assertEqual(diagnostic.verify_document(ORIGIN, document, delivery)["state"], "mismatch")
        for kind in ("receipt", "history", "status"):
            document, history, status, delivery = sample()
            if kind == "receipt":
                delivery["counts"]["observations"] = 0
            elif kind == "history":
                del history["meta"]["sourceAsOf"]
            else:
                status["meta"]["candleCountsByDeliveryStatus"]["success"] = 0
            with self.subTest(kind=kind), patch.object(diagnostic, "read_json", side_effect=[(200, history), (200, status)]):
                self.assertEqual(diagnostic.verify_document(ORIGIN, document, delivery)["state"], "mismatch")

    def test_persisted_requires_two_verified_reads_and_fixed_budget(self):
        for states in (("verified", "verified"), ("verified", "mismatch"), (None, None)):
            result = {"status": "persisted", "symbols": [{"verification": {"state": state}} for state in states]}
            with patch.object(diagnostic, "preflight", return_value=ORIGIN), patch.object(diagnostic, "run", return_value=result) as run:
                actual = diagnostic.diagnose(enabled=True, target_date=TARGET, project="mp-eod-diagnostic-test")
            self.assertEqual(actual["diagnosticVerified"], states == ("verified", "verified"))
            self.assertEqual(run.call_args.kwargs["poll_seconds"], 60)
            self.assertEqual(run.call_args.kwargs["delivery_retries"], 0)

    def test_worker_selector_is_not_a_shell_argument(self):
        with patch.object(diagnostic.subprocess, "run") as run, self.assertRaises(EodError):
            diagnostic.stack_ready("mp-eod-diagnostic-test;bad", ORIGIN)
        run.assert_not_called()

    def test_api_port_must_belong_to_selected_project(self):
        response = type("Response", (), {"stdout": json.dumps({"3001/tcp": [{"HostIp": "127.0.0.1", "HostPort": "3999"}]})})()
        with patch.object(diagnostic, "container_id", side_effect=["a" * 12, "b" * 12]), \
                patch.object(diagnostic.subprocess, "run", return_value=response) as run, self.assertRaises(EodError) as caught:
            diagnostic.stack_ready("mp-eod-diagnostic-test", ORIGIN)
        self.assertEqual(caught.exception.code, "diagnostic_api_mismatch")
        self.assertEqual(run.call_count, 1)

    def test_read_deadline_covers_dripping_headers_and_bodies(self):
        for phase in ("headers", "body", "missing_body"):
            requested = threading.Event()
            class Handler(BaseHTTPRequestHandler):
                def log_message(self, *_args):
                    pass

                def do_GET(self):
                    requested.set()
                    body = b'{"error":"asset_not_found"}' if phase == "missing_body" else b'{"data":"' + b'x' * 32 + b'"}'
                    try:
                        self.send_response(404 if phase == "missing_body" else 200)
                        self.send_header("Content-Length", str(len(body)))
                        self.flush_headers()
                        if phase == "headers":
                            for byte in b"X-Slow: " + b"x" * 32 + b"\r\n\r\n":
                                self.wfile.write(bytes([byte]))
                                self.wfile.flush()
                                time.sleep(0.025)
                            self.wfile.write(body)
                        else:
                            self.end_headers()
                            for byte in body:
                                self.wfile.write(bytes([byte]))
                                self.wfile.flush()
                                time.sleep(0.025)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        pass

            with self.subTest(phase=phase), local_server(Handler) as origin:
                started = time.monotonic()
                with self.assertRaises(EodError) as caught:
                    diagnostic.read_json(origin, allow_missing=True, deadline=started + 0.2)
                elapsed = time.monotonic() - started
                self.assertTrue(requested.is_set())
                self.assertEqual(caught.exception.code, "local_read_failed")
                self.assertGreaterEqual(elapsed, 0.18)
                self.assertLess(elapsed, 0.5)

    def test_verification_reads_share_deadline_and_keep_overlap_lease(self):
        document, history, status, delivery = sample()
        calls = []
        lease_held = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                calls.append(self.path)
                try:
                    with runner.LocalRunLock():
                        lease_held.append(False)
                except EodError as error:
                    lease_held.append(error.code == "overlap_lock_unavailable")
                body = json.dumps(history if "/history?" in self.path else status).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                time.sleep(0.15)
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass

        with local_server(Handler) as origin, patch.object(diagnostic, "VERIFY_TIMEOUT_SECONDS", 0.25), \
                patch.dict(os.environ, {"INGESTION_ENDPOINT": ORIGIN + "/internal/ingestion/deliveries", "INGESTION_SECRET": "a" * 64}), \
                patch.object(runner, "collect", return_value=(document, {})), \
                patch.object(runner, "_deliver", return_value={"state": "persisted", **delivery}), \
                patch.object(runner, "SYMBOLS", ("FPT",)):
            started = time.monotonic()
            result = runner.run(enable_eod=True, target_date=TARGET, submit_enabled=True,
                                verify_persisted=lambda doc, receipt: diagnostic.verify_document(origin, doc, receipt))
            elapsed = time.monotonic() - started
        self.assertEqual(result["symbols"][0]["verification"], {"state": "failed", "errorCode": "local_read_failed"})
        self.assertEqual(len(calls), 2)
        self.assertEqual(lease_held, [True, True])
        self.assertLess(elapsed, 0.5)
        with runner.LocalRunLock():
            pass

    def test_read_security_and_response_bound_survive_deadline(self):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_GET(self):
                calls.append((self.path, self.headers.get("Authorization")))
                body = b'{"ok":true}' if self.path == "/ok" else b"" if self.path == "/redirect" else b"x" * 65537
                self.send_response(302 if self.path == "/redirect" else 200)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Location", "/ok")
                self.end_headers()
                self.wfile.write(body)

        environment = {"HTTP_PROXY": "http://127.0.0.1:1", "http_proxy": "http://127.0.0.1:1", "NO_PROXY": "", "no_proxy": ""}
        with local_server(Handler) as origin, patch.dict(os.environ, environment), \
                patch("urllib.request.proxy_bypass", return_value=False):
            self.assertEqual(diagnostic.read_json(origin + "/ok"), (200, {"ok": True}))
            self.assertEqual(diagnostic.read_json(origin + "/ok", auth_secret="a" * 64)[0], 200)
            for path in ("/redirect", "/large"):
                with self.assertRaises(EodError):
                    diagnostic.read_json(origin + path)
        self.assertEqual(calls, [("/ok", None), ("/ok", "Bearer " + "a" * 64), ("/redirect", None), ("/large", None)])

    def test_wrong_ingestion_secret_fails_before_imports_or_provider(self):
        from io import BytesIO
        from urllib.error import HTTPError
        opener = unittest.mock.Mock()
        opener.open.side_effect = HTTPError(ORIGIN, 401, "unauthorized", {}, BytesIO(b'{"error":"unauthorized"}'))
        environment = {"INGESTION_ENDPOINT": ORIGIN + "/internal/ingestion/deliveries", "INGESTION_SECRET": "a" * 64}
        with patch.dict(os.environ, environment), patch.object(diagnostic, "stack_ready"), \
                patch.object(diagnostic, "build_opener", return_value=opener), \
                patch.object(diagnostic.importlib.metadata, "version") as version, \
                patch.object(diagnostic, "run") as run, self.assertRaises(EodError):
            diagnostic.diagnose(enabled=True, target_date=TARGET, project="mp-eod-diagnostic-test")
        version.assert_not_called()
        run.assert_not_called()
        request = opener.open.call_args.args[0]
        self.assertTrue(request.full_url.startswith(ORIGIN + "/internal/ingestion/deliveries/diagnostic-preflight-"))
        self.assertEqual(request.get_header("Authorization"), "Bearer " + "a" * 64)

    def test_404_requires_observed_asset_missing_contract(self):
        from io import BytesIO
        from urllib.error import HTTPError
        for body, accepted in ((b'{"error":"asset_not_found"}', True), (b'{"error":"not_found"}', False),
                               (b'not json', False)):
            opener = unittest.mock.Mock()
            opener.open.side_effect = HTTPError(ORIGIN, 404, "missing", {}, BytesIO(body))
            with self.subTest(body=body), patch.object(diagnostic, "build_opener", return_value=opener):
                if accepted:
                    self.assertEqual(diagnostic.read_json(ORIGIN, allow_missing=True)[0], 404)
                else:
                    with self.assertRaises(EodError):
                        diagnostic.read_json(ORIGIN, allow_missing=True)

    def test_loopback_post_and_poll_ignore_ambient_proxy(self):
        document = sample()[0]
        envelope = delivery_envelope(document)
        calls = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def reply(self, status):
                calls.append(self.command)
                body = json.dumps({"deliveryId": envelope["deliveryId"], "payloadDigest": envelope["payloadDigest"],
                                   "status": status, "counts": {"assets": 1, "observations": 1}}).encode()
                self.send_response(202 if status == "accepted" else 200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                self.reply("accepted")

            def do_GET(self):
                self.reply("success")

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            environment = {"INGESTION_ENDPOINT": f"http://127.0.0.1:{server.server_port}/internal/ingestion/deliveries",
                           "INGESTION_SECRET": "a" * 64, "HTTP_PROXY": "http://127.0.0.1:1",
                           "http_proxy": "http://127.0.0.1:1", "NO_PROXY": "", "no_proxy": ""}
            with patch.dict(os.environ, environment), patch("urllib.request.proxy_bypass", return_value=False):
                result = submit(document, poll_seconds=1)
            self.assertEqual(result["status"], "success")
            self.assertEqual(calls, ["POST", "GET"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import socket
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT), str(ROOT / "services/collector")]
from collector import eod_runner as runner
from collector.eod_cli import main
from collector.transport import delivery_envelope
from collector.vnstock_adapter import AdapterError, normalize_rows


TARGET = "2026-10-30"
COLLECTED = "2026-10-30T10:00:00+00:00"
ENV = {"INGESTION_ENDPOINT": "http://127.0.0.1:3001/internal/ingestion/deliveries", "INGESTION_SECRET": "a" * 64}


def document(symbol="FPT", *, empty=False):
    rows = [] if empty else [{"t": TARGET + " 07:00", "o": "1200", "h": "1500", "l": "1000", "c": "1300"}]
    return normalize_rows(rows, symbol, TARGET, TARGET, COLLECTED)


def receipt(payload, delivery_id, _poll, *, status="success"):
    envelope = delivery_envelope(payload, delivery_id)
    return {"deliveryId": delivery_id, "payloadDigest": envelope["payloadDigest"], "status": status,
            "counts": {"assets": 1, "observations": 1}}


class EodRunnerTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, ENV)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.lock = patch.object(runner, "LocalRunLock")
        self.lock_mock = self.lock.start()
        self.addCleanup(self.lock.stop)
        self.collect_patch = patch.object(runner, "collect", side_effect=lambda symbol, *_args, **_kwargs: (document(symbol), {}))
        self.collect = self.collect_patch.start()
        self.addCleanup(self.collect_patch.stop)
        self.submit_patch = patch.object(runner, "submit", side_effect=receipt)
        self.submit = self.submit_patch.start()
        self.addCleanup(self.submit_patch.stop)

    def run_eod(self, **options):
        return runner.run(enable_eod=True, target_date=TARGET, **options)

    def test_validation_finishes_before_lock_or_provider(self):
        cases = [{"enable_eod": False}, {"target_date": "20261030"}, {"target_date": "2026-02-30"},
                 {"target_date": "2026-10-3"}, {"poll_seconds": 0}, {"delivery_retries": 0},
                 {"submit_enabled": True, "poll_seconds": -1}, {"submit_enabled": True, "poll_seconds": 61},
                 {"submit_enabled": True, "poll_seconds": True}, {"submit_enabled": True, "delivery_retries": -1},
                 {"submit_enabled": True, "delivery_retries": 2}, {"submit_enabled": True, "delivery_retries": True}]
        for options in cases:
            with self.subTest(options=options), self.assertRaises(runner.EodError):
                runner.run(**{"enable_eod": True, "target_date": TARGET, **options})
        for changes in [{"INGESTION_SECRET": "bad"}, {"INGESTION_ENDPOINT": "http://example.org/leak"}]:
            with patch.dict(os.environ, changes), self.assertRaises(runner.EodError):
                self.run_eod(submit_enabled=True)
        self.lock_mock.assert_not_called()
        self.collect.assert_not_called()
        self.submit.assert_not_called()

    def test_serial_fixed_date_budget_timeout_and_no_submission(self):
        result = self.run_eod()
        self.assertEqual(result["status"], "collected")
        self.assertEqual([call.args for call in self.collect.call_args_list], [("FPT", TARGET, TARGET), ("VNINDEX", TARGET, TARGET)])
        self.assertTrue(all(call.kwargs == {"timeout_seconds": 45} for call in self.collect.call_args_list))
        self.assertEqual([row["delivery"]["state"] for row in result["symbols"]], ["not_submitted"] * 2)
        self.submit.assert_not_called()
        self.lock_mock.return_value.__exit__.assert_called_once()

    def test_any_provider_error_stops_remaining_symbol_and_sanitizes(self):
        for error in [AdapterError(code, {"secret": "sensitive"}) for code in
                      ("rate_limited", "access_blocked", "provider_timeout", "malformed_provider_response", "sensitive-code")]:
            self.collect.reset_mock(side_effect=True)
            self.collect.side_effect = error
            result = self.run_eod(submit_enabled=True, delivery_retries=1)
            with self.subTest(code=error.code):
                self.assertEqual(result["status"], "failed")
                self.assertEqual([row["collection"]["state"] for row in result["symbols"]], ["failed", "skipped"])
                self.collect.assert_called_once()
                self.assertNotIn("sensitive", json.dumps(result))
        self.submit.assert_not_called()

    def test_second_provider_failure_preserves_first_persisted_outcome(self):
        self.collect.side_effect = [(document(), {}), ConnectionError("sensitive")]
        result = self.run_eod(submit_enabled=True)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["symbols"][0]["delivery"]["state"], "persisted")
        self.assertEqual(result["symbols"][1]["collection"]["errorCode"], "provider_transport_error")
        self.assertEqual(self.collect.call_count, 2)

    def test_empty_data_is_not_submitted_and_not_persisted(self):
        for both_empty in (False, True):
            self.collect.side_effect = lambda symbol, *_args, **_kwargs: (document(symbol, empty=both_empty or symbol == "VNINDEX"), {})
            self.submit.reset_mock()
            result = self.run_eod(submit_enabled=True)
            self.assertEqual(result["status"], "no_data" if both_empty else "partial")
            self.assertEqual(self.submit.call_count, 0 if both_empty else 1)
            self.assertEqual(result["symbols"][1]["collection"]["state"], "no_data")

    def test_only_two_nonempty_terminal_successes_are_persisted(self):
        for status, aggregate, delivery in [("success", "persisted", "persisted"), ("accepted", "pending", "pending"),
                                             ("queued", "pending", "pending"), ("running", "pending", "pending"),
                                             ("failure", "failed", "failed")]:
            self.submit.reset_mock(side_effect=True)
            self.submit.side_effect = lambda *args: receipt(*args, status=status)
            result = self.run_eod(submit_enabled=True, poll_seconds=0, delivery_retries=1)
            with self.subTest(status=status):
                self.assertEqual(result["status"], aggregate)
                self.assertEqual([row["delivery"]["state"] for row in result["symbols"]], [delivery] * 2)
                self.assertEqual(self.submit.call_count, 2)

    def test_missing_ack_is_unknown_with_no_default_retry(self):
        self.submit.side_effect = ValueError("https://sensitive.test/?secret=credential")
        result = self.run_eod(submit_enabled=True)
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(self.submit.call_count, 2)
        self.assertEqual(self.collect.call_count, 2)
        self.assertNotIn("sensitive", json.dumps(result))

    def test_opt_in_extra_attempt_is_bounded_for_recognized_request_failure(self):
        self.submit.side_effect = ValueError("Ingestion request failed")
        result = self.run_eod(submit_enabled=True, delivery_retries=1)
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(self.submit.call_count, 4)
        self.assertEqual(self.collect.call_count, 2)
        for first, second in ((0, 1), (2, 3)):
            self.assertEqual(self.submit.call_args_list[first], self.submit.call_args_list[second])

    def test_http_denials_rate_limit_and_invalid_receipts_are_not_retried(self):
        for message in ("Ingestion HTTP status 401", "Ingestion HTTP status 403", "Ingestion HTTP status 429",
                        "Invalid ingestion receipt", "Invalid ingestion response", "Invalid ingestion counts",
                        "unknown transport error with sensitive details"):
            self.submit.reset_mock(side_effect=True)
            self.submit.side_effect = ValueError(message)
            result = self.run_eod(submit_enabled=True, delivery_retries=1)
            with self.subTest(message=message):
                self.assertEqual(self.submit.call_count, 2)
                self.assertEqual(result["status"], "unknown")
                self.assertTrue(all(row["delivery"]["attempts"] == 1 for row in result["symbols"]))
                self.assertNotIn(message, json.dumps(result))

    def test_delivery_uses_retained_copy_identity_and_never_recollects(self):
        original = document()
        before = copy.deepcopy(original)
        self.collect.side_effect = [(original, {}), (document("VNINDEX", empty=True), {})]
        attempts = []

        def send(payload, selected_id, poll):
            self.assertIsNot(payload, original)
            attempts.append(copy.deepcopy((payload, selected_id, poll)))
            if len(attempts) == 1:
                original["candles"][0]["collectedAt"] = "2026-11-01T00:00:00Z"
                raise ValueError("Ingestion request failed")
            return receipt(payload, selected_id, poll)

        self.submit.side_effect = send
        with patch.object(runner, "delivery_envelope", wraps=delivery_envelope) as identity:
            result = self.run_eod(submit_enabled=True, delivery_retries=1)
        identity.assert_called_once()
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(attempts[0][0], before)
        self.assertEqual(result["symbols"][0]["delivery"]["state"], "persisted")
        self.assertEqual(self.collect.call_count, 2)

    def test_lock_is_held_for_collection_and_delivery(self):
        held = False

        def enter():
            nonlocal held
            held = True

        def exit_lock(*_args):
            nonlocal held
            held = False

        self.lock_mock.return_value.__enter__.side_effect = enter
        self.lock_mock.return_value.__exit__.side_effect = exit_lock

        def collect_held(symbol, *_args, **_kwargs):
            self.assertTrue(held)
            return document(symbol), {}

        def submit_held(*args):
            self.assertTrue(held)
            return receipt(*args)

        self.collect.side_effect = collect_held
        self.submit.side_effect = submit_held
        self.run_eod(submit_enabled=True)
        self.assertFalse(held)

    def test_lock_conflict_prevents_provider_and_delivery(self):
        self.lock_mock.return_value.__enter__.side_effect = runner.EodError("overlap_lock_unavailable")
        with self.assertRaises(runner.EodError):
            self.run_eod(submit_enabled=True)
        self.collect.assert_not_called()
        self.submit.assert_not_called()

    def test_interrupt_releases_lock(self):
        self.collect.side_effect = KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            self.run_eod()
        self.lock_mock.return_value.__exit__.assert_called_once()

    def test_cli_metadata_and_exit_status_do_not_expose_prices_payload_or_provider_metadata(self):
        self.collect.side_effect = lambda symbol, *_args, **_kwargs: (document(symbol), {"secret": "sensitive"})
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            self.assertEqual(main(["--enable-eod", "--target-date", TARGET, "--submit"]), 0)
        output = stream.getvalue()
        for value in ('"close"', '"candles": [', '"payload"', "1300", ENV["INGESTION_SECRET"], ENV["INGESTION_ENDPOINT"], "sensitive"):
            self.assertNotIn(value, output)
        self.submit.side_effect = lambda *args: receipt(*args, status="accepted")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--enable-eod", "--target-date", TARGET, "--submit"]), 1)

    def test_cli_opt_in_and_submit_options_are_required_before_lock(self):
        for extra in ([], ["--enable-eod", "--poll-seconds", "0"], ["--enable-eod", "--delivery-retries", "0"]):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--target-date", TARGET, *extra]), 1)
        self.collect.assert_not_called()
        self.lock_mock.assert_not_called()


class EodLockTests(unittest.TestCase):
    def free_address(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as temporary:
            temporary.bind(("127.0.0.1", 0))
            return temporary.getsockname()

    def test_bind_only_exclusive_noninheritable_without_reuse_listen_or_connect(self):
        lease = Mock()
        with patch.object(runner.socket, "socket", return_value=lease), \
             patch.object(runner.socket, "SO_EXCLUSIVEADDRUSE", 12345, create=True):
            with runner.LocalRunLock():
                lease.set_inheritable.assert_called_once_with(False)
                lease.setsockopt.assert_called_once_with(socket.SOL_SOCKET, 12345, 1)
                lease.bind.assert_called_once_with(runner.LOCK_ADDRESS)
                lease.listen.assert_not_called()
                lease.connect.assert_not_called()
                lease.close.assert_not_called()
        lease.close.assert_called_once()

    def test_setup_error_fails_closed_and_closes_socket(self):
        lease = Mock()
        lease.set_inheritable.side_effect = OSError("sensitive")
        with patch.object(runner.socket, "socket", return_value=lease), self.assertRaises(runner.EodError):
            with runner.LocalRunLock():
                self.fail("unexpected lock acquisition")
        lease.close.assert_called_once()

    def test_real_contention_and_exception_release(self):
        address = self.free_address()
        with self.assertRaisesRegex(RuntimeError, "test interruption"):
            with runner.LocalRunLock(_address=address):
                with self.assertRaisesRegex(runner.EodError, "overlap_lock_unavailable"):
                    with runner.LocalRunLock(_address=address):
                        self.fail("overlap accepted")
                raise RuntimeError("test interruption")
        with runner.LocalRunLock(_address=address):
            pass

    def test_process_death_releases_real_lock(self):
        address = self.free_address()
        code = ("import time; from collector.eod_runner import LocalRunLock\n"
                f"with LocalRunLock(_address={address!r}):\n print('ready', flush=True)\n time.sleep(30)\n")
        child = subprocess.Popen([sys.executable, "-c", code], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, env={**os.environ, "PYTHONPATH": os.pathsep.join([str(ROOT / "services/collector"), str(ROOT)])})
        try:
            self.assertEqual(child.stdout.readline().strip(), "ready")
            with self.assertRaises(runner.EodError):
                with runner.LocalRunLock(_address=address):
                    self.fail("process overlap accepted")
            child.kill()
            child.wait(timeout=10)
            with runner.LocalRunLock(_address=address):
                pass
        finally:
            if child.poll() is None:
                child.kill()
            child.communicate(timeout=10)


class EodHttpRecoveryTests(unittest.TestCase):
    def test_lost_first_ack_reposts_identical_bytes_and_identity_without_refetch(self):
        bodies = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                bodies.append(self.rfile.read(int(self.headers["Content-Length"])))
                if len(bodies) == 1:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                    return
                envelope = json.loads(bodies[-1])
                result = {"deliveryId": envelope["deliveryId"], "payloadDigest": envelope["payloadDigest"],
                          "status": "success", "counts": {"assets": 1, "observations": 1}}
                raw = json.dumps(result).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.daemon_threads = True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        endpoint = f"http://127.0.0.1:{server.server_port}/internal/ingestion/deliveries"
        try:
            with patch.dict(os.environ, {**ENV, "INGESTION_ENDPOINT": endpoint}), patch.object(runner, "LocalRunLock"), \
                 patch.object(runner, "collect", side_effect=lambda symbol, *_args, **_kwargs: (document(symbol, empty=symbol == "VNINDEX"), {})) as collect:
                result = runner.run(enable_eod=True, target_date=TARGET, submit_enabled=True, delivery_retries=1)
            self.assertEqual(len(bodies), 2)
            self.assertEqual(bodies[0], bodies[1])
            envelope = json.loads(bodies[0])
            self.assertEqual(envelope["payload"]["candles"][0]["collectedAt"], COLLECTED)
            self.assertEqual(envelope, delivery_envelope(document()))
            self.assertEqual([call.args[0] for call in collect.call_args_list], ["FPT", "VNINDEX"])
            self.assertEqual(result["symbols"][0]["delivery"]["state"], "persisted")
            self.assertEqual(result["symbols"][0]["delivery"]["attempts"], 2)
            self.assertEqual(result["status"], "partial")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services/collector"))
from collector import vnstock_adapter as adapter
from collector.vnstock_cli import main
from scripts.validate_observed_candles import validate_observed_candles


COLLECTED = "2026-10-06T07:00:00+00:00"


def synthetic_row(**changes) -> dict:
    # Authored synthetic values; no provider payload is used in tests.
    return {"t": "2026-10-02 07:00", "o": 1200, "h": 1500, "l": 1000, "c": 1300, "v": 55, **changes}


def document(symbol="FPT", rows=None, collected=COLLECTED):
    return adapter.normalize_rows([synthetic_row()] if rows is None else rows, symbol, "2026-09-27", "2026-10-06", collected)


class VnstockAdapterTests(unittest.TestCase):
    def test_equity_raw_vnd_no_scaling_rounding_or_asof_inference(self):
        result = document(rows=[synthetic_row(c=Decimal("1300.1234567890123456789"))])
        row = result["candles"][0]
        self.assertEqual(row["close"], "1300.1234567890123456789")
        self.assertEqual((row["unit"], row["currency"], row["adjustmentBasis"]), ("VND", "VND", "unknown"))
        self.assertEqual((row["tradingDate"], row["providerTimeLabel"]), ("2026-10-02", "2026-10-02 07:00"))
        self.assertEqual((row["sourceAsOf"], row["collectedAt"], row["volume"]), (None, COLLECTED, None))
        self.assertEqual(validate_observed_candles(result), [])

    def test_index_points_and_null_volume(self):
        result = document("VNINDEX")
        row = result["candles"][0]
        self.assertEqual((row["unit"], row["currency"], row["adjustmentBasis"], row["volume"]), ("index_point", None, "not_applicable", None))
        self.assertEqual(row["close"], "1300")

    def test_identity_and_content_are_stable_across_refetch_but_revision_changes_content(self):
        original = document()["candles"][0]
        refetched = document(collected="2026-10-06T08:00:00Z")["candles"][0]
        revised = document(rows=[synthetic_row(c=1350)])["candles"][0]
        self.assertEqual(original["barId"], refetched["barId"])
        self.assertEqual(original["contentDigest"], refetched["contentDigest"])
        self.assertEqual(original["barId"], revised["barId"])
        self.assertNotEqual(original["contentDigest"], revised["contentDigest"])

    def test_empty_is_no_data_without_synthetic_records(self):
        result = document(rows=[])
        summary = adapter.summarize(result, {})
        self.assertEqual(summary["status"], "no_data")
        self.assertEqual(summary["returnedDateRange"], {"first": None, "last": None})

    def test_duplicate_out_of_range_and_inverted_ohlc_fail_closed(self):
        cases = [[synthetic_row(), synthetic_row()], [synthetic_row(t="2026-09-26 07:00")],
                 [synthetic_row(l=1400)], [synthetic_row(h=1100)]]
        for rows in cases:
            with self.subTest(rows=rows), self.assertRaises(adapter.AdapterError):
                document(rows=rows)

    def test_wrong_number_types_nonfinite_and_exponents_are_bounded(self):
        for value in (True, None, [], "NaN", "Infinity", float("nan"), 0, -1, "1e999999999", "1e-999999999", "1" * 129):
            with self.subTest(value=value), self.assertRaises(adapter.AdapterError):
                document(rows=[synthetic_row(c=value)])

    def test_wrong_time_types_invalid_dates_and_aware_labels_rejected(self):
        for label in (None, 0, "2026-02-30 07:00", "2026-10-02T07:00Z", "2026-10-02 25:00", "2026-10-02"):
            with self.subTest(label=label), self.assertRaises(adapter.AdapterError):
                document(rows=[synthetic_row(t=label)])

    def test_malformed_missing_and_excess_rows_rejected(self):
        for rows in ({}, [None], [{"t": "2026-10-02 07:00"}], [synthetic_row()] * 33):
            with self.subTest(rows_type=type(rows).__name__), self.assertRaises(adapter.AdapterError):
                document(rows=rows)

    def test_requests_reject_unsupported_symbols_intervals_and_date_ranges(self):
        for args in (("VCB", "2026-10-01", "2026-10-06"), ("FPT", "2026-10-01", "2026-10-06", "1h"),
                     ("FPT", "2026-10-07", "2026-10-06"), ("FPT", "2026-08-01", "2026-10-06"),
                     ("FPT", "2026-02-30", "2026-10-06")):
            with self.subTest(args=args), self.assertRaises(adapter.AdapterError):
                adapter.validate_request(*args)

    def test_validator_rejects_schema_and_cross_record_tampering(self):
        changes = {"barId": "0" * 64, "contentDigest": "0" * 64, "unit": "index_point", "sourceAsOf": COLLECTED,
                   "collectedAt": "2026-10-06T07:00:00", "adjustmentBasis": "unadjusted", "providerTimeLabel": "2026-10-01 07:00",
                   "close": "NaN", "volume": 55}
        for key, value in changes.items():
            result = document()
            result["candles"][0][key] = value
            with self.subTest(key=key):
                self.assertTrue(validate_observed_candles(result))
        result = document()
        result["assets"][0]["symbol"] = "VNINDEX"
        self.assertTrue(validate_observed_candles(result))

    def test_json_duplicate_keys_and_nonfinite_constants_rejected(self):
        for raw in ('[{"c":1,"c":2}]', '[{"c":NaN}]', '[{"c":Infinity}]'):
            with self.subTest(raw=raw), self.assertRaises(adapter.AdapterError):
                json.loads(raw, object_pairs_hook=adapter.unique_keys, parse_constant=adapter.reject_constant)

    def test_metadata_excludes_arbitrary_keys_and_time_text(self):
        metadata = adapter.row_metadata([synthetic_row(t="sensitive text", secret_key="sensitive payload")])
        serialized = json.dumps(metadata)
        self.assertNotIn("secret_key", serialized)
        self.assertNotIn("sensitive", serialized)
        self.assertEqual(metadata["providerTimeFormat"], ["other"])

    def test_error_categories_are_safe(self):
        for name, expected in (("RateLimitedError", "rate_limited"), ("AccessDeniedError", "access_blocked"),
                               ("ChallengeRequiredError", "access_blocked"), ("CircuitOpenError", "access_blocked")):
            error = type(name, (Exception,), {})("secret payload")
            self.assertEqual(adapter.error_code(error), expected)
        self.assertEqual(adapter.error_code(SystemExit("secret")), "rate_limited")
        self.assertEqual(adapter.error_code(ConnectionError("secret")), "provider_transport_error")
        self.assertEqual(adapter.error_code(ImportError("secret")), "provider_not_installed")

    def test_library_call_is_explicit_kbs_once_and_preserves_kwargs(self):
        fake_data, fake_config, fake_tenacity = (ModuleType(name) for name in ("vnstock.common.data", "vnstock.config", "tenacity"))
        client = Mock(source="KBS")
        client.data_source.data_source = "KBS"
        called = Mock(return_value=json.dumps([synthetic_row()]))
        client.history.retry_with.return_value = called
        fake_data.Quote = Mock(return_value=client)
        fake_config.Config = type("Config", (), {})
        fake_tenacity.stop_after_attempt = Mock(return_value="one_attempt")
        with patch.dict(sys.modules, {"vnstock.common.data": fake_data, "vnstock.config": fake_config, "tenacity": fake_tenacity}), \
             patch("importlib.metadata.version", side_effect=lambda name: adapter.VERSIONS[name]), patch.dict(os.environ):
            result, metadata = adapter._collect_once("FPT", "2026-09-27", "2026-10-06")
            fake_data.Quote.assert_called_once_with(symbol="FPT", source="KBS")
            client.history.retry_with.assert_called_once_with(stop="one_attempt")
            called.assert_called_once_with(client, start="2026-09-27", end="2026-10-06", interval="1D", to_df=False, floating=None)
            self.assertEqual(fake_config.Config.RETRY_AFTER_MAX_WAIT, 0)
            self.assertEqual(os.environ["VNSTOCK_DISABLE_AGENT_SETUP"], "1")
            self.assertEqual(os.environ["VNSTOCK_TELEMETRY"], "off")
        self.assertEqual(result["candles"][0]["close"], "1300")
        self.assertTrue(metadata["invariantsValid"])

    def test_version_mismatch_stops_before_import(self):
        with patch("importlib.metadata.version", return_value="unexpected"), self.assertRaisesRegex(adapter.AdapterError, "unsupported_provider_version"):
            adapter._collect_once("FPT", "2026-09-27", "2026-10-06")

    def test_timeout_process_is_terminated_without_retry(self):
        context, receive, send, process = Mock(), Mock(), Mock(), Mock()
        context.Pipe.return_value = (receive, send)
        context.Process.return_value = process
        receive.poll.return_value = False
        process.is_alive.side_effect = [True, False]
        with patch("multiprocessing.get_context", return_value=context), self.assertRaisesRegex(adapter.AdapterError, "provider_timeout"):
            adapter.collect("FPT", "2026-09-27", "2026-10-06", timeout_seconds=1)
        process.start.assert_called_once()
        process.terminate.assert_called_once()
        process.join.assert_called_once_with(timeout=2)
        process.kill.assert_not_called()

    def test_timeout_kills_child_if_terminate_cleanup_does_not_finish(self):
        context, receive, send, process = Mock(), Mock(), Mock(), Mock()
        context.Pipe.return_value = (receive, send)
        context.Process.return_value = process
        receive.poll.return_value = False
        process.is_alive.side_effect = [True, True]
        with patch("multiprocessing.get_context", return_value=context), self.assertRaisesRegex(adapter.AdapterError, "provider_timeout"):
            adapter.collect("FPT", "2026-09-27", "2026-10-06", timeout_seconds=1)
        process.terminate.assert_called_once()
        process.kill.assert_called_once()
        self.assertEqual(process.join.call_count, 2)

    def test_opt_in_required_and_summary_does_not_print_prices(self):
        args = ["--symbol", "FPT", "--start", "2026-09-27", "--end", "2026-10-06"]
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream), patch("collector.vnstock_cli.collect") as collect:
            self.assertEqual(main(args), 1)
            collect.assert_not_called()
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream), patch("collector.vnstock_cli.collect", return_value=(document(), {})):
            self.assertEqual(main(["--enable-vnstock", *args]), 0)
        summary = json.loads(stream.getvalue())
        self.assertNotIn("candles", summary)
        self.assertNotIn("close", summary)
        self.assertNotIn("1300", stream.getvalue())

    def test_fixture_default_imports_no_vnstock_and_contacts_no_network(self):
        code = "from unittest.mock import patch; import sys; from collector.cli import main\nwith patch('socket.socket', side_effect=AssertionError('network')):\n assert main(['fixtures/market/mp-02-synthetic.json']) == 0\nassert not any(key == 'vnstock' or key.startswith('vnstock.') for key in sys.modules)\n"
        result = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True,
                                env={**os.environ, "PYTHONPATH": f"{ROOT / 'services/collector'}{os.pathsep}{ROOT}"}, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()

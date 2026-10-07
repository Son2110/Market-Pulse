from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import rfc8785

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT), str(ROOT / "services/collector")]
from collector.transport import delivery_envelope, validate_submission_options
from collector.vnstock_adapter import content_digest
from collector.vnstock_cli import main
from scripts.validate_observed_candles import validate_observed_candles


class ObservedIngestionTests(unittest.TestCase):
    def setUp(self):
        self.corpus = json.loads((ROOT / "apps/api/tests/observed-parity.json").read_text(encoding="utf-8"))

    def test_shared_contract_parity(self):
        for document in [self.corpus["baseline"], self.corpus["index"]]:
            self.assertEqual(validate_observed_candles(document), [])
        for case in self.corpus["cases"]:
            document = copy.deepcopy(self.corpus["baseline"])
            for path, value in case["sets"]:
                cursor = document
                for part in path[:-1]:
                    cursor = cursor[part]
                cursor[path[-1]] = value
            if case["rehash"]:
                for row in document["candles"]:
                    row["contentDigest"] = content_digest(row)
            with self.subTest(name=case["name"]):
                self.assertEqual(not validate_observed_candles(document), case["valid"])

    def test_observed_delivery_hash_is_separate_from_content_hash(self):
        document = self.corpus["baseline"]
        envelope = delivery_envelope(document)
        self.assertEqual(envelope["deliveryId"], "observed-" + hashlib.sha256(rfc8785.dumps(document)).hexdigest())
        refetch = copy.deepcopy(document)
        refetch["candles"][0]["collectedAt"] = "2026-10-06T08:00:00Z"
        self.assertNotEqual(envelope["deliveryId"], delivery_envelope(refetch)["deliveryId"])
        self.assertEqual(document["candles"][0]["contentDigest"], refetch["candles"][0]["contentDigest"])

    def test_invalid_submit_flags_and_config_never_call_provider(self):
        base = ["--enable-vnstock", "--symbol", "FPT", "--start", "2026-10-01", "--end", "2026-10-06"]
        for extra in [["--poll-seconds", "1"], ["--delivery-id", "x"], ["--submit", "--poll-seconds", "61"], ["--submit", "--delivery-id", "bad:id"], ["--submit"], ["--timeout-seconds", "61"]]:
            with self.subTest(extra=extra), patch.dict(os.environ, {"INGESTION_ENDPOINT": "", "INGESTION_SECRET": ""}), patch("collector.vnstock_cli.collect") as collect, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([*base, *extra]), 1)
                collect.assert_not_called()
        for seconds in [-1, 61, True, 0.5]:
            with self.assertRaises(ValueError):
                validate_submission_options(poll_seconds=seconds)

    def test_submit_output_is_metadata_only_and_reports_terminal_failure(self):
        args = ["--enable-vnstock", "--symbol", "FPT", "--start", "2026-10-01", "--end", "2026-10-06", "--submit", "--poll-seconds", "5"]
        for status, expected in [("success", 0), ("accepted", 0), ("failure", 1)]:
            stream = io.StringIO()
            with patch("collector.vnstock_cli.validate_submission_options"), patch("collector.vnstock_cli.collect", return_value=(self.corpus["baseline"], {})), patch("collector.vnstock_cli.submit", return_value={"status": status}) as submit, contextlib.redirect_stdout(stream):
                self.assertEqual(main(args), expected)
                submit.assert_called_once_with(self.corpus["baseline"], None, 5)
            self.assertNotIn('"close"', stream.getvalue())
            self.assertNotIn('"1300"', stream.getvalue())


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import copy
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import rfc8785

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/collector"))
from collector.cli import delivery_envelope, read_fixture, safe_numbers, submit
from scripts.validate_market_data import validate_market_data


class IngestionCollectorTests(unittest.TestCase):
    def setUp(self):
        self.fixture = read_fixture(ROOT / "fixtures/market/mp-02-synthetic.json")

    def test_digest_and_numeric_representation(self):
        envelope = delivery_envelope(self.fixture)
        self.assertEqual(envelope["payloadDigest"], hashlib.sha256(rfc8785.dumps(self.fixture)).hexdigest())
        self.assertEqual(envelope["deliveryId"], f"fixture-{envelope['payloadDigest']}")
        self.assertEqual(rfc8785.dumps({"b": 1.0, "a": "😀"}), b'{"a":"\xf0\x9f\x98\x80","b":1}')
        for value in [9007199254740992, 9007199254740992.0, 1e20, float("inf")]:
            with self.assertRaises(ValueError):
                safe_numbers(value)
        with self.assertRaises(ValueError):
            delivery_envelope(self.fixture, "bad:id")

    def test_shared_negative_contract_corpus(self):
        cases = json.loads((ROOT / "apps/api/tests/ingestion-parity.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                document = copy.deepcopy(self.fixture)
                for path, value in case.get("sets", [[case.get("path"), case.get("value")]]):
                    cursor = document
                    for part in path[:-1]:
                        cursor = cursor[part]
                    cursor[path[-1]] = value
                self.assertTrue(validate_market_data(document), case["name"])

    def test_read_rejects_duplicate_keys_and_nonfinite_numbers(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "invalid.json"
            for text in ['{"x":1,"x":2}', '{"x":NaN}', '{"x":1e400}', '{"x":1e20}']:
                path.write_text(text, encoding="utf-8")
                with self.assertRaises(ValueError):
                    read_fixture(path)

    def test_submission_rejects_unsafe_endpoint_and_missing_secret_before_network(self):
        for endpoint in ["http://example.com/internal/ingestion/deliveries", "https://user:pass@example.com/internal/ingestion/deliveries", "https://example.com/other", "https://example.com/internal/ingestion/deliveries?x=1"]:
            with patch.dict(os.environ, {"INGESTION_ENDPOINT": endpoint, "INGESTION_SECRET": "a" * 64}):
                with self.assertRaises(ValueError):
                    submit(self.fixture)
        with patch.dict(os.environ, {"INGESTION_ENDPOINT": "http://localhost:3001/internal/ingestion/deliveries", "INGESTION_SECRET": ""}):
            with self.assertRaises(ValueError):
                submit(self.fixture)

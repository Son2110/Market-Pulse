from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from scripts.symbol_registry import PROFILES, REGISTERED_SYMBOLS, create_registry, symbol_profile
from scripts.validate_observed_candles import validate_observed_candles


CORPUS = json.loads((Path(__file__).resolve().parents[1] / "apps/api/tests/observed-parity.json").read_text(encoding="utf-8"))


class SymbolRegistryTests(unittest.TestCase):
    def test_profiles_match_node_registry(self):
        self.assertEqual(len(REGISTERED_SYMBOLS), 34)
        self.assertEqual(PROFILES["FPT"], {"symbol": "FPT", "assetType": "equity", "exchange": "HOSE", "assetId": "VN:HOSE:FPT",
                                           "currency": "VND", "unit": "VND", "adjustmentBasis": "unknown", "hotBasket": True})
        self.assertEqual(PROFILES["SHS"], {"symbol": "SHS", "assetType": "equity", "exchange": "HNX", "assetId": "VN:HNX:SHS",
                                           "currency": "VND", "unit": "VND", "adjustmentBasis": "unknown", "hotBasket": False})
        self.assertEqual(PROFILES["BSR"], {"symbol": "BSR", "assetType": "equity", "exchange": "HOSE", "assetId": "VN:HOSE:BSR",
                                           "currency": "VND", "unit": "VND", "adjustmentBasis": "unknown", "hotBasket": False})
        self.assertEqual(PROFILES["VNINDEX"], {"symbol": "VNINDEX", "assetType": "index", "exchange": "INDEX", "assetId": "VN:INDEX:VNINDEX",
                                               "currency": None, "unit": "index_point", "adjustmentBasis": "not_applicable", "hotBasket": True})
        self.assertIsNone(symbol_profile("fpt"))
        self.assertIsNone(symbol_profile("AAA"))

    def test_factory_supports_other_exchanges_and_rejects_bad_documents(self):
        entry = {"symbol": "VCB", "assetType": "equity", "exchange": "HOSE"}
        registry = create_registry({"version": 1, "symbols": [entry, {"symbol": "SHS", "assetType": "equity", "exchange": "HNX"},
                                                               {"symbol": "BSR", "assetType": "equity", "exchange": "UPCOM"},
                                                               {"symbol": "VN30", "assetType": "index", "exchange": "INDEX"}]})
        self.assertEqual([item["assetId"] for item in registry.values()], ["VN:HOSE:VCB", "VN:HNX:SHS", "VN:UPCOM:BSR", "VN:INDEX:VN30"])
        for document in ({"version": 2, "symbols": [entry]}, {"version": 1, "symbols": []}, {"version": 1, "symbols": [entry, entry]},
                         {"version": 1, "symbols": [{**entry, "symbol": "vcb"}]}, {"version": 1, "symbols": [{**entry, "symbol": "ABCDEFGHIJKLM"}]},
                         {"version": 1, "symbols": [{**entry, "exchange": "NYSE"}]}, {"version": 1, "symbols": [{**entry, "exchange": "INDEX"}]},
                         {"version": 1, "symbols": [{"symbol": "X", "assetType": "index", "exchange": "HOSE"}]},
                         {"version": 1, "symbols": [{**entry, "assetType": "fund"}]}):
            with self.subTest(document=document), self.assertRaises(ValueError):
                create_registry(document)

    def test_validator_accepts_registered_and_rejects_schema_valid_unregistered_symbol(self):
        self.assertEqual(validate_observed_candles(CORPUS["baseline"]), [])
        self.assertEqual(validate_observed_candles(CORPUS["index"]), [])
        payload = copy.deepcopy(CORPUS["baseline"])
        payload["request"]["symbol"] = "AAA"
        payload["assets"][0].update(symbol="AAA", assetId="VN:HOSE:AAA")
        for row in payload["candles"]:
            row["assetId"] = "VN:HOSE:AAA"
        self.assertTrue(validate_observed_candles(payload))


if __name__ == "__main__":
    unittest.main()

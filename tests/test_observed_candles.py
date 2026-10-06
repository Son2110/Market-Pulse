from __future__ import annotations

import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator
from scripts.validate_observed_candles import SCHEMA_PATH, validate_observed_candles


class ObservedSchemaTests(unittest.TestCase):
    def test_separate_schema_is_valid_and_all_refs_are_local(self):
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        self.assertNotIn('"$ref": "http', json.dumps(schema))

    def test_fixture_v1_is_not_relabelled_as_observed(self):
        fixture = Path(__file__).resolve().parents[1] / "fixtures/market/mp-02-synthetic.json"
        self.assertTrue(validate_observed_candles(json.loads(fixture.read_text(encoding="utf-8"))))

    def test_malformed_top_level_values_return_errors(self):
        for value in (None, True, [], {}, {"schemaVersion": "2.0.0"}):
            with self.subTest(value=value):
                self.assertTrue(validate_observed_candles(value))


if __name__ == "__main__":
    unittest.main()

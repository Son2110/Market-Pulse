"""Offline gold contract, arithmetic, calendar and identity regression tests."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from decimal import Decimal, localcontext
from pathlib import Path

import rfc8785

from scripts.validate_gold_quotes import (
    FIXTURE_PATH, ROOT, asset_identity, digest, economic_content,
    snapshot_identity, validate_gold_quotes,
)


def fixture():
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def seal(row):
    row["assetId"] = digest(asset_identity(row))
    row["snapshotId"] = digest(snapshot_identity(row))
    row["contentDigest"] = digest(economic_content(row))


def set_path(document, path, value):
    cursor = document
    for part in path[:-1]:
        cursor = cursor[part]
    cursor[path[-1]] = value


class GoldContractTests(unittest.TestCase):
    def assert_invalid(self, document, message=None):
        errors = validate_gold_quotes(document)
        self.assertTrue(errors, "mutation unexpectedly accepted")
        if message:
            self.assertTrue(any(message in error for error in errors), errors)

    def one_row(self, index=0):
        document = fixture()
        document["observations"] = [document["observations"][index]]
        return document, document["observations"][0]

    def test_committed_fixture_and_scenarios(self):
        document = fixture()
        self.assertEqual(validate_gold_quotes(document), [])
        rows = document["observations"]
        self.assertEqual(len(rows), 11)
        self.assertEqual({row["product"] for row in rows}, {"gold_bar_sjc", "plain_ring_9999"})
        self.assertEqual({row["provenance"]["originalUnit"] for row in rows},
                         {"thousand_vnd_per_chi", "thousand_vnd_per_tael", "vnd_per_tael"})
        self.assertEqual([row["quotes"]["spread"] for row in rows[7:]], ["0.5", "-0.5", "0", "0"])
        self.assertIsNone(rows[5]["quotes"]["buy"])
        self.assertIsNone(rows[6]["quotes"]["sell"])
        self.assertIsNone(rows[5]["region"])
        self.assertEqual(rows[5]["requestedRegion"], "11")

    def test_closed_envelope_objects_and_required_fields(self):
        paths = [[], ["dataset"], ["observations", 0],
                 *[["observations", 0, key] for key in ("quotes", "time", "qualityFlags", "provenance")]]
        for path in paths:
            with self.subTest(path=path):
                document = fixture()
                cursor = document
                for part in path:
                    cursor = cursor[part]
                cursor["extra"] = "unexpected"
                self.assert_invalid(document, "Additional properties")
                del cursor["extra"]
                del cursor[next(iter(cursor))]
                self.assert_invalid(document, "required property")
        document = fixture()
        document["observations"] = []
        self.assert_invalid(document)

    def test_synthetic_scope_and_fixed_labels_units(self):
        mutations = [
            (["schemaVersion"], "2.0.0"), (["dataset", "mode"], "observed"),
            (["dataset", "label"], "market data"), (["dataset", "freshness"], "fresh"),
            (["dataset", "timezone"], "UTC"), (["observations", 0, "provider"], "PNJ"),
            (["observations", 0, "brand"], "PNJ"), (["observations", 0, "product"], "world_gold"),
            (["observations", 0, "purity"], "995"), (["observations", 0, "region"], ""),
            (["observations", 0, "quotes", "currency"], "USD"),
            (["observations", 0, "quotes", "unit"], "vnd_per_chi"),
            (["observations", 0, "time", "timezone"], "UTC"),
            (["observations", 0, "provenance", "provider"], "SJC"),
            (["observations", 0, "provenance", "sourceUrl"], "https://sjc.com.vn/"),
            (["observations", 0, "qualityFlags", "priceIntegrity"], "negative"),
        ]
        for path, value in mutations:
            with self.subTest(path=path, value=value):
                document = fixture()
                set_path(document, path, value)
                self.assert_invalid(document)

    def test_noncanonical_prices_and_numeric_types(self):
        bad = ["0", "-0", "-1", "01", "1.50", "1.0", ".5", "+0.5", "1e3", "1E3", " 1", "1 ", "1\n", "NaN", "Infinity", 1, 0.5, True, "1" * 129]
        fields = [("quotes", "buy"), ("quotes", "sell"), ("provenance", "originalBuy"), ("provenance", "originalSell")]
        for group, field in fields:
            for value in bad:
                with self.subTest(field=field, value=value):
                    document, row = self.one_row()
                    row[group][field] = value
                    self.assert_invalid(document)
        for value in ["-0", "-0.0", "+0.5", "01", "1.50", "1e3", "0.0", "0\n", 0, -0.5, True]:
            with self.subTest(spread=value):
                document, row = self.one_row()
                row["quotes"]["spread"] = value
                self.assert_invalid(document)

    def test_exact_unit_conversion_rejects_factor_and_side_tampering(self):
        for index in (0, 4, 7):
            document, row = self.one_row(index)
            row["provenance"]["conversionFactor"] = "1000" if index != 4 else "10000"
            seal(row)
            self.assert_invalid(document, "conversion factor")
            document, row = self.one_row(index)
            row["provenance"]["originalBuy"] = "1"
            seal(row)
            self.assert_invalid(document, "exact unit conversion")
        for index, field in ((5, "originalBuy"), (6, "originalSell")):
            document, row = self.one_row(index)
            row["provenance"][field] = "1"
            seal(row)
            self.assert_invalid(document, "null together")

    def test_spread_null_arithmetic_and_integrity(self):
        for index, spread in ((0, None), (0, "1"), (5, "0"), (6, "0")):
            document, row = self.one_row(index)
            row["quotes"]["spread"] = spread
            seal(row)
            self.assert_invalid(document, "spread must")
        for index, flag in ((0, "spread_inverted"), (8, "valid")):
            document, row = self.one_row(index)
            row["qualityFlags"]["priceIntegrity"] = flag
            self.assert_invalid(document, "price integrity")
        document, row = self.one_row(8)
        row["qualityFlags"]["spread_inverted"] = True
        self.assert_invalid(document, "Additional properties")

    def test_high_precision_arithmetic_exceeds_default_decimal_context(self):
        document, row = self.one_row(7)
        buy, sell = "1234567890123456789012345678901234567890.12345678901234567890123456789", "1234567890123456789012345678901234567890.123456789012345678901234567891"
        row["quotes"].update(buy=buy, sell=sell, spread="0." + "0" * 29 + "1")
        row["provenance"].update(originalBuy=buy, originalSell=sell)
        seal(row)
        self.assertEqual(validate_gold_quotes(document), [])
        row["quotes"]["spread"] = "0"
        seal(row)
        self.assert_invalid(document, "spread must")
        document, row = self.one_row(0)
        original = "1234567890123456789012345678901234567890.1234567890123456789"
        with localcontext() as context:
            context.prec = 300
            converted = format(Decimal(original) * 10000, "f").rstrip("0").rstrip(".")
        row["quotes"].update(buy=converted, sell=converted, spread="0")
        row["provenance"].update(originalBuy=original, originalSell=original)
        seal(row)
        self.assertEqual(validate_gold_quotes(document), [])

    def test_timestamp_aliases_and_invalid_calendar_are_rejected(self):
        bad = ["2026-10-15T02:00:00Z", "2026-10-15T02:00:00.000Z", "2026-10-15T09:00:00.000000+07:00",
               "2026-10-15T02:00:00.000000+00:00", "2026-10-15T02:00:00.0000000Z", "2026-10-15T02:00:00.000000z",
               "2026-02-30T02:00:00.000000Z", "2026-02-29T02:00:00.000000Z", "0000-01-01T02:00:00.000000Z",
               "2026-10-15T24:00:00.000000Z", "2026-10-15T02:60:00.000000Z", "2026-10-15T02:00:60.000000Z"]
        for field in ("sourceAsOf", "collectedAt"):
            for value in bad:
                with self.subTest(field=field, value=value):
                    document, row = self.one_row()
                    row["time"][field] = value
                    seal(row)
                    self.assert_invalid(document)
        document, row = self.one_row()
        row["time"]["sourceAsOf"] = "2026-10-15T02:00:01.123457Z"
        seal(row)
        self.assert_invalid(document, "later than collectedAt")

    def test_reference_date_uses_source_or_collection_in_vietnam(self):
        for source, collected, day in [
            ("2026-10-14T16:59:59.999999Z", "2026-10-15T02:00:00.000000Z", "2026-10-14"),
            ("2026-10-14T17:00:00.000000Z", "2026-10-15T02:00:00.000000Z", "2026-10-15"),
            (None, "2026-10-14T16:59:59.999999Z", "2026-10-14"),
            (None, "2026-10-14T17:00:00.000000Z", "2026-10-15"),
            (None, "2028-02-29T17:00:00.000000Z", "2028-03-01"),
            (None, "2026-12-31T17:00:00.000000Z", "2027-01-01"),
        ]:
            with self.subTest(source=source, collected=collected):
                document, row = self.one_row()
                row["time"].update(sourceAsOf=source, collectedAt=collected, referenceDate=day,
                                   referenceDateType="source_date" if source else "collected_date")
                row["qualityFlags"]["sourceTimestampStatus"] = "verified" if source else "unknown"
                seal(row)
                self.assertEqual(validate_gold_quotes(document), [])
                row["time"]["referenceDate"] = "2026-02-30"
                self.assert_invalid(document, "reference date/type")
        document, row = self.one_row()
        row["time"]["referenceDateType"] = "collected_date"
        self.assert_invalid(document, "reference date/type")

    def test_honest_source_and_region_quality(self):
        for index, field, value in [(0, "sourceTimestampStatus", "unknown"), (5, "sourceTimestampStatus", "verified"),
                                    (0, "regionStatus", "unverified"), (5, "regionStatus", "verified"),
                                    (5, "regionStatus", "not_applicable")]:
            document, row = self.one_row(index)
            row["qualityFlags"][field] = value
            self.assert_invalid(document)
        document, row = self.one_row(0)
        self.assertNotEqual(row["requestedRegion"], row["region"])
        self.assertEqual(validate_gold_quotes(document), [])

    def test_golden_jcs_null_unicode_and_all_series_dimensions(self):
        row = fixture()["observations"][0]
        expected = '["gold_asset","marketpulse-fixture","SJC","gold_bar_sjc","999.9","Hồ Chí Minh"]'
        self.assertEqual(rfc8785.dumps(asset_identity(row)), expected.encode("utf-8"))
        self.assertEqual(row["assetId"], "2904f49d38ee84fe6e091f593fad4fbc24712573280be3a603ddbed0f49b65f8")
        self.assertEqual(row["snapshotId"], "a5142ae6f8869ebdddcb7bd03b417c186e5d9508047cbf80761bcb54920c2b40")
        self.assertEqual(row["contentDigest"], "f9886eda80332388a22daebe2bd65f826b118fdd67206a000b2a2340314c3861")
        for key in ("provider", "brand", "product", "purity", "region"):
            changed = copy.deepcopy(row)
            changed[key] = "another-value"
            self.assertNotEqual(digest(asset_identity(changed)), row["assetId"], key)
        unknown = fixture()["observations"][5]
        self.assertIsNone(asset_identity(unknown)[-1])
        changed = copy.deepcopy(unknown)
        changed["region"] = "null"
        self.assertNotEqual(digest(asset_identity(unknown)), digest(asset_identity(changed)))

    def test_tagged_snapshot_identity_unknown_refetch_and_replay(self):
        row = fixture()["observations"][0]
        known = copy.deepcopy(row)
        unknown = copy.deepcopy(row)
        unknown["time"]["sourceAsOf"] = None
        unknown["time"]["collectedAt"] = known["time"]["sourceAsOf"]
        self.assertNotEqual(digest(snapshot_identity(known)), digest(snapshot_identity(unknown)))
        rows = fixture()["observations"]
        self.assertNotEqual(rows[9]["snapshotId"], rows[10]["snapshotId"])
        self.assertEqual(rows[9]["contentDigest"], rows[10]["contentDigest"])
        replay = copy.deepcopy(rows[9])
        seal(replay)
        self.assertEqual(replay, rows[9])

    def test_verified_a_b_a_reuses_content_hash_and_later_snapshot_is_new(self):
        rows = fixture()["observations"]
        self.assertEqual(rows[0]["snapshotId"], rows[1]["snapshotId"])
        self.assertEqual(rows[0]["snapshotId"], rows[2]["snapshotId"])
        self.assertNotEqual(rows[0]["contentDigest"], rows[1]["contentDigest"])
        self.assertEqual(rows[0]["contentDigest"], rows[2]["contentDigest"])
        self.assertNotEqual(rows[0]["snapshotId"], rows[3]["snapshotId"])
        self.assertNotEqual(rows[0]["contentDigest"], rows[3]["contentDigest"])

    def test_hashes_exclude_observation_metadata_but_include_all_economics(self):
        document, row = self.one_row()
        original = row["contentDigest"]
        row["time"]["collectedAt"] = "2026-10-15T05:00:00.000000Z"
        row["requestedRegion"] = "11"
        row["provenance"].update(adapterVersion="1.0.1", sourceUrl="https://marketpulse.invalid/gold/replay")
        self.assertEqual(digest(economic_content(row)), original)
        self.assertEqual(validate_gold_quotes(document), [])
        row["qualityFlags"]["regionStatus"] = "unverified"
        self.assertEqual(digest(economic_content(row)), original)
        for group, field, value in [("quotes", "buy", "1"), ("quotes", "sell", "1"), ("quotes", "spread", "1"),
                                     ("quotes", "currency", "USD"), ("quotes", "unit", "vnd_per_chi"),
                                     ("provenance", "provider", "PNJ"), ("provenance", "originalBuy", "1"),
                                     ("provenance", "originalSell", "1"), ("provenance", "originalUnit", "vnd_per_tael"),
                                     ("provenance", "conversionFactor", "1"), ("time", "sourceAsOf", None)]:
            changed = copy.deepcopy(row)
            changed[group][field] = value
            self.assertNotEqual(digest(economic_content(changed)), original, (group, field))
        changed = copy.deepcopy(row)
        changed["assetId"] = "0" * 64
        self.assertNotEqual(digest(economic_content(changed)), original)

    def test_tampered_ids_and_digests(self):
        for field, message in [("assetId", "asset identity"), ("snapshotId", "snapshot identity"), ("contentDigest", "content digest")]:
            document, row = self.one_row()
            row[field] = "0" * 64
            self.assert_invalid(document, message)

    def test_cli_rejects_duplicate_keys_malformed_json_and_missing_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "fixture.json"
            for content in ['{"schemaVersion":"1.0.0","schemaVersion":"1.0.0"}', '{"quotes":NaN}', '{']:
                path.write_text(content, encoding="utf-8")
                result = subprocess.run([sys.executable, str(ROOT / "scripts/validate_gold_quotes.py"), str(path)],
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 1)
                self.assertNotIn("Traceback", result.stderr)
            path.unlink()
            result = subprocess.run([sys.executable, str(ROOT / "scripts/validate_gold_quotes.py"), str(path)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import copy
import json
import math
import unittest
from pathlib import Path

from scripts.validate_market_data import FIXTURE_PATH, validate_market_data


def fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


class MarketDataContractTests(unittest.TestCase):
    def test_committed_fixture_has_expected_inventory_and_validates(self):
        document = fixture()
        self.assertEqual(
            {asset["symbol"] for asset in document["assets"]},
            {"FPT", "VCB", "HPG", "VNM", "SSI", "VIC", "VHM", "MSN", "MWG", "BID", "VNINDEX"},
        )
        self.assertEqual((len(document["assets"]), len(document["candles"]), len(document["quotes"]), len(document["indexObservations"])), (11, 33, 10, 1))
        self.assertEqual(validate_market_data(document), [])

    def assert_invalid(self, document: dict, expected: str) -> None:
        errors = validate_market_data(document)
        self.assertTrue(any(expected in error for error in errors), "\n".join(errors))

    def test_equity_must_use_vnd_and_full_dong_unit(self):
        document = fixture()
        document["assets"][0]["currency"] = None
        self.assert_invalid(document, "equities must use currency VND and unit VND")

    def test_index_must_not_use_vnd(self):
        document = fixture()
        index = next(asset for asset in document["assets"] if asset["assetType"] == "index")
        index["currency"] = "VND"
        index["unit"] = "VND"
        self.assert_invalid(document, "indices must use null currency and unit index_point")

    def test_asset_id_must_match_exchange_and_symbol(self):
        document = fixture()
        document["assets"][0]["assetId"] = "VN:HOSE:OTHER"
        self.assert_invalid(document, "assetId must match VN:{exchange}:{symbol}")

    def test_impossible_calendar_date_is_rejected(self):
        document = fixture()
        document["candles"][0]["tradingDate"] = "2026-02-30"
        self.assert_invalid(document, "is not a 'date'")

    def test_naive_timestamp_is_rejected(self):
        document = fixture()
        document["candles"][0]["asOf"] = "2026-09-21T15:00:00"
        self.assert_invalid(document, "is not a 'date-time'")

    def test_invalid_offset_minutes_are_rejected(self):
        document = fixture()
        document["candles"][0]["asOf"] = "2026-09-21T15:00:00+07:99"
        self.assert_invalid(document, "is not a 'date-time'")

    def test_ingestion_cannot_precede_observation(self):
        document = fixture()
        document["candles"][0]["ingestedAt"] = "2026-09-21T14:59:00+07:00"
        self.assert_invalid(document, "ingestedAt must not be earlier than asOf")

    def test_unknown_asset_reference_is_rejected(self):
        document = fixture()
        document["candles"][0]["assetId"] = "VN:HOSE:OTHER"
        self.assert_invalid(document, "unknown asset ID")

    def test_duplicate_candle_identity_is_rejected(self):
        document = fixture()
        document["candles"].append(copy.deepcopy(document["candles"][0]))
        self.assert_invalid(document, "duplicate candle identity")

    def test_nonfinite_numeric_value_is_rejected_cleanly(self):
        document = fixture()
        document["quotes"][0]["change"] = math.nan
        self.assert_invalid(document, "numeric values must be finite")

    def test_negative_price_is_rejected(self):
        document = fixture()
        document["candles"][0]["close"] = -1
        self.assert_invalid(document, "minimum of 0")

    def test_boolean_cannot_be_a_price(self):
        document = fixture()
        document["quotes"][0]["lastPrice"] = True
        self.assert_invalid(document, "is not of type 'number'")

    def test_inverted_ohlc_is_rejected(self):
        document = fixture()
        document["candles"][0]["high"] = document["candles"][0]["low"] - 1
        self.assert_invalid(document, "OHLC must satisfy")

    def test_missing_source_provenance_is_rejected(self):
        document = fixture()
        del document["quotes"][0]["source"]
        self.assert_invalid(document, "'source' is a required property")

    def test_previous_close_must_match_prior_available_candle(self):
        document = fixture()
        document["quotes"][0]["previousClose"] += 1
        self.assert_invalid(document, "baseline must equal the identified prior candle close")

    def test_missing_baseline_keeps_derived_fields_null(self):
        document = fixture()
        asset_id = "VN:HOSE:FPT"
        document["candles"] = [
            row for row in document["candles"]
            if row["assetId"] != asset_id or row["tradingDate"] == "2026-09-23"
        ]
        quote = next(row for row in document["quotes"] if row["assetId"] == asset_id)
        quote.update(previousTradingDate=None, previousClose=None, change=None, changePercent=None)
        self.assertEqual(validate_market_data(document, fixture_only=False), [])

    def test_change_cannot_be_fabricated_without_baseline(self):
        document = fixture()
        asset_id = "VN:HOSE:FPT"
        document["candles"] = [
            row for row in document["candles"]
            if row["assetId"] != asset_id or row["tradingDate"] == "2026-09-23"
        ]
        quote = next(row for row in document["quotes"] if row["assetId"] == asset_id)
        quote.update(previousTradingDate=None, previousClose=None, change=1, changePercent=0.01)
        self.assert_invalid(document, "change fields must be null when previousClose is null")

    def test_change_percent_must_match_rounded_formula(self):
        document = fixture()
        document["quotes"][0]["changePercent"] += 0.01
        self.assert_invalid(document, "changePercent must be the percent change")

    def test_quote_must_match_latest_candle_value(self):
        document = fixture()
        document["quotes"][0]["lastPrice"] += 1
        self.assert_invalid(document, "latest quote/index value must equal the matching candle close")

    def test_quote_and_candle_as_of_must_align(self):
        document = fixture()
        document["quotes"][0]["asOf"] = "2026-09-23T15:01:00+07:00"
        self.assert_invalid(document, "asOf must match the aligned candle asOf")

    def test_fixture_cannot_claim_live_mode_or_freshness(self):
        document = fixture()
        document["dataset"].update(mode="observed", label="Provider export", freshness="current", sessionCalendar="verified")
        for group in ("candles", "quotes", "indexObservations"):
            for row in document[group]:
                row["source"].update(mode="observed", provider="provider-name")
        self.assert_invalid(document, "fixture validation requires mode='fixture'")

    def test_fixture_cannot_be_marked_current(self):
        document = fixture()
        document["dataset"]["freshness"] = "current"
        self.assert_invalid(document, "fixture freshness must remain")

    def test_unsupported_decimal_precision_returns_validation_error(self):
        document = fixture()
        prior = document["candles"][1]
        latest = next(candle for candle in document["candles"] if candle["assetId"] == "VN:HOSE:FPT" and candle["tradingDate"] == "2026-09-23")
        quote = next(row for row in document["quotes"] if row["assetId"] == "VN:HOSE:FPT")
        prior.update(open=1e-20, high=1e-20, low=1e-20, close=1e-20)
        latest.update(open=1e20, high=1e20, low=1e20, close=1e20)
        quote.update(lastPrice=1e20, previousClose=1e-20, change=1e20)
        self.assert_invalid(document, "values exceed supported decimal precision")


if __name__ == "__main__":
    unittest.main()

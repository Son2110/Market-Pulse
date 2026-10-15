# Synthetic gold contract fixture

**SYNTHETIC FIXTURE — NOT MARKET DATA · fixture / unknown.** All prices, source times,
regions and identifiers are invented for offline contract checks. `marketpulse-fixture`
is the provider; SJC and PNJ identify the separate synthetic product brands, not a claim
that either company supplied or licensed these records. URLs use the reserved
`marketpulse.invalid` domain. This fixture gives no investment advice.

The closed envelope uses `schemaVersion: "1.0.0"`, `dataset` labels and `observations`.
The schema is [gold-quotes-v1](../../packages/schemas/gold-quotes-v1.schema.json).
Run from the repository root after installing `requirements-dev.txt`:

```text
python scripts/validate_gold_quotes.py
python -m unittest discover -s tests -v
npm run test:unit
```

This is a standalone validation artifact. The existing collector, ingestion routes,
database, public APIs and UI do not consume it. No provider calls are made.

| Rows (one based) | Synthetic scenario |
|---|---|
| 1–3 | SJC bar, same verified source snapshot, contents A → B → A at later collection times; A's digest recurs. |
| 4 | Same product/prices as A at a later source timestamp: a new snapshot and content digest. |
| 5 | PNJ plain ring 9999, thousand VND per tael conversion. |
| 6 | Unknown source time/region; missing buy; requested region `11` does not establish applied region. |
| 7 | Unknown source time/region; missing sell. |
| 8–9 | Fractional positive/inverted spreads `0.5` and `-0.5`; source dates straddle midnight in UTC+7. |
| 10–11 | Positive fractional buy/sell, zero spread, unchanged unknown-source content fetched a microsecond later: separate snapshots, equal content digests. |

`assetId` is SHA-256 of RFC 8785 JCS of
`["gold_asset", provider, brand, product, purity, region]`; absent region is JSON `null`.
`snapshotId` hashes `[assetId, snapshotKey]`, with `source:<sourceAsOf>` for a verified
source timestamp and `observation:<collectedAt>` otherwise. Both timestamps require
exact UTC `YYYY-MM-DDTHH:mm:ss.ffffffZ`. Every new unknown-source fetch gets its own
snapshot, even if prices are unchanged; replay preserves the original `collectedAt`.
No inferred first-seen grouping is used.

`contentDigest` hashes JCS of exactly
`{assetId, sourceAsOf, quotes: {buy, sell, spread, currency, unit}, provenance:
{provider, originalBuy, originalSell, originalUnit, conversionFactor}}`.
Collection metadata, requested region, quality flags, adapter version and URL are
excluded. All three hashes have committed expected values checked in Python and
Node, including a non-ASCII region. These checks establish contract identities;
they do not implement storage deduplication, ordering or projection convergence.

Buy/sell and original sides are positive canonical decimal strings or `null`;
spread is signed canonical decimal or `null`, with only `"0"` representing zero.
Each string is bounded at 128 characters. The validator uses sufficient decimal
precision for these bounds; binary floats, exponents, leading/trailing zeros and
negative zero are rejected. Original units multiply by exactly `10000`, `1000` or
`1` to reach `vnd_per_tael`; currency is VND. Missing sides remain missing and force
null spread. Inversion is preserved with `qualityFlags.priceIntegrity:
"spread_inverted"`; there is no duplicate boolean flag.

`time.referenceDate` derives from verified `sourceAsOf`, otherwise `collectedAt`,
in `Asia/Ho_Chi_Minh`; `referenceDateType` states which. Source time cannot exceed
collection time. `qualityFlags.sourceTimestampStatus` describes source-time
presence, without changing fixture freshness. A non-null applied region requires
`regionStatus: "verified"`; null uses `unverified`, or `not_applicable` when no
region was requested. All verification flags here describe invented scenarios.

The validator enforces record shape, identities and arithmetic. It cannot prove
that an upstream source published buy and sell atomically; a future adapter must
verify pairing and must preserve separate snapshots when sides have different
source times. The source-rights gate remains closed.

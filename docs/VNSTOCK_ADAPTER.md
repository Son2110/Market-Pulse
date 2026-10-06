# Optional Vnstock/KBS adapter — FR-18 slice 1

**06/10/2026:** MP-11 is reopened for the owner's chosen Vnstock main flow before MP-12. This first local integration collects only `FPT` and `VNINDEX` daily candles in memory. The normal fixture collector, ingestion API/worker, persisted collections, public reads and web still use their existing fixture boundary. It does not complete MP-11 or verify a deployable live product.

## Manual use

The separate command requires `--enable-vnstock` on every invocation. Install the optional pinned requirements in a dedicated environment, along with the repository's existing `requirements-dev.txt`. Vnstock's official vendor index is `https://vnstocks.com/api/simple`; follow its current installation instructions. The existing `.venv/vnstock-probe` already has Vnstock 4.0.8/vnai 2.6.2; this task did not reinstall or update either package. Fixture CI and Compose do not install or import them.

```powershell
$env:PYTHONPATH = 'services/collector;.'
python -m collector.vnstock_cli --enable-vnstock --symbol FPT --start 2026-09-27 --end 2026-10-06
python -m collector.vnstock_cli --enable-vnstock --symbol VNINDEX --start 2026-09-27 --end 2026-10-06
```

Use the Python executable for the optional environment. This task's existing provider environment lacked jsonschema, so the manual checks used a transient PYTHONPATH to the already installed contract dependency; no package installation was needed. No credentials were supplied. The child sets `VNSTOCK_DISABLE_AGENT_SETUP=1` and `VNSTOCK_TELEMETRY=off` before importing the provider.

`collect(...)` returns the validated v2 document and safe metadata in memory. The CLI prints only status, counts, date bounds, versions, request times, field types and validation result. It offers no save, submit or raw-output switch. Do not copy observations into fixtures or commit a provider response.

The explicit path is `vnstock.common.data.Quote(symbol=..., source="KBS").history(...)`, forwarding `interval="1D"`, `to_df=False` and `floating=None`. The installed facade delegates to KBS without source fallback. Tenacity `retry_with(stop_after_attempt(1))` sets one attempt; `RETRY_AFTER_MAX_WAIT=0` prevents Retry-After replay. The provider's block detection and quota checks remain active. A block, challenge, quota or rate limit stops the call; there is no bypass, automatic retry, scheduler or loop across symbols. The exact KBS transport has a 30-second HTTP timeout. A spawned process has a default 45-second wait bound, configurable from 1–60 seconds, with at most four seconds for terminate/kill cleanup. Library stdout/stderr are suppressed; safe error categories replace exception text.

## Observed contract and normalization

[`observed-candles-v2.schema.json`](../packages/schemas/observed-candles-v2.schema.json) is a separate, versioned daily candle subset. Existing fixture v1 stays strict and unchanged. The new schema/validator do not authorize delivery to the current v1 ingestion endpoint.

- Equity prices are decimal strings in full `VND`; index prices are decimal strings in `index_point`, with currency null. Decimal normalization preserves the numeric precision returned by the library without additional binary arithmetic, DataFrame rounding or equity `/1000` conversion. The installed transport first uses `response.json()` with default float decoding, then KBS `to_df=False` serializes those rows with `json.dumps()`. Original wire precision may already be lost; this adapter cannot guarantee it. Its raw VND denomination follows the official community changelog stating that KBS history was changed from VND to thousand VND for normalized output, combined with the exact installed conversion. Index code explicitly skips the scale conversion. This is implementation/documentation evidence, not an independently reconciled exchange feed.
- Equity `adjustmentBasis` is `unknown`; index uses `not_applicable`. No adjustment claim from the separate sponsor `vnstock_data` package is applied to community KBS.
- Raw time strings observed here have `yyyy-MM-dd HH:mm` format without an offset. The exact `providerTimeLabel` is preserved and its calendar date becomes `tradingDate`. `timeProvenance: provider_naive_calendar_label` records that choice. `Asia/Ho_Chi_Minh` identifies the target market calendar; the naive label is never localized into an instant or treated as the session close. `sourceAsOf: null` means the source did not supply a verified exact as-of. `collectedAt` is the actual UTC completion time, independently recorded.
- Dataset mode is `observed`, freshness `unknown`, and session calendar `unverified`. Seven returned dates do not establish session completeness, currentness, delay or future quota stability. Missing dates remain missing.
- Volume is deliberately null for both symbols with `volumeUnit: not_available`: raw `v` exists, but this slice does not claim its unverified upstream units/coverage. No quote, index-summary or price-change records are synthesized.
- Inputs permit only the two symbols and daily interval, with a date range spanning at most 31 days and at most 32 rows. Strict parsing rejects duplicate keys/non-finite constants in the library-returned JSON; bounded Decimal conversion rejects hostile exponents, booleans and invalid values. Upstream duplicate keys may already have been collapsed by the library's `response.json()` decoding, so wire-level duplicate-key detection is unavailable through this path. Validation rejects wrong types, zero/negative/non-finite OHLC, inverted bounds, duplicate/out-of-range dates, asset/unit mismatches, malformed time labels, unknown fields and digest tampering. Empty rows are a valid `no_data` result; a provider exception signalling no data remains a sanitized provider failure, rather than an invented empty success.

`barId` hashes the typed tuple `["KBS", assetId, interval, tradingDate, adjustmentBasis]`; retrieval time does not affect it. `contentDigest` hashes compact sorted-key JSON of all candle fields except `collectedAt`, `barId` and the digest itself. Prices are canonical decimal strings. A refetch preserves identity and content digest; revised values preserve identity and change the content digest. This is an adapter identity proposal, not the current Node RFC 8785 delivery digest or an implemented persistence policy.

## Bounded runtime evidence

Requested date range was 27/09–06/10/2026. The final two corrected calls used the same adapter and exact installed versions. Only metadata is recorded below; fetched documents were discarded after in-memory validation.

| Symbol | Validated candles | Returned calendar dates | Request UTC start → finish | Duration |
|---|---:|---|---|---:|
| FPT | 7 | 28/09–06/10/2026 | 2026-10-06T13:15:13.399387Z → 13:15:13.942646Z | 0.543 s |
| VNINDEX | 7 | 28/09–06/10/2026 | 2026-10-06T13:17:17.858108Z → 13:17:18.285958Z | 0.428 s |

In the library-returned JSON, FPT OHLC and `v` were integers; `t` was a string; `va` was integer/null. VNINDEX OHLC mixed JSON numbers and numeric strings, and `v` mixed integers/strings. Fractional numbers in that returned JSON were decoded as Decimal; these type checks do not inspect the original wire response. Both normalized envelopes passed schema, OHLC bounds, date bounds, uniqueness, units, provenance and digest checks. Both preserve unknown freshness/as-of and null volume.

Earlier attempts are diagnostic evidence: the first FPT call under restricted networking failed with `provider_transport_error`; a scoped network call reached KBS. An initial VNINDEX and a diagnostic FPT call returned rows but failed the initial parser's seconds-precision assumption. The diagnostic FPT call at 07:15:56.709784Z–07:15:57.227314Z returned seven rows in 0.518 s and established the minute-label format. The parser was corrected and each symbol was called once more with explicit coordinator authorization. No deny/challenge/rate limit was observed or retried. These local attempts establish technical integration for two samples only; they do not repeat the earlier 11-symbol coverage check or verify public redisplay rights.

## Checks and next serial slice

Run the existing offline fixture validator and both Python test suites:

```sh
python scripts/validate_market_data.py
python -m unittest discover -s tests -v
python -m unittest discover -s services/collector/tests -v
python scripts/check_docs.py
python scripts/build_docs.py
git diff --check
```

Tests use independently authored synthetic rows and a fake library facade, including one-call forwarding, preservation of library-returned numeric precision, malformed data, hostile decimals, duplicate keys in returned JSON, identity/refetch/revision, timeout cleanup, safe metadata and opt-in. They do not establish wire-level precision or duplicate-key guarantees. The default fixture path is checked with network access prohibited and no `vnstock` module imported. Live calls stay outside CI.

Local checks passed on 06/10/2026: fixture validator; 27 contract tests (24 existing v1 plus three v2); 25 collector tests (six existing plus 19 adapter tests); 92 local documentation targets; documentation portal build with 19 documents; and diff whitespace check. The original project brief retains SHA-256 `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`. No Node files changed, so the Node runtime suite was not rerun for this Python/docs slice. Independent coordinator review and remote CI are separate from these worker checks.

The next MP-11 slice must define isolated observed delivery/storage and a revision policy before changing Node ingestion. Current `canonical_assets` hashes both asset and dataset under assetId, so fixture and observed records can conflict. Current observation digests include dataset/`ingestedAt`, so a later refetch can also conflict. Do not submit this v2 envelope to that endpoint, relabel fixtures, overwrite existing identities or reuse immutable storage without a deliberate migration. After observed ingestion/replay is tested and reviewed, migrate stored public reads, then design/implement web pages serially through Stitch. MP-12 freshness/retry/cache remains later.

Software licensing does not establish upstream public display, redistribution or deployment rights. Those remain unresolved deployment limitations, along with freshness, adjustment semantics and calendar verification. Unknown adjustment/as-of are represented honestly for this authorized local integration; they do not erase the working adapter. MarketPulse remains an information/research product and gives no investment advice.

Primary evidence: [community changelog, KBS unit changes on 01/02 and 07/03/2026](https://vnstocks.com/docs/tai-lieu/lich-su-phien-ban), [official Vnstock normalization explanation](https://vnstocks.com/blog/chuan-hoa-du-lieu-chung-khoan-python-vibe-coding), [community market data](https://vnstocks.com/docs/vnstock/du-lieu-thi-truong-market-data), [software license and separate upstream rights](https://vnstocks.com/onboard/giay-phep-su-dung). Local package code inspected: `vnstock/common/data.py`, `vnstock/api/quote.py`, `vnstock/ui/market.py`, `vnstock/explorer/kbs/quote.py`, `vnstock/core/utils/client.py`, and vnai quota wrappers, versions 4.0.8/2.6.2.

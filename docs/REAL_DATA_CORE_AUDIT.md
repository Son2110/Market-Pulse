# Bounded real-data core audit — FPT / VNINDEX

**Audit date:** 02/11/2026 (`Asia/Ho_Chi_Minh`). **Repository baseline:** `084b748` on `docs/real-data-fpt-vnindex-audit`. **Result:** `AUDITED_WITH_OPEN_GATES`; the two manual technical probes succeeded, while daily collection, storage and product display remain closed pending purpose-specific source evidence and correctness work. This is not real-data product acceptance or investment advice.

## Scope and authorization

The owner authorized two serial manual technical probes through the existing CLI: FPT, then VNINDEX, daily interval, inclusive dates `2026-10-26`–`2026-10-30`, using the existing `.venv/vnstock-probe/Scripts/python.exe`. Each command used `--enable-vnstock --timeout-seconds 45` without `--submit`. No credentials, installation, dependency update, app/schema/fixture change, flag change, scheduler, database write or basket expansion was performed. No prices or candle payloads were printed or saved by these commands; only counts, date bounds, versions, time/type metadata and validation results are retained here. The in-memory documents were discarded.

Owner permission authorizes this bounded project action; it does **not** grant KBS, exchange or other upstream data rights. Software licensing and technical reachability are separate evidence. Neither a successful probe nor this audit opens an unknown purpose.

The installed license summary was read from disk **before importing the provider**. Static inspection verified the existing request guardrails: only FPT/VNINDEX and `1d`; date difference at most 31 days; at most 32 returned rows; returned JSON at most 65,536 bytes; one Tenacity attempt; `RETRY_AFTER_MAX_WAIT=0`; explicit KBS with no source fallback. The installed HTTP timeout is 30 seconds; the spawned process waits at most 45 seconds plus at most four seconds for terminate/kill cleanup. Deny, challenge or rate limit would stop the sequence without another symbol, retry or bypass. Neither probe reported those conditions. Agent setup and telemetry are disabled by the existing collector before provider import; other library/account/quota mechanisms are not bypassed.

## Reproducible environment and exact artifacts

No environment was installed or upgraded. Python is `3.10.0`; installed package metadata and import locations were inspected without importing vnstock. The provider environment lacks `jsonschema` and `rfc8785`, so the historical transient dependency approach was reused: `PYTHONPATH` included `services/collector`, the repository root, the existing Python 3.10 user site-packages and global site-packages. Resolution was checked before probes: vnstock and vnai still came from `.venv/vnstock-probe`; jsonschema `4.26.0` came from the user site and rfc8785 `0.1.4` from the global site. Requests `2.34.2` and pandas `2.3.3` resolved from the global site; Tenacity `9.1.4` resolved from the provider environment. These are the actual mixed environment resolutions, not a claim of a fresh isolated install.

| Artifact | Version / SHA-256 |
|---|---|
| vnstock / vnai | `4.0.8` / `2.6.2` (CLI also checked exact versions) |
| Installed `vnstock/explorer/kbs/quote.py` | `AFA456A6EE0796C4B896E777060BDA2A0C4636E0A51C641526DC43FED1D2ACEC` |
| Installed `vnstock/core/utils/client.py` | `171621E84240EE6891581AEFBAF24F6716344E360EF14376C15CE27061BF9DAF` |
| Installed `vnstock-4.0.8.dist-info/licenses/LICENSE.md` | `2658EBA078DF3A4BC45ABB8FDDF1330D903D49F5F8FD59C7EEE3DBBA7FC0D644` |
| Original project brief, unchanged | `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8` |

The command shape was identical for each symbol, invoked once in the order above:

```powershell
.venv/vnstock-probe/Scripts/python.exe -m collector.vnstock_cli --enable-vnstock --symbol FPT --start 2026-10-26 --end 2026-10-30 --timeout-seconds 45
.venv/vnstock-probe/Scripts/python.exe -m collector.vnstock_cli --enable-vnstock --symbol VNINDEX --start 2026-10-26 --end 2026-10-30 --timeout-seconds 45
```

The existing facade calls `vnstock.common.data.Quote(symbol=..., source="KBS").history(...)` with `interval="1D"`, `to_df=False`, `floating=None`. Installed KBS code constructs the stock/index daily paths under `https://kbbuddywts.kbsec.com.vn/iis-server/investment`, with `sdate`/`edate`; this audit did not call those endpoints separately. Scoped network execution succeeded on the first attempt for each command. There was no transport-failure retry.

## Actual probe observations

| Symbol | Status / validated candles | Returned calendar range | Request UTC start → finish | Provider-call duration |
|---|---|---|---|---|
| FPT | `available` / 5 | `2026-10-26`–`2026-10-30` | `2026-11-02T03:49:39.165020Z` → `2026-11-02T03:49:39.987376Z` | 0.822 s |
| VNINDEX | `available` / 5 | `2026-10-26`–`2026-10-30` | `2026-11-02T03:50:03.154125Z` → `2026-11-02T03:50:03.710054Z` | 0.556 s |

Each envelope had one asset, schema `2.0.0` and `invariantsValid=true`. Both reported `providerTimeFormat=["yyyy-MM-dd HH:mm"]`, `sourceAsOf=null`, `volumeAvailable=false`, freshness `unknown` and session calendar `unverified`. FPT returned library-JSON integer types for OHLC, `v` and `va`. VNINDEX OHLC decoded as Decimal, except `l` mixed Decimal/int; `v` was int and `va` was absent. These are types **after** the library's HTTP JSON decode and serialization, not a wire-format inspection.

Five valid, unique in-range dates establish only the returned sample's bounded date coverage. They do not verify the exchange holiday/session calendar, source publication time, EOD finality, delay, present freshness, availability on other dates/symbols or future quota. No refetch was made, so no real-source revision or repeatability claim follows. The earlier 06/10 and 07/10 observations remain historical evidence in [the adapter handoff](VNSTOCK_ADAPTER.md).

## Semantics: verified boundary and remaining uncertainty

| Area | Verified in the installed path / current sample | Required interpretation or open evidence |
|---|---|---|
| Equity denomination | JSON return occurs before DataFrame equity `/1000` and rounding; adapter retains decimal strings labeled full `VND`. Official historical community changelog corroborates the VND-to-thousand-VND normalization change. | Implementation/documentation evidence, not independent KBS/exchange reconciliation. Verify against an authorized reference before product acceptance. |
| Index denomination | Installed code excludes indices from `/1000`; adapter labels `index_point`, currency null. | No index return/change is inferred from these levels. |
| Precision | Adapter parses library JSON floats as Decimal, canonicalizes decimal strings and validates positive OHLC/bounds/digests. | Installed transport calls default `response.json()` first and then `json.dumps()`: wire float precision or duplicate keys may already be lost. Decimal parsing cannot recover that loss. No wire-exact claim. |
| Adjustment | FPT `adjustmentBasis=unknown`; VNINDEX `not_applicable`. | No installed-path evidence here establishes corporate-action adjustment conventions or revision policy. Do not import a claim from sponsor `vnstock_data` or current v5 docs; no adjusted returns. |
| Time / timezone | Naive minute labels are preserved; their date becomes `tradingDate`. `Asia/Ho_Chi_Minh` labels the intended market calendar. | Do not localize the label into an instant or call it session close. `sourceAsOf=null`; `collectedAt` is independent UTC request completion, not source publication time. Calendar remains unverified. |
| Volume | Raw `v` exists in both samples; normalized `volume=null`, `volumeUnit=not_available`. | Numeric type does not establish unit, matched/negotiated scope or index aggregation. Missing/unverified volume is not zero. |
| Cadence / freshness / gaps | Two bounded historical windows were returned successfully. | No guaranteed EOD publication schedule, delay budget, official calendar reconciliation or complete history. Preserve missing dates and freshness/coverage unknown; do not interpolate. |
| Identity / revisions | Code uses stable provider/asset/interval/date/adjustment bar identity; content excludes collection time; delivery identity includes collection time. Existing synthetic tests cover refetch and revision distinctions. | These probes did not submit, replay or persist real observations and cannot verify actual source revisions or current database state. |
| Stored reads / partial batches | [Observed store](../apps/api/src/observed-store.ts) writes immutable revisions then per-bar latest projections, without a batch transaction; [history](../apps/api/src/observed-history.ts) selects latest per date. | Reads may mix deliveries and expose earlier rows from incomplete/failed batches. Receipt success is local persistence evidence, not freshness or complete coverage. This is an existing documented boundary, not a newly reproduced defect. |

## Purpose-specific rights decision

This is an evidence registry for project gates, not a legal opinion. `unknown` closes the relevant purpose. No upstream grant was located or supplied for these KBS paths during this bounded audit. Search results for KBS research-report copyright restrictions concern separate reports and were **not** treated as terms for the candle endpoints. Absence of endpoint terms is not permission or proof of prohibition.

| Purpose | Decision as of 02/11/2026 | Evidence and next gate |
|---|---|---|
| These two manual technical executions | Owner scope `allow`; upstream data entitlement `unknown` | Explicit bounded authorization and execution record above; no continuing access grant. |
| Automated / daily collection | `unknown` — closed | Need applicable upstream access terms, authorized account/tier where required, rate budget and stop rules. Two successes do not establish quota. |
| Persisting source payloads / normalized candles / revisions | `unknown` — closed | Need upstream storage rights and allowed fields/purposes; no new persistence in this audit. |
| Local application display | `unknown` — closed | Need purpose-specific source display evidence. Historical local technical observations do not grant continuing display rights. |
| Public redisplay / API distribution / deployment | `unknown` — closed | Need upstream redistribution/display terms; also resolve applicable software agreement requirements for third-party market-data access products. |
| Historical backfill / expanded windows or symbols | `unknown` — closed | Need history rights, limits and coverage/quota evidence. The five-day sample is not a backfill authorization. |
| Retention / deletion / backups | `unknown` — closed | Need allowed retention duration, deletion obligations and treatment of revisions/backups before durable collection. No retention policy is invented. |

The installed convenience license identifies **license-2026.09**, reserves third-party data rights and says the website governs differences. Its software conditions include device/tier constraints and separate written agreement for redistributing software/keys or operating a product primarily providing third parties market-data access. It is source-available under its own terms, not OSI open source. This does not establish any upstream allow row.

On 02/11 the [license URL](https://vnstocks.com/onboard/giay-phep-su-dung) redirected to [the policy page](https://vnstocks.com/policies/license), which identifies **license-2026.11**, published 24/10/2026, **effective 30/11/2026**, explicitly not yet effective. That future version cannot be described as the current agreement on 02/11. The full historical governing web text and account acceptance/applicability were not established here; the installed summary alone is not a complete current-rights determination. Recheck applicable software terms as well as independent upstream rights before expanding use.

## Research references and fit

This task audits an existing feature; it introduces no implementation or adapted third-party code. The relevant official GitHub comparison is pinned to [`71b853f0db18c0d783c2b9eeafaedbcbf4d05fba`](https://github.com/thinh-vu/vnstock/commit/71b853f0db18c0d783c2b9eeafaedbcbf4d05fba), dated 13/10/2026. Its [pyproject](https://github.com/thinh-vu/vnstock/blob/71b853f0db18c0d783c2b9eeafaedbcbf4d05fba/pyproject.toml) declares **4.0.9**, so it is comparison evidence, not provenance proof for installed 4.0.8. Source was read, not installed or executed.

- The pinned [KBS quote source](https://github.com/thinh-vu/vnstock/blob/71b853f0db18c0d783c2b9eeafaedbcbf4d05fba/vnstock/explorer/kbs/quote.py) and [HTTP client](https://github.com/thinh-vu/vnstock/blob/71b853f0db18c0d783c2b9eeafaedbcbf4d05fba/vnstock/core/utils/client.py) show the same relevant JSON-before-DataFrame, stock/index routing, scale exclusion, default float decode, timeout and conditional Retry-After architecture as inspected on disk. Local artifact hashes above anchor the actual execution; no full package equivalence is claimed.
- The pinned [quote tests](https://github.com/thinh-vu/vnstock/blob/71b853f0db18c0d783c2b9eeafaedbcbf4d05fba/tests/unit/api/test_quote.py) cover API construction/default source and a mocked VCI history path with a skip on insufficient mock setup. They do not prove KBS units, adjustment, calendar, rights or this live sample's quality. This project's [adapter tests](../services/collector/tests/test_vnstock_adapter.py) use synthetic rows/facades and check the stricter bounded normalization and safe-output behavior.
- The [official community changelog](https://vnstocks.com/docs/vnstock/lich-su-phien-ban) records KBS price normalization changes on 01/02 and 07/03/2026. The [current market-data page](https://vnstocks.com/docs/vnstock/thi-truong-market) explicitly describes **v5.0.1** and a different `Market()` API. Its timezone, adjusted-price and volume descriptions are not evidence for installed 4.0.8 `Quote(...).history(to_df=False)`.

The existing optional adapter fits the two-symbol technical audit and keeps the fixture application isolated. It depends on pinned vnstock/vnai plus their transitive stack and a deprecated common-data facade, which creates maintenance risk on upgrade. One-attempt execution, sanitized output and process bounds limit accidental retries and response disclosure; they do not grant rights or guarantee wire fidelity. Keeping this version unchanged preserves comparability. A v5 migration or alternative provider is a separate authorized task with renewed license, semantics and dependency review; no second implementation comparison was needed for this documentation-only audit.

## Checks and next serial task

Existing offline checks were run after the probes; they make no provider calls:

- `python scripts/validate_market_data.py`: passed; synthetic fixture remains valid.
- `python -m unittest discover -s tests -v`: passed, 44 tests.
- `python -m unittest discover -s services/collector/tests -v`: passed, 29 tests.
- `python scripts/check_docs.py`: passed, 501 local Markdown/HTML targets; external links and fragments are not validated by this check.
- `python scripts/build_docs.py`: passed, portal plus 24 source documents.
- `git diff --check` and the new audit's whitespace check: passed. Original brief SHA-256 was rechecked unchanged.

No Node runtime, database, browser or real-source replay checks were run for this documentation-only task. No claim of new CI, independent coordinator approval, commit or push is made. The portal builder has an existing 24-document allowlist; this new audit is available in the repository but is not added to that published bundle within this three-document write scope.

**Next task:** an offline correctness/persistence audit of the existing partial-batch and revision/replay boundaries, using current synthetic test material and actual code/tests. Specify expected per-bar versus batch behavior, inspect exact decimal/time/hash ordering, A→B→A/refetch identity, mixed deliveries, failed/incomplete rows and restart/replay recovery. Record verified behavior and reproduce any suspected defect before proposing a bounded fix. This does not authorize fresh source calls, real-data persistence, rights expansion, scheduler or UI work. Source evidence for currently closed purposes remains a separate prerequisite before real-data storage, daily operation and product display can open. There is insufficient evidence to re-estimate the full remaining product schedule.

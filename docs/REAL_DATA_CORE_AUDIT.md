# Bounded real-data core audit — FPT / VNINDEX

## Local EOD foundation implementation · 03/11/2026

**Baseline:** `090b5b6` after PR #44 merge; branch `feat/fr-18-local-eod-foundation`. The authorized default-off foundation now has a separate [manual EOD CLI](../services/collector/collector/eod_cli.py), [runner](../services/collector/collector/eod_runner.py) and [offline tests](../services/collector/tests/test_eod_runner.py). Live activation remains pending; no provider execution, real-data submission, dependency/CI/default/flag change, cron, daemon, automatic date selection or backfill occurred. The original brief is unchanged. The prior probe/audit and rights evidence below retain their dated scope.

The runner reuses the existing bounded adapter and authenticated transport. Explicit opt-in and one canonical target date are mandatory. Submission configuration and all bounds are validated before the overlap lease/provider. FPT → VNINDEX is serial, at most two calls, one attempt and 45-second process wait per symbol plus existing cleanup; any provider error stops the remaining collection. There is no fallback/provider retry. A fixed bind-only, noninheritable IPv4 lease at `127.0.0.1:47831` prevents overlap among cooperating runs within one host network namespace, using Windows exclusive-address binding and no reuse/listen/connect. Port conflict/setup failure stops before collection; there is no production override. It is not cross-host/container locking, and unrelated port occupancy also fails closed.

Per-symbol collection and delivery states remain separate. Empty/skipped/failed collection cannot yield a whole persisted run; only two nonempty collections with terminal receipt success do. HTTP acknowledgement or pending receipt does not prove persistence. Missing/malformed acknowledgement is unknown, not proof that persistence failed. The deep-copied normalized envelope and its explicit ID/digest are retained in memory for delivery recovery; the existing transport re-derives deterministic bytes. Default retries are zero; explicit `--delivery-retries 1` permits one identical extra POST only for the transport's exact fixed `Ingestion request failed` category. HTTP errors including 401/403/429, invalid receipt/counts/response errors and unrecognized messages stop after one attempt. The recognized category combines network loss and Unicode/JSON decoding failures; it cannot prove a transient cause. Valid pending/terminal receipts never cause another POST. No provider refetch occurs during recovery. There is no durable envelope spool or resume after process death; rerunning the CLI refetches and server outbox replay remains independent. The [adapter operating notes](VNSTOCK_ADAPTER.md#local-eod-foundation--03112026) detail bounds, states and exit semantics.

### Proportionate source comparison before implementation

The coordinator read the actual tagged upstream implementations/tests and license texts before the worker implemented this foundation. References are tags; exact tag commit hashes were not resolved. No external code was installed, executed, copied or vendored.

| Source inspected | Fit, architecture and tradeoffs |
|---|---|
| CPython v3.13.0: [socket helper](https://github.com/python/cpython/blob/v3.13.0/Lib/test/support/socket_helper.py), [socket tests](https://github.com/python/cpython/blob/v3.13.0/Lib/test/test_socket.py), [PSF license](https://github.com/python/cpython/blob/v3.13.0/LICENSE) | Official maintained stdlib source illustrates exclusive Windows binding versus address reuse and real bind-conflict tests. A bind-only OS resource fits this short local process lifetime without a new dependency or filesystem lock-path permissions/symlink handling. Fixed port occupancy can deny availability, and the namespace boundary limits coverage. This project's small implementation adopts the concepts independently; it does not copy those helpers/tests. |
| filelock 3.16.1: [Windows implementation](https://github.com/tox-dev/filelock/blob/3.16.1/src/filelock/_windows.py), [Unix implementation](https://github.com/tox-dev/filelock/blob/3.16.1/src/filelock/_unix.py), [tests](https://github.com/tox-dev/filelock/blob/3.16.1/tests/test_filelock.py), [Unlicense](https://github.com/tox-dev/filelock/blob/3.16.1/LICENSE) | Maintained dedicated file-lock abstraction uses platform-specific primitives and lock-file lifecycle. It offers a reusable context/timeout API, but would add a dependency and a shared-path/security/lifecycle decision for a two-call local runner; it would not itself provide cross-host guarantees. Its license was inspected, but no code was adapted and the dependency was not added. |

**Selected approach:** independently authored stdlib socket lease and a small serial orchestration layer. Existing provider, normalization, transport, contracts, storage and fixture paths remain intact. This keeps the write/dependency scope bounded; a future distributed scheduler would need a different reviewed coordination design. Neither upstream software license grants market-data rights.

### Worker verification

- Fixture validator passed; existing Python contract suite passed **44 tests**.
- Collector suite passed **49 tests**: 29 existing and 20 new synthetic tests. Coverage includes opt-in/canonical-date/submit validation with zero lock/provider calls, order/budget/timeout, stop and redaction, no-data/partial/pending/failure/success, retained-copy identity, bounded retry of the recognized request-failure category, no retries for HTTP 401/403/429 or invalid receipts/responses/counts, and no provider refetch.
- Real local mock HTTP test discards the first acknowledgement, then verifies byte-identical replay, identical delivery ID/digest/`collectedAt` and one FPT collection. Real Windows lock tests verify contention, exception cleanup and killed-process reacquisition; a mock additionally asserts exclusive/noninheritable/bind-only setup. Other platforms and distributed namespaces were not exercised.
- The first restricted collector run passed 47 of the then-48 tests; the local HTTP test saw zero requests. The approved loopback rerun passed all 48; after review narrowed retry handling, a further approved loopback run passed all 49. No upstream network/provider was contacted by these tests.
- Documentation checks passed for **517 local targets** (external URLs/fragments are not validated); the portal built **24 source documents**. Diff whitespace passed and the original brief's SHA-256 remains `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`. No Node/DB/browser suites were rerun because those paths were unchanged; the HTTP test verifies delivery transport behavior, not MongoDB persistence. No claim of remote CI, independent review, commit or push is made by these worker checks.

**Independent review · 03/11/2026:** GPT-6 Astra approved the final foundation with no findings after reviewing code and verification evidence, including the narrowed retry correction. The reviewer did not rerun runtime tests. Publication and remote CI remain unverified.

**Next serial decision:** the separately scoped live-activation decisions already listed below. The implementation itself does not authorize live execution, settle source rights/cadence/calendar/retention, migrate pages or complete FR-18. Full product timing remains unestimated.

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

**Next task recorded by the probe audit:** an offline correctness/persistence audit of the existing partial-batch and revision/replay boundaries, using current synthetic test material and actual code/tests. The follow-up below records its bounded execution. Source evidence for currently closed purposes remains a separate prerequisite before real-data storage, daily operation and product display can open. There is insufficient evidence to re-estimate the full remaining product schedule.

## Offline correctness and recovery verification · 02/11/2026

**Baseline:** merged PR #42, `952c5d6`; branch `feat/fr-18-observed-recovery-verification`. This follow-up inspected the existing contract, observed store, ingestion worker/outbox, stored-history/status readers and their synthetic tests. No defect was reproduced in the audited boundaries, so production code, contracts, dependencies and flags were unchanged. Two integration regressions were added to [the existing observed ingestion test file](../apps/api/tests/observed-ingestion.integration.test.ts). This is bounded local verification, not source-data acceptance, exhaustive correctness proof or permission to collect/store/display real observations.

| Boundary | Verified behavior and evidence |
|---|---|
| Exact values and identity | The existing observed unit tests recheck the shared negative contract corpus, canonical decimal strings, hashes and UTC microsecond ordering. Existing integration tests recheck concurrent/out-of-order writes, offset-equivalent instants, equal-time digest ordering, refetch and A→B→A with immutable revision reuse. These are synthetic cases, not independent reconciliation of provider values or wire precision. |
| Partial batches and reads | Revision insertion precedes per-bar projection, without a batch transaction. Earlier rows remain readable during interruption or exhausted failure; history may mix deliveries. The existing partial-batch and stored-read tests passed. Receipt counts describe processed records, not newly inserted revisions; success does not establish source freshness or complete session coverage. |
| Interrupted older delivery after newer success — new regression | A three-bar synthetic delivery is interrupted by a test hook after its second revision, leaving two revisions, one projection and a running receipt with counts 1 asset/1 observation. A newer two-bar delivery is persisted and marked successful through the store, overlapping the first date and adding a different date. A real BullMQ worker then reconciles/replays the older receipt: both missing older projections appear, both complete newer rows retain their metadata and delivery reference, and the older receipt succeeds on attempt 2 with counts 1/3. Final history mixes both deliveries, with five revisions and four latest bars; completeness stays unknown. This new interruption is a thrown test hook plus worker recovery, not a newly added killed-process test. |
| Equivalent distinct delivery IDs — new regression | A real worker fails the first delivery after its projection on all three attempts. A distinct ID with identical payload/time/content then succeeds on attempt 1, retaining one revision and the entire first selected projection/reference. History stays identical; collection status counts one failed selected receipt and zero successful selected receipts, despite the second receipt's success. This matches the existing [equivalent-retrieval semantics](INGESTION.md): status describes selected references, not the best status among all equivalent deliveries. Neither IDs nor prices leak into the status response. |
| Actual process death — existing regressions rerun | The three existing child-process tests kill a worker after revision insertion, after projection write and after durable success before queue completion. All passed unchanged, including repair/replay, immutable counts and the success boundary's single attempt. This evidence is distinct from the two new scenarios above. |

Worker checks passed:

```powershell
npm run lint
npm run typecheck
node --import tsx --test apps/api/tests/observed-ingestion.test.ts apps/api/tests/observed-history.test.ts apps/api/tests/observed-collection-status.test.ts
$env:MONGODB_URL = 'mongodb://127.0.0.1:54109/marketpulse'
$env:REDIS_URL = 'redis://127.0.0.1:54110'
node --import tsx --test --test-concurrency=1 apps/api/tests/observed-collection-status.integration.test.ts apps/api/tests/observed-history.integration.test.ts apps/api/tests/observed-ingestion.integration.test.ts
python scripts/check_docs.py
python scripts/build_docs.py
git diff --check
Get-FileHash MarketPulse_VN_Project_Documentation.md -Algorithm SHA256
```

Focused unit results: **12 passed**, all existing. Focused integration results: **12 passed** (10 existing, two new), zero failures/skips, using real MongoDB 8.0 and Redis 7.4 from installed Docker images. The local ports above were dynamically allocated for this run. The installed Docker Desktop was started hidden; only uniquely named disposable test containers and test-created databases/queues were used, with no shared application volumes. An initial restricted unit run passed 10 and failed two HTTP tests with `fetch failed`; the approved loopback rerun passed all 12. No provider calls, new real-data persistence, installations or upgrades occurred. Full application suites, browser QA, remote CI and production operation were not rerun. Independent coordinator review and branch publication remain separate from worker evidence.

Documentation checks passed for **504 local targets** (external links and fragments were not validated); the existing portal built **24 source documents**. Diff whitespace passed. The original brief's SHA-256 still matches `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`. The audit remains outside the existing portal allowlist.

**Independent review · 02/11/2026:** GPT-6 Astra approved the bounded changes with no findings after inspecting the implementation, verification evidence and diff; the reviewer did not rerun runtime tests. Branch publication and remote CI remain unverified here. After review, the worker verified the exact test-container names, ownership labels, ports and exclusive anonymous-volume attachments, then removed only those two containers and their three image-created anonymous volumes. No shared application volumes were removed.

**Next serial gate:** obtain purpose-specific upstream evidence for storage, daily collection, display and retention, together with adjustment/units/calendar/freshness evidence required for the intended product use. Unknown purposes stay closed. This verification does not open a scheduler, real-data writes or UI migration; any newly suspected correctness issue must first be reproduced and scoped. The full remaining schedule is still unestimated.

## Source enablement decision and EOD handoff · 02/11/2026

**Decision: `LOCAL_IMPLEMENTATION_AUTHORIZED_LIVE_ACTIVATION_PENDING`.** This supersedes the overall `BLOCKED_PENDING_SOURCE_EVIDENCE` label: the owner authorizes default-off local EOD code and offline tests as the next task after PR #44 merges. Writing that foundation does not depend on obtaining blanket written source permission. Personal Vnstock software use is distinct from upstream data rights and third-party distribution; this decision claims neither an upstream grant nor a prohibition. Live activation and public display/deployment remain separate decisions with the unknown rights recorded above. No provider call or live storage is authorized by this documentation correction.

The offline verification above merged in [PR #43](https://github.com/Son2110/Market-Pulse/pull/43), baseline `5c946d30102f5aa3eeed25e79d5340f1e855c59f`; the coordinator verified passing Application CI and Documentation CI on reviewed branch head `a2296d5` ([PR checks](https://github.com/Son2110/Market-Pulse/pull/43/checks)), not a fresh run on the merge commit. This supersedes its publication/CI-pending wording, without adding runtime evidence. This follow-up changes documentation only: no provider execution, submission, scheduler, installation, flag or public-read change. Earlier closed-purpose wording concerns live use, not writing or testing disabled code.

The coordinator's bounded first-party search found no affirmative KBS grant for the intended automated collection, storage or application display. The [KBS general customer terms PDF](https://kbsec.com.vn/pic/general/files/B%E1%BB%99%20%C4%90i%E1%BB%81u%20Kho%E1%BA%A3n%20v%C3%A0%20%C4%90i%E1%BB%81u%20Ki%E1%BB%87n.pdf) was located but could not be opened; its contents/applicability are unverified. A web-tool error for the KBS site is not a provider access denial. Personal-data/privacy search results do not establish a market-feed grant. This is an evidence gap, not a finding that KBS prohibits the use.

The [Vnstock policy page](https://vnstocks.com/policies/license) still presents **license-2026.11**, published 24/10 and effective 30/11/2026, explicitly not yet effective on 02/11. Section II separates upstream data rights; section IV requires explicit acceptance. Those future provisions do not determine present 2026.09 rights or prove account acceptance. Retain the installed-summary evidence above and establish the exact governing agreement/version and applicability separately.

**Live-activation decisions for the owner/source:** establish applicable published terms or, where needed, specific confirmation identifying the source, permitted purpose, conditions and effective date for:

- Personal/local automated access to **FPT and VNINDEX, 1D, once daily**: allowed method/account/tier, quota and cadence, including permitted recovery/refetch.
- Local persistence of normalized history/revisions: allowed fields, retention duration, deletion and backup obligations; and display in the owner's personal application.
- Separately, public stored reads/redisplay and deployment: audience, distribution and any agreement requirements. Unresolved public rights need not block an explicitly permitted local-only scope.
- The applicable Vnstock agreement/version, acceptance and device/tier conditions for that use. A software grant does not answer the KBS questions.

Record each purpose as allow/deny/unknown with its evidence, scope, conditions and review date; unknown keeps that live purpose pending, not offline implementation. These questions do not require blanket written permission for personal software use or another broad audit before coding. Cadence, quota, calendar and retention remain unresolved activation decisions; use synthetic inputs to implement and verify the disabled foundation now, after PR #44 merges. Public rights remain separate from local activation.

### EOD operating contract — authorized offline foundation, live activation pending

| Boundary | Required behavior for the next implementation |
|---|---|
| Scope and entry point | Reuse the existing [CLI](../services/collector/collector/vnstock_cli.py), adapter and authenticated ingestion path. The foundation is explicitly off by default, accepts one explicit target date, and runs FPT then VNINDEX serially: at most two provider calls, `1d`, explicit KBS, one attempt per symbol, 45-second process wait plus existing cleanup bound, no fallback. Stop the sequence on deny/challenge/quota/rate limit; no bypass or automatic provider retry. Keep per-symbol outcomes and partial/pending/persisted results distinct; partial success must not become whole-run success. |
| Schedule and limits | No cron or daemon in the first slice; guard against overlapping runs and automatic backfill/catch-up. Live activation must resolve access, storage/retention and intended display purposes, cadence/quota/calendar and configuration including `sourceEvidenceRef`, `allowedPurposes`, `scheduleTimezone=Asia/Ho_Chi_Minh`, `runWindow`, `sessionCalendarRef`, `publicationDelay`, `requestDatePolicy`, `rateBudget`, `refetchPolicy` and `retentionPolicy`. Except timezone, these remain unresolved activation decisions, not prerequisites for offline code/tests. Do not invent a schedule, exchange calendar, delay or quota; retain the existing maximum 31-day difference/32-row safety bounds. |
| Values and labels | Preserve exact normalized decimal strings, full VND for FPT and index points/currency null for VNINDEX, provider/version, naive time label, trading date, UTC collection time, null source as-of/volume, unknown FPT adjustment and unverified calendar/freshness. EOD is the intended cadence, not verified bar finality. Reconcile units/calendar/finality against an authorized reference before claiming them; no inferred return, interpolation or fixture fallback. |
| Delivery versus refetch | HTTP 202, accepted/queued/running, CLI exit zero and a valid response do not establish persisted success. Poll the matching delivery to terminal `success`; timeout remains pending/unknown, failure remains failure. If transport acknowledgement is lost, inspect the receipt or resubmit the **same retained envelope** with the same digest/ID under a bounded local transport policy. Running the CLI again calls KBS and creates a new collection time/delivery; it is a provider refetch requiring separate permission/rate budget. Existing outbox/worker replay uses the accepted payload and never calls KBS. Any retained envelope is subject to the storage/retention gate. |
| Observability and recovery | Metadata-only logs record symbol/date bounds, attempt times, safe error category, counts and delivery state; no credentials, raw responses or prices. Distinguish last provider collection from last successful persistence, and both from source freshness. Empty/no-data is not a complete session; partial/failed-batch rows and mixed deliveries remain possible. Existing selected-receipt status is not a run-level success or freshness metric. Recovery must preserve newer projections and revision identity as verified above. |
| Acceptance | Use existing applicable contract/collector and focused ingestion/history/status checks for the actual implementation; verify non-overlap, stop behavior, partial/no-data outcomes and recovery without adding live provider calls to CI. After purpose gates open, require a bounded authorized real-data run for both symbols, terminal receipts, stored/read reconciliation and honest freshness/coverage labels. Neither this design, CI nor receipt success alone accepts the product; public deployment and page migration retain their separate gates. |

**Next FR-18 slice after PR #44 merge:** inspect the existing execution, ingestion and receipt paths, implement the default-off foundation above with one worker, then run applicable offline checks and independent review. Test explicit opt-in, one target date, FPT → VNINDEX ordering/max two calls, stop conditions, overlap prevention, per-symbol partial/pending/persisted results and bounded replay of the **same retained envelope**, never a provider refetch. Use synthetic inputs; no provider execution, cron/daemon, live activation or public deployment in this slice.

This handoff leaves the full remaining schedule unestimated. Documentation checks are recorded by the implementing worker/coordinator separately; the earlier test counts remain dated evidence.

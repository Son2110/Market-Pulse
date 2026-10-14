# GATE-5 — reproducible local fixture core demo

**Decision · 14/10/2026: GATE-5 PASS — reproducible local fixture core demo / P0 closure.** The evidence below supports the bounded local core: search → daily closing-price chart, VN-Index, registration/login and one private watchlist, repeatable Compose startup and restart persistence. This does not complete any original FR, MP-11/MP-12, the original MVP, the expanded product, upstream data rights or production acceptance.

This record contains fresh GPT-6.1 Sol worker QA and exact merged-baseline CI evidence. Independent GPT-6 Astra review approved these documentation changes on **14/10/2026**, with no findings. This branch has not been pushed, and its own remote CI remains pending; baseline CI and this documentation branch's CI are separate evidence.

The reviewer independently checked the startup commands against Compose/environment defaults, the authentication implementation, baseline CI logs/counts and roadmap arithmetic; local-link validation (144 targets), diff checks and the original-document SHA-256 also passed. The reviewer inspected the worker's browser/restart evidence and did not repeat those runtime journeys or the full application suite.

## Baseline and remote CI

The task started from clean `main` at [`dd1ae64e509e67cead2a1c93a607372e1346e62c`](https://github.com/Son2110/Market-Pulse/commit/dd1ae64e509e67cead2a1c93a607372e1346e62c), after user-managed [PR #30](https://github.com/Son2110/Market-Pulse/pull/30). The worker inspected run metadata, job steps and actual logs for both workflows on that exact SHA; the table reports execution results, not inferred workflow coverage.

| Evidence on baseline | Actual result |
|---|---|
| [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/38507379609) | Success; lint, typecheck and build; 172 Node unit tests, 27 real MongoDB/Redis integration tests, six Linux harness regressions and two Chromium journeys passed. Node totals reported zero failures/skips. |
| Python in Application CI | Fixture validator, 27 contract tests and 29 collector tests passed. No provider credential or live request was required. |
| Compose and replay in Application CI | Build/start/health/HTTP smoke passed. Collector submit/replay finished with one raw delivery, 11 canonical assets and 44 canonical observations, status success. Integration includes replay, ownership, retry/crash and observed-isolation cases. |
| [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/38507379712) | Success; local links, fixture validation, 27 contract tests, documentation build and artifact upload passed. |

No required application check was skipped. Conditional failure-screenshot upload and failure logs were skipped because the job succeeded. These runs accept MP-14 on merged main, including full Linux browser/stack execution that was pending in the earlier local handoff. The full application/browser suites and ingestion replay were not rerun in this documentation-only task; their evidence is the exact baseline CI above. Earlier local/independent review evidence remains in [LOCAL_DEVELOPMENT](LOCAL_DEVELOPMENT.md#committed-core-flow-browser-tests-mp-14).

## Fresh isolated startup and restart

Docker Desktop was started and a new project, `mp15-gate5-20261014-dd1ae64`, was built from the baseline application code. Before startup, both container and volume queries for that exact Compose project label returned empty. Compose created fresh `mongo-data` and `redis-data` volumes owned by that project. The existing `marketpulse` project, its settings, containers and volumes were not used or changed.

The worker used `compose.yaml` and the committed non-secret `.env.example` explicitly. In each QA subprocess, inherited `INGESTION_SECRET` was removed and `OBSERVED_READS_ENABLED=false` set; host-port overrides were web **35173**, API **33001**, MongoDB **37017** and Redis **36379**. Those ports were checked unused before startup and stayed bound to `127.0.0.1`. These are isolation/configuration choices, not application changes. No existing `.env` was read or overwritten. The reproducible default-port command is in the [README](../README.md#run-the-local-demo); QA used the equivalent named isolated project and port overrides.

`docker compose --env-file .env.example -p mp15-gate5-20261014-dd1ae64 config --quiet` and `up --build --detach --wait` succeeded. All five services (`mongodb`, `redis`, `api`, `worker`, `web`) became healthy. `/health/live` and `/health/ready` returned 200; readiness reported `ready`.

After creating a local account and FPT list through the browser, the worker logged out, ran `stop` for this exact project and then `up --detach --wait` with the same settings. No volume was removed. All five services became healthy again and readiness returned 200. Logging in with the same account restored the same named list with FPT and the fixture close. This verifies account/list persistence across stop/start, separate from tab-session storage.

## Fresh real browser flow

CUA controlled a new Edge tab against `http://127.0.0.1:35173`, using the real web proxy/API. No successful response was mocked and no direct account/list seed was used.

| Flow | Fresh result |
|---|---|
| Search/detail | FPT search returned the company; opening detail showed the three-point SVG closing-price chart and daily OHLCV table. Latest close: 102,500 VND; +1,500 VND (+1.49%) against the previous available observation. |
| VN-Index | Overview showed 1,308 index points, −2 points (−0.15%), with three observations. Currency is not applicable; volume is unavailable. |
| First account | UI registration with password confirmation succeeded and signed in; this was a disposable account in the isolated project. No shared credentials are documented. |
| Private list | Create named list → search/add FPT → reload retained list/membership and fixture price. |
| Logout/login/restart | Logout completed; after the complete stack restart, UI login restored the same account/list/FPT. Final logout and opening watchlists showed the guest registration/login entry point with no private list. |
| Layout and keyboard | Search, detail, overview, account and populated watchlist checked at desktop 1440 px and narrow 320 px; measured document scroll width did not exceed its client width. FPT/watchlist narrow screenshots and desktop search screenshot were inspected. Search input Tab moved to the visible search button with focus styling. |

FPT and VNINDEX history were also read through the isolated API after restart: HTTP 200 and `Cache-Control: no-store`. Both retain provider `marketpulse-fixture`, the synthetic dataset label, `fixture / unknown`, unverified session calendar and `Asia/Ho_Chi_Minh`. The views show as-of **23/09/2026 15:00 UTC+7**; FPT uses VND and VNINDEX uses `index_point`/null currency. Reference-review date and account/list modification times are distinct from market as-of. Changes compare available observations, not a verified previous trading session.

The tab's browser warning/error log was empty when inspected after the successful persisted-list journey. This is bounded manual QA, not a new continuous page-error harness. The exact-baseline committed E2E separately asserts no uncaught page errors and no page overflow at desktop/320 px. Loading/empty/error/retry, wider keyboard/accessibility and expiry/race cases retain their prior [GATE-3](GATE_3_REVIEW.md) and page-handoff/unit/integration evidence; they were not comprehensively repeated here. Preliminary CUA selector mismatches were corrected using observed controls; no app fix was needed.

## Account clarification and data boundaries

The historical MP-15 row mentions a seed account. As clarified on **14/10/2026**, the app has no seed account or seed command. First UI registration followed by reusable login satisfies this bounded demo; no auth helper, shared password or account seed was added. Accounts/watchlists are stored in MongoDB; token handles use tab sessionStorage, expire after eight hours and are revoked by logout. Closing a tab does not delete the account/list.

Default public search/history/watchlist prices remain packaged fixtures: ten equities plus VN-Index, three synthetic dates each. A fresh project has no stored observed candles. `OBSERVED_READS_ENABLED=false` by default; opting in requires previously authorized stored data and does not call a provider or fall back to fixture after an observed error. MP-11 includes bounded adapter/storage/revision/replay/observed reads and FPT/VNINDEX UI; MP-12 includes stored collection-status APIs and an FPT card. Both remain partial. Receipt success is not proof of freshness, completeness or provider health.

Actual source as-of, source freshness/completeness, coverage, equity adjustment and upstream access/storage/public redisplay/deployment rights remain open. Cache/scheduler, production security/operations/deployment, gold/FX/news/AI/events and forecast research are not accepted by this gate. Original FR-01/02/03/04/06/18 remain partial; event association is not causation and the product is not investment advice.

The next separate serial task after this documentation review/merge is **P1.1: audit one Vietnamese gold publisher covering SJC and plain 9999 rings**, under the [expanded roadmap](ROADMAP.md) and [PRD](PRD.md). No provider call, gold implementation or production deployment was started by MP-15.

## Local artifacts, checks and cleanup

Ignored local evidence lives at `E:\Project\Market-Pulse\.npm-cache\gate-5-20261014`: `application-ci.log`, `documentation-ci.log`, `application-jobs.json`, `compose-before.json`, `compose-restarted.json` and `http-report.json`. Browser observations/screenshots were inspected in the tool session; no screenshot was committed or added to the portal. These workstation artifacts are not permanent CI artifacts or a new test framework.

The owned project is stopped after QA and its two labeled volumes retained for review; no volume or account was deleted. This preserves only the isolated disposable QA account/list and does not affect the pre-existing project. Any later cleanup must verify the exact project/volume labels before removing only these owned resources.

Local checks passed: `python scripts/check_docs.py` (144 local file targets; external URLs and anchors are not validated), `python scripts/validate_market_data.py`, `python -m unittest discover -s tests -v` (27 tests, all passed), `python scripts/build_docs.py` (21 source documents) and `git diff --check`. The original requirements document remains unchanged with SHA-256 `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`.

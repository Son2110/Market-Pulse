# GATE-3 — local fixture core flows

**Decision: PASS for the scoped local fixture flows, reviewed 06/10/2026.** This early D14 review covers stock search → detail/chart, VN-Index and an authenticated watchlist. It does not complete the original MVP or any original FR, verify a live provider, or start MP-11. The live-source gate remains **NOT VERIFIED**.

## Baseline and existing CI evidence

The clean review branch started from merged `main` commit [`b996e3e3e70ffbacf13fb8d319a182303d05dfc9`](https://github.com/Son2110/Market-Pulse/commit/b996e3e3e70ffbacf13fb8d319a182303d05dfc9), after user-managed [PR #19](https://github.com/Son2110/Market-Pulse/pull/19). The [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/37275919994) and [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/37275920075) runs succeeded on that exact commit. The application log confirms 131 Node unit tests, 17 real MongoDB/Redis integration tests, 24 Python contract tests and six collector tests. Lint, typecheck, build, fixture validation, Compose health/HTTP smoke, collector submit/replay and durable-count assertions passed. No required checks were skipped; the conditional failure-log step was skipped because the job succeeded.

Those CI results are baseline evidence, not a claim that the worker reran the full suite locally during this documentation task. Ingestion replay/crash/startup scenarios are supported by that CI and the historical [MP-10 handoff](INGESTION.md). Collector replay was not repeated in this gate session.

## Fresh local checks on 06/10/2026

Docker Desktop was started, and the existing Compose stack was rebuilt from the baseline with `docker compose up --build --detach --wait`. API, web, worker, MongoDB and Redis all became healthy. Existing `.env` values and volumes were preserved. Published loopback ports were API 3001, web 5173, MongoDB 27018 and Redis 6379. Both API health endpoints returned 200. `/`, `/stocks/FPT`, `/market`, `/account`, `/watchlists` and `/watchlists/` served the web entry with 200.

Temporary bundled Playwright with installed Edge drove the browser against the real web proxy/API. Browser timezone was `Asia/Ho_Chi_Minh`. No dependency, application, configuration or fixture changes were needed; no new Stitch design was needed for QA of the existing pages.

| Real API flow | Fresh result |
|---|---|
| Account A | Register through `/account`, reload and restore through successful `/me`, logout, then log in again. |
| Search → detail/chart | Search `FPT` and `Công ty Cổ phần FPT`, select the company, open the detail page, inspect the three-observation closing-price chart, reload, and return to search with the submitted company-name query restored. Latest fixture close was 102,500 VND. |
| Search empty state | Unknown query `ZZZGATE3NORESULT` displayed no results. |
| VN-Index | `/market` displayed 1,308 points, −2 points (−0.15%) against the previous available observation; reload preserved the result. |
| Watchlist A | Create an empty named list, search/add FPT, read price/change/as-of, follow its detail link, use browser Back, reload, rename, add/remove VCB, remove FPT, delete with confirmation, recreate an empty list and logout. |
| Account B isolation | A separate browser context registered B. B saw the first-list empty state and then its own empty list, with no A list or FPT membership. Negative foreign-ID API ownership checks are covered by the existing integration suite; they were not repeated by this browser check. |
| Guest state | Before login and after logout, watchlists displayed the login/register entry point. |

Public FPT and VNINDEX history responses were freshly checked through port 5173: 200, `Cache-Control: no-store`, three candles, provider `marketpulse-fixture`, mode `fixture`, label `SYNTHETIC FIXTURE — NOT MARKET DATA`, freshness `fixture / unknown`, calendar `unverified`, timezone `Asia/Ho_Chi_Minh`, and latest as-of `2026-09-23T15:00:00+07:00`. FPT uses VND; VNINDEX uses `index_point`, with null currency. The views display UTC+7 and the fixture limitations. Watchlist modification time is identified as account-data time, separate from market as-of. Change means comparison with the previous available observation, not a verified prior trading session.

Search, stock detail, market overview, account and populated watchlist were captured at **1440, 390 and 320 px**: 15 page/width combinations. In every view, document width equaled viewport width; no horizontal page overflow or uncaught browser `pageerror` was observed. The detail table has its intentional internal scrolling region. The coordinator directly inspected selected market 320 px, detail 390 px and watchlist 390 px screenshots and found the content readable, labels clear and narrow layouts usable.

The two final-run QA accounts were removed only after matching their exact email and user ID; owned sessions/watchlists were removed by that user ID. A read-back check found zero remaining users, sessions or watchlists for those identities. Accounts from preliminary harness runs were also removed by exact identity. No other account, collection or volume was deleted, and no password, token or `.env` content was logged.

## Temporary mocked states

These checks intercepted only selected browser responses; they are not evidence of an actual provider outage or database failure. Each interception was removed, and the page recovered through the real API.

| Page | Mocked state and recovery |
|---|---|
| Search | Delayed loading and HTTP 503; retry restored real FPT results. The no-results check above used the real API. |
| Detail | Delayed history, valid empty history and HTTP 503; loading completed, empty-state reload and error retry restored the real chart. |
| Market | Delayed history, valid empty history and HTTP 503; recovery/retry restored the real index. |
| Watchlist | Delayed list and list HTTP 503, plus FPT row loading/empty history/503 while VCB remained available. List retry and FPT row retry restored real data; the healthy row stayed usable. |
| Account | Delayed `/me` and `/me` HTTP 503; the verification retry restored the real identity. |

No app defect requiring a code change was found in this bounded gate. Preliminary harness runs needed selector and pending-route cancellation corrections; the completed run passed with no uncaught page errors. Auth expiry, ambiguous writes, races, late callbacks and simulated persisted `pageshow` remain prior handoff/unit/integration evidence, not fresh browser checks in this gate. Actual BFCache remains unverified; ordinary browser Back was exercised here.

## Artifacts and limits

Local, ignored artifacts are under `E:\Project\Market-Pulse\.npm-cache\gate-3-20261006`: `qa.cjs`, `report.json` (PASS, real/mock checks and viewport measurements), `http-report.json` (health/metadata/cleanup read-back), and PNG screenshots. They are review evidence on this workstation and are not committed, shipped in the documentation portal, or a persistent E2E suite. The existing-page design references remain in the [search](FR03_SEARCH_DESIGN.md), [detail](FR04_DETAIL_DESIGN.md), [overview](FR02_OVERVIEW_DESIGN.md), [account](FR01_AUTH_DESIGN.md) and [watchlist](FR06_WATCHLIST_DESIGN.md) handoffs.

Public search/history still read the packaged fixture rather than the MongoDB canonical ingestion collections. Only three synthetic dates are available; market freshness is unknown and session dates are unverified. Live-source access, terms/rights, upstream coverage and runtime integration remain **NOT VERIFIED**. Original FR-01/02/03/04/06/18 remain partial. Time-series projection, live/public-read migration, cache, scheduling, rich dashboard, news/events, alerts, production operation and deployment are outside this gate. The committed core E2E requested by MP-14 is still outstanding. **MP-11 has not started**; it is the next separate serial task after this gate documentation is reviewed and merged, with the provider-verification constraints in [PRD.md](PRD.md) and [ROADMAP.md](ROADMAP.md).

The documentation task passed `python scripts/check_docs.py` (82 local file targets; external links and anchors are not validated), `python scripts/build_docs.py` (18 source documents) and `git diff --check`. The original requirements document retained SHA-256 `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`. MarketPulse remains an information/research demo and provides no investment advice or causal claim about market movements.

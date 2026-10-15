# Local development

**P1.2 gold contract · 16/10/2026:** [synthetic gold fixture](../fixtures/gold/README.md)
and [schema](../packages/schemas/gold-quotes-v1.schema.json) are standalone offline
artifacts. With `requirements-dev.txt` installed, run
`python scripts/validate_gold_quotes.py`; Python contract discovery and
`npm run test:unit` include gold arithmetic/identity checks. Both CI workflows
explicitly validate gold offline. Local implementation awaits independent review
and remote CI. The fixture is not consumed by the collector, storage, API or UI;
P1.3A/P1.4 remain separate tasks and the live-source gate remains closed.

**Current local demo · 14/10/2026:** Docker Compose runs the fixture web/API plus worker, MongoDB and Redis. No provider credential, ingestion secret, host Node/Python installation or pre-existing account is required for the core tour. [GATE-5](GATE_5_REVIEW.md) records fresh startup, real browser QA and restart persistence; it does not approve upstream rights or production use.

Authenticated fixture submission is optional and separate from public fixture reads. Generate a local secret as described in `.env.example`, then use `docker compose --profile collector run --rm collector fixtures/market/mp-02-synthetic.json --submit --poll-seconds 10`; repeat to verify replay. Offline collector invocation remains the default. The delivery path stores raw/canonical data separately. See [ingestion setup, status/count semantics and recovery](INGESTION.md). Existing local volumes and other `.env` settings should be preserved.

With an ingestion secret configured, ingestion collection initialization is required for API readiness. A startup failure exits nonzero so Compose can retry with its bounded restart policy. If retries are exhausted, correct the database/schema problem and restart the API. With the secret absent, the public API can be ready while internal ingestion routes remain disabled with 503.

The local API supports demo account registration, login, logout, the authenticated user endpoint, one authenticated watchlist per user, public fixture-backed daily history, and public stock search over ten fixture equities. `/account` provides Vietnamese registration, login and session management; `/watchlists` provides one private list, membership management and fixture closing prices after account verification. The web root shows company reference information and a link to `/stocks/:symbol`. The detail page shows the latest fixture close, OHLCV, change against the previous available observation, a closing-price line chart and a daily table. `/market` shows the latest fixture VN-Index level, its change against the previous available observation and a daily closing-level table. Existing page handoffs retain historical Stitch references; new work uses the existing app design. Default collector mode validates the synthetic fixture without calling a provider; optional observed ingestion/reads have separate prerequisites below.

## Requirements

- Docker Desktop with Docker Compose v2 or newer; start it and wait until the engine is running before using Compose.
- First-run network access for container images and build dependencies. No market-data provider call is part of core startup.
- For optional host development/checks only: Node.js 22.15 or newer in the Node 22 line, npm 10.9 or newer, and Python 3.10 with `requirements-dev.txt`. The collector container and CI use Python 3.12.

## Ports and existing local settings

Copy `.env.example` to `.env` if you want to change the published host ports. The example contains no secrets. Compose publishes app and database ports on `127.0.0.1`; do not bind local development services to a public interface. If host port 27017 is occupied, set `MONGODB_PORT=27018` in `.env`; if port 6379 is occupied, set `REDIS_PORT=6380`. The MongoDB and Redis container ports stay 27017 and 6379.

Defaults are web 5173, API 3001, MongoDB 27017 and Redis 6379. `WEB_PORT`, `API_PORT`, `MONGODB_PORT` and `REDIS_PORT` change only the host side. Update browser/health URLs when changing their ports. Use the same env file, project name and overrides for startup, status, stop and restart. Shell variables override env-file values. For a fresh fixture-default check, remove inherited `INGESTION_SECRET` and `OBSERVED_READS_ENABLED` (and unintended port overrides) from that PowerShell session; `.env.example` supplies an empty secret and `false`. Do not overwrite an existing `.env` or remove another project's containers/volumes to fix a collision.

## Start the Compose stack

From the repository root in PowerShell:

```powershell
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example up --build --detach --wait
docker compose --env-file .env.example ps
```

This explicit env file uses committed fixture defaults without reading an existing `.env`. For your customized `.env`, replace `--env-file .env.example` with `--env-file .env` consistently. Successful startup has five healthy services: `web`, `api`, `worker`, `mongodb` and `redis`. On failure, inspect `docker compose --env-file .env.example ps` and `docker compose --env-file .env.example logs --tail 80`; correct the reported Docker/port/dependency issue and rerun startup.

### First launch and reusable login

Search and market views work without login. For a first private list, open **Tài khoản → Đăng ký**, enter your own local demo email and a password of 15–128 characters, repeat the password and select **Tạo tài khoản**. Registration signs you in. Open **Theo dõi**, create a named list, search FPT and choose **Thêm FPT**. Reload verifies the saved list. Log out via **Tài khoản**, then use **Đăng nhập** with the same credentials to return to it. The [README tour](../README.md#run-the-local-demo) covers the public pages.

**Dated clarification · 14/10/2026:** the historical MP-15 plan mentioned a seed account. No seed account, seeding command or shared credentials exist in this implementation. First-run UI registration followed by reusable login is the accepted local-demo path; no account helper was added for this documentation task. Password reset is unavailable, so use disposable demo credentials and remember them locally.

### Stop and restart with saved data

```powershell
docker compose --env-file .env.example stop
docker compose --env-file .env.example up --detach --wait
```

Keep the same Compose project/env file/ports. Named MongoDB and Redis volumes remain in place, so accounts and watchlists survive stop/start or ordinary container recreation. `docker compose down` removes containers/network while retaining named volumes; `down --volumes` deletes those volumes and is not a normal restart. Login handles live only in the current browser tab, expire after eight hours and are revoked by logout. If a tab is closed or the session expires, log in again; that is separate from losing the account/list. [Gate 5](GATE_5_REVIEW.md) verified a fresh owned project and stop/start without volume removal.

Open `http://127.0.0.1:5173` and submit `FPT`, `Vietcombank`, `Hòa Phát`, or `vin`. The page makes a same-origin request through Vite's `/api` proxy; Compose sets the server-only `API_PROXY_TARGET` to `http://api:3001`. Search `vin` returns VHM, VIC, VNM in that order. Select a result to inspect reference information and HTTPS source links, then follow “Xem chi tiết & biểu đồ ngày”. Check API liveness at `http://127.0.0.1:3001/health/live` and readiness at `http://127.0.0.1:3001/health/ready`. Readiness is 200 only while MongoDB and Redis answer their health checks, auth indexes initialize, the fixture plus its ten-entry company-reference catalog validate, and the watchlist equity catalog and unique owner index initialize; its response does not include internal errors.

The initial page invites a search. Pending requests show loading; an unknown query shows an empty state; unavailable services or malformed responses show an error with retry. Blank or overlong queries have an inline validation message. Requests time out after ten seconds; a new submission cancels the previous request and prevents stale results from replacing the newer search. Company names, exchange, currency, timezone and reference dates come from the API. The reference review date is not a market as-of time. The demo labels do not assert live coverage or freshness. See [the search design handoff](FR03_SEARCH_DESIGN.md) for design references and QA evidence.

## Stock detail page

Open `http://127.0.0.1:5173/stocks/FPT` directly or follow the link from search. Lowercase symbols normalize to uppercase. Reloading the detail URL works; “Quay lại tìm kiếm” restores the submitted query when opened from search. Navigation uses ordinary links and full page loads. Unsafe/malformed paths and `VNINDEX` display an invalid-route state; a valid but unknown symbol displays the API's unknown-symbol state. Vite rejects some malformed URL encodings before React receives the path.

The page requests history and optional company reference information through the same-origin proxy. History loading, empty results, HTTP/network failures, invalid response data and retry are distinct states. A reference lookup failure preserves valid price history under a generic stock name. With the committed fixture, FPT shows 102,500 VND at 23/09/2026 and +1,500 VND (+1.49%) versus the previous available observation on 22/09/2026. That comparison is not a verified previous trading session. A single observation has no fabricated comparison; no-data results show no price or chart and no as-of.

The fixture has only three daily observations per asset. The chart places actual dates proportionally, preserves every marker and breaks the line across gaps greater than one calendar day because the session calendar is unverified. The responsive chart keeps text readable; the daily table scrolls within its own region on narrow screens. Currency, volume units, timezone, source, as-of, freshness and adjustment basis are visible. Neither the chart nor company reference dates assert current market coverage. See [the detail design handoff](FR04_DETAIL_DESIGN.md) for scope and QA evidence.

## VN-Index overview page

Open `http://127.0.0.1:5173/market` directly or use “Tổng quan” in the shared header. `/market/` and reload work. The header links overview, stock search and detail using ordinary page loads; the detail page's search link preserves its submitted query. `VNINDEX` continues to be unsupported at `/stocks/VNINDEX` because the stock detail page accepts equities.

The page requests `GET /api/assets/VNINDEX/history` through the same-origin proxy. The committed fixture shows 1,308 index points at 23/09/2026, with -2 points (-0.15%) versus the previous available observation on 22/09/2026 and three closing levels of 1,300, 1,310 and 1,308. This is not a verified previous trading session or a current index level. Units are `index_point`, currency is `null` (“Không áp dụng”), and volume is `null`/`not_available`; no market breadth or total liquidity is inferred.

Loading, no-data, HTTP/network/timeout failures, invalid response data and retry are handled explicitly. A single observation has no fabricated comparison; a zero change remains 0%; empty history has no numeric level/change or as-of. The source panel shows fixture provenance, unknown freshness, UTC+7, the unverified session calendar and available range. The page uses the shared Stitch design system and has a page title, active navigation, keyboard skip-link and responsive layout. See [the overview design handoff](FR02_OVERVIEW_DESIGN.md) for scope and coordinator QA evidence.

## Authentication API

### Account page

Open `http://127.0.0.1:5173/account` or use “Tài khoản” in the shared header. `/account/` and reload work. Choose “Đăng ký” to create a demo account with repeated password confirmation, or “Đăng nhập” for an existing account. Email is trimmed/lowercased; passwords retain all whitespace and Unicode, with the same 15–128 codepoint/512 UTF-8-byte limits as the API. There is no password reset, OAuth or remember-me option. Search remains public. See [the account design handoff](FR01_AUTH_DESIGN.md).

Only `{ version: 1, token, expiresAt }` is saved under `marketpulse.auth.v1` in sessionStorage. No password, user identity or localStorage is persisted. Restoring the page verifies `/me` before showing an identity; temporary verification failure retains the token and offers retry or logout. A storage preflight blocks credential POST when tab storage is unavailable. A later storage write failure retains the active session in page memory with a warning to log out before leaving/reloading. Expiry is checked by timer and when the tab gains focus/visibility; returning through browser page cache verifies the session again. Account creation and session-expiry times are displayed in UTC+7 and are not market as-of times.

Requests use the same-origin proxy, no-store, a ten-second timeout and cancellation/stale-response guards. Sensitive POST requests are not automatically retried. If registration response delivery is ambiguous, try login first because an account may have been created. Logout clears the tab session only after server 204 or an already-invalid 401; network/timeout/5xx failures retain the token and offer logout retry. This storage policy is for the local demo, not production auth hardening. Closing a tab removes its saved handle without revoking the server session; use logout to revoke it. Browser QA is recorded separately from the CI HTML shell smoke.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create a local user and issue a bearer session. |
| `POST` | `/api/auth/login` | Verify credentials and issue a bearer session. |
| `POST` | `/api/auth/logout` | Revoke the presented session; returns 204. |
| `GET` | `/api/auth/me` | Return the user belonging to the presented session. |

Register and login accept a JSON object with string `email` and `password` fields and reject additional fields. Email is trimmed and lowercased. Passwords must contain 15–128 Unicode characters and at most 512 UTF-8 bytes; the API stores a salted scrypt hash. The server assigns the `USER` role. Login and registration return `{ token, tokenType, expiresAt, user }`; the user object contains only `id`, `email`, `role`, and `createdAt`.

Send the opaque token only in `Authorization: Bearer <token>` for `/me` and `/logout`. The API does not use cookies or query-string tokens. Responses from auth routes use `Cache-Control: no-store`. Sessions expire after eight hours and logout deletes the session; requests check expiry immediately even while MongoDB's TTL cleanup is pending. MongoDB stores only the SHA-256 token digest. The user collection has a unique normalized-email index; sessions live in a separate collection with a unique token-digest index and an expiry TTL index.

The process limits registration and login attempts per remote IP, without trusting `X-Forwarded-For`. Defaults are 20 attempts per 60 seconds and at most two concurrent scrypt operations. `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`, and `AUTH_KDF_CONCURRENCY` are bounded configuration settings. The limiter is in-memory, resets when the API restarts, and is intended for the single-process local demo; it is not production hardening.

## Watchlist API

Every route requires the existing `Authorization: Bearer <token>` session. Ownership comes exclusively from the authenticated server principal; headers such as `X-User-Id` never select another user's data. All query parameters and additional JSON fields, including owner IDs, are rejected. Responses, including authentication and validation errors, use `Cache-Control: no-store`.

| Method | Path | Request | Success |
|---|---|---|---|
| `GET` | `/api/watchlists` | No body or query. | 200 `{ data: [] }` or `{ data: [watchlist] }`. |
| `POST` | `/api/watchlists` | JSON `{ "name": "Theo dõi" }`. | 201 `{ data: watchlist }`. |
| `PATCH` | `/api/watchlists/:id` | JSON containing only `name`. | 200 `{ data: watchlist }`. |
| `DELETE` | `/api/watchlists/:id` | No body. | 204 with no response body. |
| `PUT` | `/api/watchlists/:id/symbols/:symbol` | No body. | 200 `{ data: watchlist }`. |
| `DELETE` | `/api/watchlists/:id/symbols/:symbol` | No body. | 200 `{ data: watchlist }`. |

The public watchlist contains only `id`, `name`, alphabetically sorted `symbols`, `createdAt` and `updatedAt`. Names are trimmed, contain 1–100 Unicode codepoints and reject control characters even at their edges. Create and rename require `application/json`, accept at most 8kb and reject arrays, primitive values and extra fields. Bodyless routes reject payloads before parsing. IDs must be 24 hexadecimal characters. Symbol membership accepts only exact uppercase symbols from the ten canonical fixture equities; lowercase, unknown symbols and `VNINDEX` return 400. Repeated addition does not duplicate a symbol; repeated removal returns the list with that symbol absent. The bounded universe limits a list to ten distinct symbols.

MongoDB stores watchlists separately from user/session records, with an ObjectId `userId` and a unique `{ userId: 1 }` index. Concurrent creates produce one successful list; subsequent creates return 409 `watchlist_already_exists` until deletion. Rename, addition and removal use atomic updates without upsert. Every operation addressing a list ID filters both ID and authenticated owner. Missing and foreign IDs both return 404 `not_found`. Missing, invalid, expired or logged-out sessions return 401 `unauthorized` when the service is ready. Invalid inputs return 400 `invalid_request`, malformed JSON 400 `invalid_json`, oversized JSON 413 `payload_too_large`, and unsupported media/charset 415 `unsupported_media_type`. Initialization failures leave readiness at 503 and watchlists return 503 `not_ready`; unexpected errors return sanitized 500 `internal_error`. Liveness remains independent.

For example, set `$token` to the token returned by local registration or login, then use the API directly:

```powershell
$watchlistHeaders = @{ Authorization = "Bearer $token" }
$watchlistResponse = Invoke-RestMethod "http://127.0.0.1:3001/api/watchlists" -Method Post -Headers $watchlistHeaders -ContentType "application/json" -Body '{"name":"Theo dõi"}'
$watchlistId = $watchlistResponse.data.id
Invoke-RestMethod "http://127.0.0.1:3001/api/watchlists/$watchlistId" -Method Patch -Headers $watchlistHeaders -ContentType "application/json" -Body '{"name":"Cổ phiếu demo"}'
Invoke-RestMethod "http://127.0.0.1:3001/api/watchlists/$watchlistId/symbols/FPT" -Method Put -Headers $watchlistHeaders
Invoke-RestMethod "http://127.0.0.1:3001/api/watchlists" -Headers $watchlistHeaders
Invoke-RestMethod "http://127.0.0.1:3001/api/watchlists/$watchlistId/symbols/FPT" -Method Delete -Headers $watchlistHeaders
Invoke-RestMethod "http://127.0.0.1:3001/api/watchlists/$watchlistId" -Method Delete -Headers $watchlistHeaders
```

Watchlist timestamps describe account-data changes in UTC and are not market as-of times. This API stores no prices, company metadata or market observations. The watchlist page composes the existing history API for closing prices and changes, retaining its fixture/source/time/freshness labels. The scoped MP-09 functionality has code and fixture browser QA; independent GPT-6 Astra review approved it on 05/10/2026 with no actionable findings. The reviewer inspected code/tests/docs and original-document preservation; it did not rerun the full suite or browser checks. Actual BFCache remains unverified, separate from real browser Back and simulated persisted pageshow evidence. Update on **06/10/2026:** both CI runs passed on merged `main` commit `b996e3e3e70ffbacf13fb8d319a182303d05dfc9`, and [GATE-3](GATE_3_REVIEW.md) passed fresh local fixture core-flow checks. Original FR-06 remains partial and the live-source gate remains **NOT VERIFIED**.

### Watchlist page

Open `http://127.0.0.1:5173/watchlists` or `/watchlists/`, or follow “Theo dõi” in the shared header. Guests receive a link to `/account`. The page calls `/me` before private list requests; unverified sessions offer verification retry or logout. Create a named list, search for a code or company name and select “Thêm”. Added symbols and the ten-symbol capacity are disabled in search results. Rename uses a separate inline form; deletion requires inline confirmation. A removed or deleted list is not optimistically shown as saved.

Only one write can run at a time. Network/timeout/invalid-response/5xx/404/409 write failures hide the previous list and reconcile with a fresh GET; no write is automatically retried. If reconciliation fails, use “Tải lại danh sách” before another write. A private 401 invalidates only its issuing token. Identity changes, logout, expiry and pagehide clear private state and ignore late callbacks; persisted pageshow reloads current tab storage. Focus/visibility also check expiry.

Each sorted symbol links to its detail page and loads history independently, with a price retry that does not hide other rows. Close and absolute/percentage change use the previous available observation, not a verified prior trading session. Zero/single observation history never fabricates a comparison. The page displays VND, `marketpulse-fixture`, UTC+7, as-of, unknown freshness, unverified calendar and per-row adjustment basis. List `updatedAt` is displayed separately as account modification time. No live data, automatic query-string addition, multiple lists, sparklines, news or alerts are included. See [the watchlist design handoff](FR06_WATCHLIST_DESIGN.md) for Stitch references and separate real/mock browser QA evidence.

## Daily history API

`GET /api/assets/:symbol/history` returns a canonical v1 envelope for one known fixture asset. The route is public and requires no bearer token because the committed dataset is synthetic demo content. It reads the fixture bundled with the API image; it does not contact a market-data provider.

The optional query parameters are `interval=1d` (the default), `from=YYYY-MM-DD`, and `to=YYYY-MM-DD`. Bounds are inclusive and must be valid calendar dates; duplicate, nested, unknown or unsupported parameters return 400. Symbols are case-normalized and limited to 32 safe characters. An unknown symbol returns 404. A known symbol with no candles in the requested range returns 200 with `meta.status: "no_data"`, the selected asset, an empty candle array and `meta.asOf: null`. Missing dates remain absent; the API does not infer exchange-calendar coverage or fill gaps. Responses use `Cache-Control: no-store`.

The canonical `data` envelope preserves the fixture dataset label, `fixture / unknown` freshness, `unverified` session calendar, original source fields, units, null index volume and candle timestamps. `meta.availableRange` covers the entire fixture series; `meta.asOf` is the timestamp of the latest candle actually returned. If the fixture cannot be loaded or its required shape is invalid, readiness remains 503 and the route returns a sanitized 503 response.

## Optional stored observed history API

Set `OBSERVED_READS_ENABLED=true` explicitly for authorized local use. The default is `false`; only literal `true` or `false` is accepted, and any other value fails startup. Compose passes this flag only to the API. Host Node processes require it in their environment; `.env` is not loaded automatically. Changing the Compose flag requires recreating the API, for example `docker compose up -d --build --force-recreate api`. This read-only route needs MongoDB and the API's normal dependencies, but does not require `INGESTION_SECRET`, start a collector, initialize ingestion collections or call KBS. Disabling submission does not disable already stored reads. With the flag absent/false the route is unregistered and returns 404.

A fresh clone/new MongoDB volume has no observed assets or candles. Enabling the flag alone does not populate them. The **Dữ liệu đã lưu · KBS** choices on FPT and VN-Index read only previously stored data; they do not fetch KBS, and an error/empty response does not fall back to fixture. Use the separately authorized [adapter](VNSTOCK_ADAPTER.md) and [ingestion procedure](INGESTION.md) only after reviewing their source/rights limits. The FPT collection-status card is also optional and does not measure actual provider freshness. MP-11/MP-12 remain partial.

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/observed/assets/FPT/history?from=2026-09-28&to=2026-10-07"
Invoke-RestMethod "http://127.0.0.1:3001/api/observed/assets/VNINDEX/history?from=2026-09-28&to=2026-10-07&interval=1d"
```

Both inclusive bounds are required valid `YYYY-MM-DD` calendar dates, spanning at most 31 days difference (32 calendar dates). Only optional `interval=1d` is accepted. There is no default window or pagination. Duplicate, nested, unknown, empty, reversed, invalid or overlong-range queries return 400 `invalid_query`. Symbols are case-normalized; malformed symbols return 400 `invalid_symbol`, unsupported symbols and absent stored assets return 404 `asset_not_found`. A stored asset without selected rows returns 200 `no_data`, empty candles and null returned range. A database failure or invalid selected stored data returns sanitized 503 `observed_history_unavailable`. Route responses, including these errors, use `Cache-Control: no-store`.

The response is a read contract: `data` contains stored `dataset`, one `asset` and `candles`. It has no ingestion `request`, ingestion schema-version declaration, quote or index-summary arrays. `meta` contains `status`, `provider: KBS`, `interval: 1d`, `requestedRange`, `returnedRange` (first/last actually returned date, or null), `sourceAsOf: null`, `completeness: unknown` and `selectionSemantics: per_bar_max_collected_at_utc_microseconds_then_content_digest`. Each candle retains decimal-string OHLC, null volume/source as-of, currency/unit, timezone, adjustment basis, provider calendar label/time provenance, original collectedAt, full source versions, barId and contentDigest. Internal database IDs, delivery IDs and normalized collectedOrder are excluded. No numeric price conversion, quote/change synthesis, gap fill or latest market timestamp is performed.

Reads query only `observed_assets` and `observed_candles_latest`, by asset plus exact KBS/daily/adjustment identity and date range, using the existing asset/date index shape. Each database operation has a 1,000 ms server execution bound by default (`DEPENDENCY_TIMEOUT_MS` in the actual API); the candle cursor fetches at most 33 rows and rejects results beyond 32. Stored shapes, labels, hashes, OHLC relationships, time consistency, date bounds, order and uniqueness are checked before a response is exposed.

Selection is the latest collection tuple **per bar**, not verified provider chronology, correction precedence or freshness. Bars can come from different deliveries; successful reads can include rows retained after a partial or failed delivery. The history route does not read receipts or verify a coherent batch snapshot, full-series coverage or exchange sessions. Missing days remain absent even between returned bounds, and `completeness` stays unknown. Equity adjustment, source as-of, calendar/freshness and upstream redisplay/deployment rights remain unresolved. This opt-in local API does not migrate the existing fixture history/search/watchlist routes. MP-11 remains partial; the subsection below records the first MP-12 collection-status slice.

### Optional stored observed collection-status API

With the same strict `OBSERVED_READS_ENABLED=true` flag (default false), `GET /api/observed/assets/:symbol/collection-status?from=2026-10-01&to=2026-10-06` summarizes stored FPT/VNINDEX candles. It needs no account token or ingestion secret, makes no provider call, and does not enable the flag itself. Symbols are case-insensitive. As for history, both inclusive valid dates are required, the difference is at most 31 days (at most 32 bars), and only optional `interval=1d` is accepted; duplicate or extra query parameters are rejected.

The read uses the same indexed, bounded asset/latest-candle query and full selected-row validation as history. Only collection-status reads additionally select delivery IDs; at most 32 distinct usable IDs are resolved via the built-in receipt `_id` index, with an explicit metadata projection, result limit and query timeout. The response's `data` contains only the validated dataset and asset. Its `meta` contains provider/interval, requested and returned trading-date ranges, `selectedCandleCount`, and `collectedAtRange` (`from`/`to`, null when empty). Collection-time bounds compare exact UTC microseconds while preserving the selected timestamps' original offsets. Collection time is never source as-of.

`candleCountsByDeliveryStatus` contains `accepted`, `queued`, `running`, `success`, `failure` and `unknown`. Counts are per selected candle, so two candles referencing one receipt count twice; they are not job counts or receipt completion counts. Missing/unusable references, missing receipts, wrong provider/schema/dataset or unsupported states count as unknown. A receipt lookup failure fails the request with sanitized 503 rather than guessing unknown. No delivery IDs, payloads, digests, prices, receipt errors, database details or secrets are returned.

`status` is `available` when selected bars exist and `no_stored_bars` when the known asset has none in the requested range; this does not assert provider no-data. `sourceAsOf` is null, freshness/completeness are unknown and the session calendar is unverified. `statusSemantics=referenced_delivery_status_at_read_time` and `consistency=non_atomic_read` explicitly label separate candle/receipt reads: concurrent ingestion can change the projection or receipt between reads. Success/failure describes the referenced local batch, not current provider health, current prices, freshness, complete market coverage or a coherent snapshot.

Every registered response is `Cache-Control: no-store`. Invalid input returns 400, unsupported/missing assets return 404, and readiness/database/corrupt-selected-storage failures return 503 with `{ "error": "observed_collection_status_unavailable" }`. With the flag absent or false the route is unregistered (404). The history envelope and fixture routes retain their contracts. This API-only first MP-12 slice leaves UI, cache, scheduler and retry changes for later; FR-18/MP-12 remain partial and public redisplay/deployment rights remain unresolved.

### Optional stored FPT detail page

The valid FPT observed mode also reads `/api/observed/assets/FPT/collection-status?from=…&to=…` in an independent full-width card after the date form. Loading/empty/error/retry are separate from history; **Thử lại trạng thái thu thập** rereads only status. No request is made for fixture, invalid inputs, other equities or the market page. The six buckets count selected observations by referenced local delivery status, not jobs; unknown is not failure. Counts/ranges belong to this status read and may differ from displayed history because the reads are independent and non-atomic. Raw collected timestamps retain their offsets and are not source as-of; freshness/completeness remain unknown and the session calendar unverified. No provider, ingestion retry, polling or cache is invoked. See [the status UI handoff](FR04_DETAIL_DESIGN.md#mp-12--fr-04--trạng-thái-thu-thập-fpt--13102026).

The FR-04 UI slice adds an explicit FPT source choice; `/stocks/FPT` still defaults to the synthetic fixture. Open `/stocks/FPT?source=observed&from=2026-09-28&to=2026-10-07` through the web origin for the fixed, labelled sample range. Both inclusive dates are required, with at most 31 days difference (32 calendar dates); the date form submits a new URL. Only FPT is supported by this observed page, even though the API supports VNINDEX. Search/account/watchlist pages keep their existing data paths. Market fixture remains the default; the separate opt-in index mode is described below.

The UI does not enable the server flag or invoke a collector/provider. With stored reads disabled, a missing asset or a failed request, it displays the observed error and retry where applicable; it never silently falls back to fixture. A stored asset with no selected rows displays an empty state, requested range and unknown provenance without fabricating prices or a chart. The sample link does not imply a latest window.

Observed OHLC/close text keeps exact decimal strings; the approximate chart is hidden if distinct prices collapse during geometry conversion. Missing calendar dates remain gaps. Unknown adjustment prevents price-change/return calculation; null volume stays unavailable. Provider labels are naive calendar text; collectedAt retains its original offset and is not source as-of. Freshness, completeness and source as-of remain unknown, with an unverified session calendar and the per-bar selection limitations above. See [the FR-04 handoff](FR04_DETAIL_DESIGN.md#mp-11--fr-04--dữ-liệu-fpt-đã-lưu--10102026) for Stitch, verification and remaining limits.

### Optional stored observed VN-Index overview

With the optional stored-read API enabled locally as described above, open `/market?source=observed&from=2026-09-28&to=2026-10-07` (or `/market/` with the same query). The source link selects this fixed, labelled sample window; it does not claim to be latest. The GET date form requires both inclusive dates, with at most 31 days difference (32 calendar dates). Duplicate/unknown query parameters, invalid source/date/range are rejected without fetching. `/market` and `/market/` keep the existing fixture summary/calculations by default; the fixture source link clears the observed range.

Only this valid mode calls the existing `/api/observed/assets/VNINDEX/history`, with no-store and a 10-second timeout. It neither enables the server flag nor calls a provider/collector or falls back to fixture. Missing/disabled reads, unavailable/network/timeout/malformed responses have observed errors and retry where applicable. Empty results retain source metadata and show no price. Retry/unmount cancels requests and discards late results.

The dedicated index guard requires `VN:INDEX:VNINDEX`, index type, null currency, `index_point`, `Asia/Ho_Chi_Minh`, adjustment `not_applicable`, and the stored KBS/Vnstock/vnai contract. Summary/table closes preserve exact decimal strings. The four table columns retain date, close in index points, naive provider label and original collectedAt offset. Null volume is unavailable; source as-of/freshness/completeness are unknown and the session calendar is unverified. There is no change/return calculation: per-bar latest may mix collections or include partial/failed batches and does not verify a coherent snapshot. FPT observed detail keeps its own unchanged guard and interface. See [the FR-02 handoff](FR02_OVERVIEW_DESIGN.md#mp-11--fr-02--dữ-liệu-vn-index-đã-lưu--11102026) for design, checks and remaining limits. MP-11 is partial; MP-12 and upstream public redisplay/deployment remain open.

## Stock search API

`GET /api/assets/search?q=...` searches symbol, company name and curated aliases for exactly the ten equity assets in the bundled fixture. For example:

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/assets/search?q=Vietcombank"
```

The query must contain exactly one nonblank `q` value of at most 100 decoded Unicode codepoints. Repeated, nested, unknown, missing, blank and overlong parameters return 400 `invalid_query`. Matching is literal substring search after Unicode accent removal, `đ` folding, lowercasing and whitespace collapse; results prioritize exact symbol, symbol prefix, then alphabetical symbol. It does not provide fuzzy ranking or recent-search suggestions.

Each result returns the unchanged canonical asset, `companyName`, `aliases`, and `reference` with official source URLs and `reviewedOn`. Top-level metadata identifies `fixture equities`, `fixture / unknown`, provider `marketpulse-fixture`, the synthetic label and `asOf: null`; no market observation is associated with the reference snapshot. `reviewedOn` is not a market as-of date, and the curated company names do not guarantee current registration details. `VNINDEX` is excluded. Responses, including errors, use `Cache-Control: no-store`. If catalog coverage differs from the ten loaded fixture equities or reference metadata is invalid, search returns a sanitized 503 and readiness stays false.

Run the real service integration checks from another terminal while the stack is running:

```powershell
npm ci
npm run test:integration
```

The existing health integration check uses a unique MongoDB collection and Redis key, verifies read/write round trips and readiness across a client disconnect, then removes only those records. Auth and watchlist integration checks each create and drop their own uniquely named test database. Auth verifies registration races, stored hashes/digests, login, principal isolation, session expiry and logout revocation. Watchlists registers two real users and verifies every route's authentication, foreign/missing ID isolation, forged ownership claims, concurrent create/add operations, the ten-symbol limit, repeated removal, delete/recreate and expired/revoked sessions. These tests do not stop the Compose Redis container. If a host port was changed, set the matching URLs before running the host-side test, for example `$env:MONGODB_URL="mongodb://127.0.0.1:27018/marketpulse"` and `$env:REDIS_URL="redis://127.0.0.1:6380"`. Compose volumes remain available after `docker compose down`; `docker compose down -v` removes them.

To run the fixture-only collector once:

```powershell
docker compose --profile collector run --rm collector
```

The output records fixture source mode, freshness and row counts. Invalid fixture input exits with an error. This command is not an upstream provider test.

## Run app processes on the host

To run Vite and the API outside containers, start only their dependencies first because the API exits after its bounded startup retries if a dependency is unavailable:

```powershell
docker compose up -d mongodb redis
docker compose stop api web
npm ci
npm run dev:api
```

If the full Compose stack is already running, stop its API and web containers first to free ports 3001 and 5173. In a second terminal, run `npm run dev:web`. Host processes default to loopback. Vite proxies `/api` to `http://127.0.0.1:3001` by default; if the host API uses another port, set `$env:API_PROXY_TARGET="http://127.0.0.1:3002"` in the web terminal before starting Vite. This variable configures the development server, is not a `VITE_*` client value, and contains no credential. No broad CORS policy or production hosting is introduced. The API reads `MONGODB_URL`, `REDIS_URL`, `PORT`, `HOST`, and the `AUTH_*` settings from the process environment; Node scripts do not load `.env` automatically, and the default URLs match the Compose database ports. Stop each foreground process with Ctrl+C. If the API exhausts startup retries, check the database containers and start the API again.

After Redis disconnects, the API exits and Compose attempts up to five restarts. MongoDB readiness failures return 503 while `/health/live` remains available. If the Redis restart limit is exhausted, recover the API with `docker compose up -d --force-recreate api`; the database volumes remain untouched.

## Checks

### Committed core-flow browser tests (MP-14)

Install Node dependencies and the pinned Chromium browser, then start only the database dependencies. The browser suite starts its own API entry point and Vite server on dynamically allocated loopback ports; existing Compose API/web services may stay running and are never reused.

```powershell
npm ci
npx playwright install chromium
docker compose up --detach --wait mongodb redis
npm run test:e2e
```

On Linux CI, install browser system dependencies with `npx playwright install --with-deps chromium`. Node 22 and working local MongoDB/Redis are required. The runner does not load `.env`; its defaults are MongoDB port 27017 and Redis port 6379. For this repository's alternate MongoDB host port:

```powershell
$env:E2E_MONGODB_URL="mongodb://127.0.0.1:27018"
$env:E2E_REDIS_URL="redis://127.0.0.1:6379"
npm run test:e2e
```

Only single loopback dependency URLs are accepted. The MongoDB URL's database path is always replaced by a random `marketpulse_e2e_<32 hex characters>` database. Registration and watchlist writes go through the UI into that database; no test user or account state is seeded through an API or database write. A separate ownership marker guards database cleanup. Cleanup verifies the exact generated name and marker before dropping that database, on success, startup failure and test failure. Other databases and Compose volumes are preserved. The API uses Redis only for readiness because ingestion is explicitly disabled; the harness never starts a worker, clears queues or flushes Redis. Observed reads are also explicitly disabled, and no upstream provider is contacted.

`playwright.config.ts` runs Chromium with one worker and no retries: independent desktop (1440px) and narrow mobile (320px) journeys search FPT, select the result, open the visible three-point SVG chart and daily table, assert exact fixture closes/source/as-of/VND/timezone/unknown freshness/calendar labels, register through the UI, create a watchlist, add FPT, reload to verify the persisted session/list, and log out before checking that private content is unavailable. A second isolated browser context registers another account and sees an empty private list. The existing API integration suite separately proves that user B cannot read or mutate user A's list. Both journeys assert no uncaught page errors and no page-level horizontal overflow; table scrolling remains allowed. There are no successful-response intercepts.

The harness waits for each owned child's listening signal and HTTP readiness and uses strict web ports, so it cannot reuse an arbitrary existing server. It stops only its own process trees (Windows child PID tree; Linux dedicated process groups). Startup waits, actions, navigation, tests and the entire browser suite are bounded. Missing dependencies or Chromium cause a nonzero failure, never a skip. Run through `npm run test:e2e`; invoking Playwright directly has no managed stack and is rejected by configuration. Standard Playwright filters can be forwarded, for example `npm run test:e2e -- --project=desktop`.

Failure screenshots mask all input fields. CI retains only these PNGs for three days; traces, video, session storage, auth request/response bodies, connection URLs and environment files are not uploaded. Child application output is withheld and generated credentials are not logged. The pinned runner disables Playwright's automatic page snapshot prompt; error text and code locations remain visible. Browser failures do not imply live-source readiness or complete UI state/accessibility coverage. Loading/empty/error/retry and broader browser-state evidence remain in the existing page handoffs; this suite covers the real fixture success journey and private-content boundaries.

Local verification on 14/10/2026: two browser journeys, 172 unit tests, 27 real MongoDB/Redis integration tests, 27 Python contract tests and 29 collector tests passed without skips; lint/typecheck/build and documentation checks also passed. The initial restricted Windows sandbox blocked loopback unit requests and Vite realpath access; those checks passed when rerun with scoped local access. Review and remote CI are separate acceptance evidence, not implied by these local results.

Cleanup was also exercised with unavailable Redis during startup and a deliberately short browser-test timeout. Both runs exited 1, each removed its exact generated database, and all observed owned descendants stopped (three for startup failure; twelve including browser/worker/esbuild for the test failure). The database-name set returned to its baseline and the existing `marketpulse` database's content hash was unchanged. This was a temporary read-only audit around the committed runner on Windows. An externally forced termination of the harness itself, machine shutdown or unreachable MongoDB during cleanup cannot guarantee database removal; the runner reports cleanup failure rather than broadening deletion scope.

`npm run test:e2e:harness` runs the committed harness regressions before the browser suite in CI. Four checks passed on Windows: malformed MongoDB URL, malformed Redis URL and MongoDB constructor failures return only a fixed error without a synthetic credential sentinel, and an unowned process is refused and remains alive. A disposable Linux container with init, no network, a read-only test-source mount and no app volumes passed all six checks: the same four plus an owned descendant remaining after its parent exits, and a descendant ignoring SIGTERM after its parent stops. The supervisor waits on the tracked process group independently of parent exit, escalates after a bounded grace period and verifies that the whole group is gone. Full Linux browser/stack execution remains pending remote CI.

Independent GPT-6 Astra re-review approved the corrected implementation on 14/10/2026 with no remaining blockers. The reviewer independently ran the four Windows harness regressions and reviewed the worker's six passing Linux regression results; the full local suite, browser journeys and cleanup audit above are worker evidence. Full Linux browser/stack execution and remote CI remain pending.

**Remote acceptance update · 14/10/2026:** the preceding pending statements describe the earlier worker/review handoff. On merged `main` commit [`dd1ae64e509e67cead2a1c93a607372e1346e62c`](https://github.com/Son2110/Market-Pulse/commit/dd1ae64e509e67cead2a1c93a607372e1346e62c), [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/38507379609) and [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/38507379712) succeeded. Actual logs confirm 172 unit, 27 integration, six Linux harness regressions, two Linux Chromium journeys, 27 Python contract and 29 collector tests, plus Compose/HTTP smoke and durable replay. MP-14 is accepted on that baseline. [Gate 5](GATE_5_REVIEW.md) adds fresh isolated Compose/browser/restart evidence; its documentation branch review and CI are separate.

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run build
python -m pip install -r requirements-dev.txt
python scripts/validate_market_data.py
python -m unittest discover -s tests -v
python -m unittest discover -s services/collector/tests -v
python scripts/check_docs.py
python scripts/build_docs.py
```

Run `npm run test:integration` with local MongoDB and Redis available. It fails with a clear message if either dependency cannot be reached; it does not skip.

The historical GATE-3 baseline's [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/37275919994) confirms **131 unit tests**, **17 real MongoDB/Redis integration tests**, **24 Python contract tests** and **six collector tests**, with no required checks skipped. The unit suite includes ingestion validation/digest checks and the existing search/detail/overview/auth/watchlist validation, bounded requests, write locks, reconciliation, 401/token guards and late replies after identity changes, expiry, logout or membership changes. Integration covers auth/watchlist ownership and concurrency plus eight ingestion scenarios, including replay, partial-write/crash recovery, outbox reconciliation, canonical conflicts and API startup recovery. See [ingestion evidence and limitations](INGESTION.md). These are historical CI counts from commit `b996e3e3e70ffbacf13fb8d319a182303d05dfc9`; current MP-14 counts are above. The full suite was not repeated during the Gate 5 documentation task.

Application CI also checks `/stocks/FPT`, `/market`, `/account`, `/watchlists` and `/watchlists/` serve the web entry, and the same-origin FPT/VNINDEX history proxies preserve the fixture candles, units, as-of and freshness. It now includes the committed isolated browser suite described above, with Chromium installation as an ordinary required step. [GATE-3 on 06/10/2026](GATE_3_REVIEW.md) records earlier five-service Compose startup and browser checks of the real core flows at 1440/390/320px, with mocked loading/empty/error/retry evidence recorded separately. Earlier browser state evidence remains in [the MP-07 handoff](FR04_DETAIL_DESIGN.md), [the MP-08 handoff](FR02_OVERVIEW_DESIGN.md), [the account handoff](FR01_AUTH_DESIGN.md) and [the watchlist handoff](FR06_WATCHLIST_DESIGN.md). Those temporary scripts were historical QA; the committed MP-14 framework passed independent review and exact-baseline remote CI on 14/10/2026.

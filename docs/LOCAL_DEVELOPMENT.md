# Local development

The local API supports demo account registration, login, logout, the authenticated user endpoint, public fixture-backed daily history, and public stock search over ten fixture equities. It has no watchlist route. The web root is a Vietnamese search page designed in Stitch; it shows company reference information on the same page, with no price/chart or dedicated stock route yet. The collector validates and summarizes the committed synthetic fixture; it does not contact Vnstock or ingest live data.

## Requirements

- Docker Desktop with Docker Compose v2 or newer; start it and wait until the engine is running before using Compose.
- Node.js 22.15 or newer in the Node 22 line, with npm 10.9 or newer.
- Python 3.10 for host-side fixture checks. The collector container and CI use Python 3.12.

Copy `.env.example` to `.env` if you want to change the published host ports. The example contains no secrets. Compose publishes app and database ports on `127.0.0.1`; do not bind local development services to a public interface. If host port 27017 is occupied, set `MONGODB_PORT=27018` in `.env`; if port 6379 is occupied, set `REDIS_PORT=6380`. The MongoDB and Redis container ports stay 27017 and 6379.

## Start the Compose stack

From the repository root in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose config --quiet
docker compose up --build --wait
```

Open `http://127.0.0.1:5173` and submit `FPT`, `Vietcombank`, `Hòa Phát`, or `vin`. The page makes a same-origin request through Vite's `/api` proxy; Compose sets the server-only `API_PROXY_TARGET` to `http://api:3001`. Search `vin` returns VHM, VIC, VNM in that order. Select a result to inspect reference information and HTTPS source links. Check API liveness at `http://127.0.0.1:3001/health/live` and readiness at `http://127.0.0.1:3001/health/ready`. Readiness is 200 only while MongoDB and Redis answer their health checks, auth indexes initialize, and the fixture plus its ten-entry company-reference catalog validate; its response does not include internal errors.

The initial page invites a search. Pending requests show loading; an unknown query shows an empty state; unavailable services or malformed responses show an error with retry. Blank or overlong queries have an inline validation message. Requests time out after ten seconds; a new submission cancels the previous request and prevents stale results from replacing the newer search. Company names, exchange, currency, timezone and reference dates come from the API. The reference review date is not a market as-of time. The demo labels do not assert live coverage or freshness. See [the search design handoff](FR03_SEARCH_DESIGN.md) for design references and QA evidence.

## Authentication API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create a local user and issue a bearer session. |
| `POST` | `/api/auth/login` | Verify credentials and issue a bearer session. |
| `POST` | `/api/auth/logout` | Revoke the presented session; returns 204. |
| `GET` | `/api/auth/me` | Return the user belonging to the presented session. |

Register and login accept a JSON object with string `email` and `password` fields and reject additional fields. Email is trimmed and lowercased. Passwords must contain 15–128 Unicode characters and at most 512 UTF-8 bytes; the API stores a salted scrypt hash. The server assigns the `USER` role. Login and registration return `{ token, tokenType, expiresAt, user }`; the user object contains only `id`, `email`, `role`, and `createdAt`.

Send the opaque token only in `Authorization: Bearer <token>` for `/me` and `/logout`. The API does not use cookies or query-string tokens. Responses from auth routes use `Cache-Control: no-store`. Sessions expire after eight hours and logout deletes the session; requests check expiry immediately even while MongoDB's TTL cleanup is pending. MongoDB stores only the SHA-256 token digest. The user collection has a unique normalized-email index; sessions live in a separate collection with a unique token-digest index and an expiry TTL index.

The process limits registration and login attempts per remote IP, without trusting `X-Forwarded-For`. Defaults are 20 attempts per 60 seconds and at most two concurrent scrypt operations. `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`, and `AUTH_KDF_CONCURRENCY` are bounded configuration settings. The limiter is in-memory, resets when the API restarts, and is intended for the single-process local demo; it is not production hardening.

## Daily history API

`GET /api/assets/:symbol/history` returns a canonical v1 envelope for one known fixture asset. The route is public and requires no bearer token because the committed dataset is synthetic demo content. It reads the fixture bundled with the API image; it does not contact a market-data provider.

The optional query parameters are `interval=1d` (the default), `from=YYYY-MM-DD`, and `to=YYYY-MM-DD`. Bounds are inclusive and must be valid calendar dates; duplicate, nested, unknown or unsupported parameters return 400. Symbols are case-normalized and limited to 32 safe characters. An unknown symbol returns 404. A known symbol with no candles in the requested range returns 200 with `meta.status: "no_data"`, the selected asset, an empty candle array and `meta.asOf: null`. Missing dates remain absent; the API does not infer exchange-calendar coverage or fill gaps. Responses use `Cache-Control: no-store`.

The canonical `data` envelope preserves the fixture dataset label, `fixture / unknown` freshness, `unverified` session calendar, original source fields, units, null index volume and candle timestamps. `meta.availableRange` covers the entire fixture series; `meta.asOf` is the timestamp of the latest candle actually returned. If the fixture cannot be loaded or its required shape is invalid, readiness remains 503 and the route returns a sanitized 503 response.

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

The existing health integration check uses a unique MongoDB collection and Redis key, verifies read/write round trips and readiness across a client disconnect, then removes only those records. The auth integration check creates and drops its own uniquely named test database; it verifies registration races, stored hashes/digests, login, principal isolation, session expiry, and logout revocation against real MongoDB. Neither test stops the Compose Redis container. If a host port was changed, set the matching URLs before running the host-side test, for example `$env:MONGODB_URL="mongodb://127.0.0.1:27018/marketpulse"` and `$env:REDIS_URL="redis://127.0.0.1:6380"`. Compose volumes remain available after `docker compose down`; `docker compose down -v` removes them.

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

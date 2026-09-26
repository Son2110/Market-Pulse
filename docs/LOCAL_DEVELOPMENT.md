# Local development

MP-03 supplies the local application scaffold. The API exposes liveness and dependency readiness only; it has no market or account routes. The web app intentionally renders a blank root until a page is designed in Stitch. The collector validates and summarizes the committed synthetic fixture; it does not contact Vnstock or ingest live data.

## Requirements

- Docker Desktop with Docker Compose v2 or newer, with the engine running.
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

Open `http://127.0.0.1:5173` to confirm Vite is serving the intentionally blank app shell. Check API liveness at `http://127.0.0.1:3001/health/live` and readiness at `http://127.0.0.1:3001/health/ready`. Readiness is 200 only while MongoDB and Redis answer their health checks; its response does not include internal errors.

Run the real service integration check from another terminal while the stack is running:

```powershell
npm ci
npm run test:integration
```

The test uses a unique MongoDB test collection and Redis key, verifies write/read round trips, closes its Redis client connection to check that readiness fails, reconnects that client and checks readiness again, then removes only the collection and key it created. This exercises client disconnect/reconnect against the live Redis service; it does not stop the Compose Redis container. If a host port was changed, set the matching URLs before running the host-side test, for example `$env:MONGODB_URL="mongodb://127.0.0.1:27018/marketpulse"` and `$env:REDIS_URL="redis://127.0.0.1:6380"`. Compose volumes remain available after `docker compose down`; `docker compose down -v` removes them.

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

If the full Compose stack is already running, stop its API and web containers first to free ports 3001 and 5173. In a second terminal, run `npm run dev:web`. Host processes default to loopback. The API reads `MONGODB_URL`, `REDIS_URL`, `PORT` and `HOST` from the process environment; Node scripts do not load `.env` automatically, and the default URLs match the Compose database ports. Stop each foreground process with Ctrl+C. If the API exhausts startup retries, check the database containers and start the API again.

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

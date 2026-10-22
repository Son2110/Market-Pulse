<p align="center">
  <img src="docs/assets/marketpulse-banner.svg" alt="MarketPulse VN — Vietnamese market intelligence, connected by events" width="100%">
</p>

<h1 align="center">MarketPulse VN</h1>

<p align="center"><strong>Event-driven market intelligence for Vietnam</strong></p>

**Project status · 18/10/2026:** the reproducible local fixture core has passed GATE-5. P1.2 synthetic gold contract, P1.3A ingestion/storage and P1.4 stored read API are merged; [PR #35](https://github.com/Son2110/Market-Pulse/pull/35) is the current baseline, with successful [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/39060311421) and [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/39060311438). Gold reads are API-only and off by default; there is no gold UI or real gold collector. Stock search, detail/daily chart, VN-Index, local accounts and one private watchlist run with Compose and committed MP-14 browser tests. MP-11/12 provide optional stored KBS views and bounded collection-status evidence. Default reads remain synthetic, observed reads are off, and a fresh clone has no stored observed/gold data. Source freshness/completeness, upstream rights, equity adjustment and broader coverage remain unverified. [Gate 5 evidence](docs/GATE_5_REVIEW.md) preserves its dated acceptance record.

MarketPulse VN is designed to bring Vietnamese equities, market indices, gold, foreign exchange, macro data, financial news and public events into one research experience. The central idea is to show market movement alongside relevant events while making data source and freshness visible. A nearby event is context, not proof of cause.

## Why this project

Market information is spread across data providers and publications. MarketPulse VN explores a traceable path from provider payloads through normalization and time-series storage to a clear dashboard. It combines a practical MERN application with a small Python collector and background processing where those tools fit.

The reproducible demo uses ten synthetic equities plus VN-Index, with three daily observations per asset. FPT closes at 102,500 VND and VN-Index at 1,308 points as of 23/09/2026 15:00 UTC+7 in that fixture. These are demonstration values, not current market prices. A verified broader end-of-day/delayed dataset remains a separate source gate.

## Project boundary

| Stage | Scope |
|---|---|
| Local core · P0 | Reproducible fixture authentication, stock search/detail/daily chart, VN-Index and one private watchlist; provenance/as-of/freshness labels, replay/ownership checks and committed browser CI. |
| Current · P1 + foundation | Gold audit/design and synthetic contract/storage/read API exist. Real-source collection, public redisplay and training remain gated. A1–A4 document and incrementally strengthen the existing ingestion foundation before news ingestion or automated collectors. |
| Planned · P2–P4 | Vietnamese news, evidence-linked AI analysis, then a gold dashboard and sourced events. These features are not implemented. |
| Planned · P5–P6 | Separately validated domestic-gold probability research, then a reproducible local v2; forecasts enter the app only after their research gate. Production/pilot has a separate gate. |

No live/intraday coverage is promised. The current app makes no forecasts. The expanded roadmap permits gated probability research for domestic gold, not LLM price predictions or trading advice. The project provides no investment advice, buy/sell recommendations or real-money trading. See the [current PRD](docs/PRD.md) and [expanded roadmap](docs/ROADMAP.md).

## Run the local demo

Install Docker Desktop with Compose v2, start its engine, and run from the cloned repository root. Host Node.js, Python, provider credentials and a seed account are not needed for this path. Docker must be able to download its images and build dependencies on the first run.

```powershell
docker compose --env-file .env.example up --build --detach --wait
```

Open [the local app](http://127.0.0.1:5173). Five services should be healthy (`docker compose --env-file .env.example ps`); [API readiness](http://127.0.0.1:3001/health/ready) returns `ready`. The committed example selects fixture defaults, empty ingestion secret and observed reads off. Existing shell variables override the env file; clear any inherited `INGESTION_SECRET`, `OBSERVED_READS_ENABLED` or port overrides when reproducing these defaults. If ports are occupied, use the [local guide's port settings](docs/LOCAL_DEVELOPMENT.md#ports-and-existing-local-settings).

Five-minute tour:

1. Search **FPT**, select the company and open **Xem chi tiết & biểu đồ ngày**. Inspect the three-point closing-price chart, OHLCV table, VND, UTC+7 and fixture/unknown freshness labels.
2. Open **Tổng quan** for VN-Index: 1,308 index points, currency not applicable, with its own source/as-of labels.
3. Open **Tài khoản → Đăng ký**. Choose your own local demo email/password (15–128 characters) and confirm the password. There are no bundled credentials; later visits use **Đăng nhập**.
4. Open **Theo dõi**, name your one private list, search FPT and select **Thêm FPT**. Reload to see the saved list and fixture price.
5. Log out through **Tài khoản**, then log in again to confirm the private list returns. Stop with `docker compose --env-file .env.example stop`; the startup command above resumes the same volumes. Keep the same project and ports. Account/list records survive restart; tab sessions expire after eight hours and closing the tab removes its local session handle.

The five-minute tour starts after the stack is ready; first build/download time depends on the machine and network. `down --volumes` removes account/watchlist storage, so it is not a routine restart command. [Full startup, recovery and optional observed-data prerequisites](docs/LOCAL_DEVELOPMENT.md) and [Gate 5 limits](docs/GATE_5_REVIEW.md) are available for review.

## Architecture

The implemented baseline uses one Node codebase with separate API and worker
processes. Dashed nodes are future features. The dated [architecture decision](docs/SYSTEM_ARCHITECTURE.md)
separates current behavior from proposed module, rights and recovery boundaries.

~~~mermaid
flowchart LR
  Web["React + Vite"] --> API["Express API<br/>fixture and opt-in stored reads"]
  Fixture["Packaged synthetic market fixture"] --> API
  API --> Mongo["MongoDB<br/>outbox, revisions, projections, accounts"]
  API --> Redis["Redis / BullMQ<br/>job transport"]
  Collector["Python collector<br/>explicit fixture / opt-in KBS"] -->|authenticated ingestion| API
  Redis --> Worker["Node worker<br/>same API codebase / image"]
  Worker -->|persist and reconcile outbox| Mongo
  Future["News / AI / events<br/>future gated phases"] -.-> API
~~~

Ingestion retains normalized deliveries separately from family records in ordinary
MongoDB collections, with durable acceptance, idempotent replay and worker
reconciliation. There is no implemented market cache or time-series projection.
The A4 v1.1 candidate separates strict `/health/ready` from fixture read routing
`/health/read-ready`. API startup can tolerate Redis loss after Mongo/index/fixture
initialization; [candidate checks and limits](docs/A4_IMPLEMENTATION_REPORT.md)
remain subject to review and merge. Market values retain provider,
currency/units, timezone, as-of and freshness; missing observations remain missing.
Future event pages describe **associated market movement**, never causation.

## Repository guide

| Document | What it covers |
|---|---|
| [Product requirements](docs/PRD.md) | Vietnamese scope, all FR-01–FR-18 statuses, acceptance boundaries and explicit omissions. |
| [Market-data contract](docs/DATA_CONTRACT.md) | Versioned canonical schema, synthetic fixture semantics, units, provenance and offline checks. |
| [Current roadmap](docs/ROADMAP.md) | Serial A1–A4 foundation, gated P1–P6 expansion and preserved three-week history. |
| [System architecture](docs/SYSTEM_ARCHITECTURE.md) | Implemented baseline, modular-monolith decision, proposed boundaries, dependencies and rollback. |
| [Provider research](docs/PROVIDER_RESEARCH.md) | MP-01 comparison and limited probe, owner’s Vnstock direction, unresolved live-source gate and MP-02 fixture decision. |
| [Vnstock adapter](docs/VNSTOCK_ADAPTER.md) | Optional local KBS candle adapter, v2 contract, bounded runtime evidence and next ingestion boundary. |
| [Gate 5 review](docs/GATE_5_REVIEW.md) | Exact baseline CI, fresh isolated startup, browser flow, restart persistence and remaining limits. |
| [Codex workflow](docs/CODEX_WORKFLOW.md) | Sequential planning, bounded implementation handoffs and independent review. |
| [Skills by FR](docs/SKILLS_BY_FR.md) | Installed local skills, guarded use, and optional future skills by requirement. |
| [CI/CD and documentation portal](docs/CI_CD.md) | Documentation checks, Pages deployment, and application lint, build, Compose and integration CI. |
| [Local development](docs/LOCAL_DEVELOPMENT.md) | Compose startup, host mode, fixture collector and local check commands. |
| [GitHub setup](docs/GITHUB_SETUP.md) | Repository checks, Pages setup and branch-protection guidance. |
| [Original project brief](MarketPulse_VN_Project_Documentation.md) | Full Vietnamese source requirements, preserved as supplied. |

The brief is the product context; the PRD and roadmap define the smaller demo boundary. See [the GitHub repository](https://github.com/Son2110/Market-Pulse).

## Data research

- [Vnstock](https://vnstocks.com/docs/vnstock) is the connector/integration direction selected on 2026-09-26. The optional KBS adapter, isolated revision/replay storage and opt-in FPT/VNINDEX views have bounded local evidence. FPT also has a collection-status card; receipt success does not prove freshness. Broader coverage, source as-of, freshness, equity adjustment and upstream public data-use rights remain unverified.
- [SSI FastConnect](https://developers.ssi.com.vn/docs/getting-started/overview) is historical MP-01 comparison evidence and a rejected project alternative: the owner considers its registration impractical for this project. It is not a current integration option or a universal technical/legal conclusion.
- [GDELT DOC API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) is a candidate for later news research; the project does not promise a particular archive or Vietnam coverage.
- MongoDB’s [time-series limitations](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-limitations/) inform the replay and uniqueness design.

The canonical market-data schema, public fixture-backed history route at `/api/assets/:symbol/history`, and synthetic-only fixture are described in the [data contract](docs/DATA_CONTRACT.md). The API also offers `/health/live`, `/health/ready` and the local auth routes described in the [local development guide](docs/LOCAL_DEVELOPMENT.md); the web root is the existing Vietnamese stock-search page. Frontend pages are created or adjusted using the existing app design, one page at a time, under the [Codex workflow](docs/CODEX_WORKFLOW.md). Run the local checks with:

```sh
python -m pip install -r requirements-dev.txt
python scripts/validate_market_data.py
python -m unittest discover -s tests -v
python -m unittest discover -s services/collector/tests -v
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

## Hosting direction

Development is local-first. Production is a later milestone with Vercel for the frontend, Render for API/background worker and scheduled collector services, and MongoDB Atlas for storage. A Redis-compatible queue service, network access, service limits, backup/restore and cost still require validation before provisioning. GitHub Pages is reserved for the documentation portal and is separate from the application frontend.

## Responsible use

MarketPulse VN is a portfolio and research project. It is not an investment adviser or broker. Data may be delayed, incomplete or subject to provider terms. Every future market view should show its source and as-of time; a visual relationship between an event and a price change does not establish causation.

No open-source license has been selected yet.

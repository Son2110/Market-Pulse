# System architecture — MarketPulse VN

**Decision date:** 18/10/2026 · **Scope:** A1 architecture decision, with A2, A3 and A4 implementation evidence below.
**Merged baseline:** [PR #38](https://github.com/Son2110/Market-Pulse/pull/38),
`main` at `eb3a6b2` (A3 family dispatch), following [PR #37](https://github.com/Son2110/Market-Pulse/pull/37) at `f51dbd3958dc0d4db6410d13c2a28085dcb02853` (A2 ingestion primitives, where
[Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/39106893071)
and [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/39106893021)
succeeded) and [PR #36](https://github.com/Son2110/Market-Pulse/pull/36) at `a7206fee2fcfb317c2ee44c6342d3359510eea9e`. These baseline runs do not validate the A4 working branch (`ci/dependency-health-recovery`).

This decision follows the [original brief](../MarketPulse_VN_Project_Documentation.md),
[current PRD](PRD.md), [data contract](DATA_CONTRACT.md), [ingestion contract](INGESTION.md)
and [gold design](GOLD_DATA_DESIGN_P1.md). It separates working code from proposed
boundaries. A2 implements the shared JSON primitive extraction and A3 implements
validated-family classification and dispatch described below; source approval
and deployment remain separate decisions.

**Independent review · 18/10/2026:** GPT-6 Astra approved A1 with no findings
after comparing the document with server/health, ingestion, auth, gold storage,
Compose and CI code. The reviewer independently reran the documentation link
check (186 local targets), portal build (24 documents) and `git diff --check`;
all passed. This is documentation review evidence, not a new runtime test run.
A1 is now merged with successful remote CI as recorded above.

### A2 implementation evidence · 18/10/2026

The branch `feat/fr-18-ingestion-foundation-1` moved the existing `Json`,
`ContractError`, `canonicalJson`, `digest` and `strictJson` implementations verbatim
to [platform/contracts/json.ts](../apps/api/src/platform/contracts/json.ts), whose
only import is Node crypto. `ingestion-contract.ts` imports and re-exports those
same bindings for compatibility. Gold contracts/read validation/storage and
ingestion/observed consumers import primitives directly; family-specific
validation, decimal/time rules, storage, queue dispatch and identities stay in
their existing modules. This removes the gold contract's dependency on the
ingestion domain module without introducing a family framework or A3 dispatch.

Before extraction, the worker captured literal payload digests for fixture v1,
observed v2 and gold v1, plus a queue ID and representative persisted identities
for all three families. The existing ingestion test file now asserts those fixed
values, binding/`ContractError` identity, depth boundaries, null-prototype own
`__proto__` keys and existing native `SyntaxError` behavior for malformed strings.
The existing Python golden and live Python/Node JCS parity checks remain intact.
Local verification passed lint/typecheck, 186 Node unit tests, 41 real MongoDB/Redis
integration tests, API/web build, 44 Python contract tests, 29 collector tests,
both fixture validators, Compose configuration, four browser harness tests and
two desktop/mobile core-flow journeys, with no skipped tests. Documentation checks
passed for 188 local targets, the 24-document portal build and diff whitespace.
Test services use isolated loopback ports 27019/6381; existing stacks were not
changed and random test databases were cleaned. The original brief remains
unchanged (SHA-256 `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`).
The full-suite results above are worker evidence. **Independent A2 review ·
18/10/2026:** GPT-6 Astra approved with no findings after inspecting all 13 changed
files, confirming newline-normalized implementation equality and no new dependency
cycles. The reviewer independently ran 13 focused tests, including the three new
tests; all passed. A2 is now merged via [PR #37](https://github.com/Son2110/Market-Pulse/pull/37)
with successful remote CI recorded above.

### A3 implementation evidence · 20/10/2026

The working branch `feat/fr-18-ingestion-foundation-2` introduces explicit internal
family classification and dispatch of validated legacy payloads without changing
accepted wire envelopes, RFC 8785 / SHA-256 digests, delivery IDs, deterministic
queue IDs (`jobId`) or BullMQ job names (`persist-fixture`, `persist-observed`,
`persist-gold`). `classifyPayload` in `ingestion-contract.ts` strictly validates
every payload through `validatePayload` first and returns a typed `ClassifiedPayload`
discriminated union (`fixture-market`, `observed-candle`, `synthetic-gold`); it never
infers family from `schemaVersion` alone and rejects injected `family` fields on
both the delivery envelope and inner payload.

`ingestion-store.ts` adds optional internal `family` metadata to `ingestion_deliveries`
(omitted from public/internal `receipt` responses), derives and verifies family,
provider, `schemaVersion`, dataset and digest on read via `classifyDelivery` so
legacy outbox rows without `family` remain supported without a database migration,
and dispatches persistence explicitly across `gold.persist`, `observed.persist`
and `persistFixture`. `ingestion-queue.ts` maps validated families to their existing
BullMQ job names via `queueJobName` and isolates corrupted or mismatched nonterminal
outbox rows during reconciliation by marking them terminal `failure` (`invalid_contract`)
so healthy deliveries continue. `ingestion-worker.ts` verifies `classifyDelivery` and
job-name compatibility before executing family persistence, treating contract or
job-name mismatches as permanent `invalid_contract` failures.

The earlier Gemini handoff reported 187 Node unit tests, 42 integration tests and
the supporting local checks; those are historical worker claims, separate from
the fresh verification below. Astra's initial review found that a new MongoDB
enum for optional `family` metadata prevented terminal failure updates to legacy
rows containing `family: "unknown"` or `family: null`, blocking reconciliation.
Sol reproduced MongoDB error 121 with a real-service regression, then removed
only that new enum restriction, retaining the pre-A3 strict core validator and
runtime `classifyDelivery` checks. Malformed metadata and raw payloads remain
available for diagnosis; no production validation bypass or data rewrite is used.
The regression places both malformed rows before a healthy delivery, verifies
terminal isolation and healthy completion, and confirms invalid core status
updates are still rejected. The existing all-family legacy and job-mismatch
regressions remain in place.

**Fresh Sol verification · 20/10/2026:** lint/typecheck, 187 Node unit tests,
43 real MongoDB/Redis integration tests, API/web build, 44 Python contract tests,
29 collector tests, both fixture validators, Compose configuration, four browser
harness tests and two desktop/mobile core-flow journeys passed with no skipped
tests. Isolated test services use loopback
ports 27019/6381 and remain available for independent review; test databases are
cleaned by the suites. The original brief remains unchanged (SHA-256
`21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`).
**Independent A3 review · 20/10/2026:** GPT-6 Astra approved the corrected
implementation with no remaining findings. The reviewer independently passed
two focused real MongoDB/Redis tests covering malformed-family isolation, strict
core validation, all three legacy families, pre-queued jobs and job-name mismatch,
plus `git diff --check`. The full-suite results above remain Sol worker evidence.
**Remote CI attempt · 20/10/2026:** [Application CI run 39395657217](https://github.com/Son2110/Market-Pulse/actions/runs/39395657217)
on `222daa9` failed during Compose startup, before application smoke/integration
checks: MongoDB reported fatal error 12257600, identifying a Linux kernel 6.19+
incompatibility. The `ubuntu-24.04` retry, [run 39432136010](https://github.com/Son2110/Market-Pulse/actions/runs/39432136010)
on `c1473be`, failed with the same kernel incompatibility. The application job is
temporarily pinned to `ubuntu-22.04`: the [official runner image manifest](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2204-Readme.md)
for image `20261012.322.1` records kernel `6.8.0-1064-azure`. An early step prints
the actual kernel and rejects unparseable versions or kernel 6.19+, including
later major versions, before dependencies are installed. The label is a temporary
workaround, not a guarantee of the kernel on future runner images; migrate after
MongoDB compatibility is verified and before this runner retires. MongoDB images,
required checks and startup behavior are unchanged. Retry and remote acceptance
of A3 remain pending at that historical note; A3 was subsequently merged via [PR #38](https://github.com/Son2110/Market-Pulse/pull/38) at `eb3a6b2`.

### Candidate A4 v1.1 · 22/10/2026

[Requirements](MarketPulse_A4_Architecture_Requirements.md) and [current evidence](A4_IMPLEMENTATION_REPORT.md)
separate this candidate from Anti history. Platform health/dependencies/recovery now own
pure policy, bounded probes/state and reconnect/reconcile; existing helper is a compatibility seam.
API tolerates cold Redis loss after Mongo/init; `/health/read-ready` is fixture routing,
`/health/capabilities` distinguishes disabled/unavailable and worker unknown. Compose API
uses read health and has no Redis startup dependency. Full readiness remains strict.
Redis health recovery and the optional producer start after required Mongo/index/catalog
initialization, preventing missing Redis DNS from blocking Mongo startup. The actual
Compose cold/runtime Redis-loss regression verifies read routing, unchanged API PID,
durable outbox recovery and collector replay; the report records current check results.
Checks/review/CI/merge are separate; A4 is not DONE. Domain moves/cycles stay deferred.

### Historical Anti A4 implementation before v1.1 · 21/10/2026

The cold-start/routing details and dated evidence below describe the pre-v1.1 candidate;
use the current report above for v1.1 verification.

The branch `ci/dependency-health-recovery` (baseline `eb3a6b2`) implements deliberate
dependency health, additive capability readiness probes, bounded timeouts/concurrency,
and post-startup Redis and MongoDB outage survival and automatic recovery on the
same API and worker processes. See [A4_IMPLEMENTATION_REPORT.md](A4_IMPLEMENTATION_REPORT.md)
for full runtime and outage evidence.

- **Cold-start vs post-startup lifecycle (`stores.ts`, `server.ts`, `worker.ts`):**
  Cold start remains fail-closed with bounded retry (`connectWithRetry`, default
  5 attempts, 500 ms delay); if MongoDB, Redis, or required store/index/catalog
  initialization fails during startup, the process exits `1` via bounded shutdown.
  Once Redis emits its initial `ready` event on the API health client, `stores.ts`
  switches from fail-closed startup to bounded automatic reconnect (`computeReconnectDelayMs`,
  linear step `100ms, 200ms, 300ms, ..., 1000ms` cap) with `disableOfflineQueue: true`,
  and `server.ts` logs `dependency_error` / `dependency_disconnected` / `dependency_recovered`
  instead of calling `shutdown("redis_error", 1)`. Both the API producer queue and the
  worker producer queue created via `createIngestionQueue` in `ingestion-queue.ts`
  default to `producer = true` (`disableOfflineQueue: true` + bounded linear reconnect
  `100ms..1000ms`), while BullMQ job retries retain exponential backoff from `250ms`
  across `MAX_ATTEMPTS = 3`.
- **Bounded probes, settlement-held slots and capability readiness (`dependency-lifecycle.ts`, `health.ts`, `worker.ts`):**
  All health probes use `createBoundedProbe` (`timeoutMs = config.dependencyTimeoutMs`
  default `1000ms`, `maxInFlight = 4`) and `withinTimeout` / `trackOperation` (which
  track root and nested operations via `AsyncLocalStorage`, attach no-op rejection
  handlers, and clear timers in `finally` so late rejections never escape as
  `unhandledRejection`). A probe timeout returns `false` (`503`) to the HTTP caller
  at `timeoutMs` and marks the execution context timed out, but **retains the
  concurrency slot until the underlying operation and all tracked child operations
  actually settle**, and ignores any late resolve/reject after timeout so a late
  `true` cannot flip readiness. All health endpoints send `Cache-Control: no-store`
  and sanitized JSON bodies:
  - `GET /health/live` -> `200 {"status":"alive"}` (process/HTTP liveness only).
  - `GET /health/ready` -> `200 {"status":"ready"}` or `503 {"status":"not_ready"}`
    (requires live MongoDB + live Redis + all initialized stores, plus `IngestionStore`
    when `INGESTION_SECRET` is configured; Redis is never removed from full readiness).
  - `GET /health/ready/fixture` -> `200`/`503` (requires initialized packaged fixture
    market provider and 10-equity search catalog; independent of MongoDB and Redis).
  - `GET /health/ready/mongo` -> `200`/`503` (requires initialized auth, watchlists,
    and fixture catalog plus live MongoDB ping; independent of Redis).
  - `GET /health/ready/ingestion` -> `200`/`503` (requires configured `INGESTION_SECRET`,
    initialized `IngestionStore`, and live MongoDB ping; returns `503` when disabled,
    uninitialized, shutting down, or MongoDB is unavailable; independent of Redis).
  - Worker loopback (`http://127.0.0.1:3002/health/live` -> `200 {"status":"alive"}`,
    `GET /` and `GET /health/ready` via `createWorkerHealthHandler` ->
    `200 {"status":"ready"}` or `503 {"status":"not_ready"}`) requires initialized
    `IngestionStore`, running BullMQ worker, live MongoDB ping, live worker and
    producer Redis pings tracked under a single bounded probe timeout (`1000ms`),
    and recent non-stale reconciliation within `reconcileIntervalMs * 3`.
- **MongoDB outage gating and live request recovery (`server.ts`, `health.ts`, `ingestion-api.ts`):**
  Auth and watchlist readiness combine initialization state with `stores.tracker.isMongoHealthy()`,
  and `beforeMongoRoute` re-probes MongoDB when marked unhealthy so that as soon as
  MongoDB returns on the same PID, both `GET /health/ready/mongo` and real auth/watchlist
  requests recover automatically without a process restart. Live MongoDB connectivity/topology
  errors caught during a request return sanitized `503` (`{"error":"not_ready"}` on
  auth/watchlists, `{"error":"observed_history_unavailable"}` / `{"error":"observed_collection_status_unavailable"}`
  on observed reads, `{"error":"gold_latest_unavailable"}` / `{"error":"gold_history_unavailable"}`
  on gold reads, and `{"error":"ingestion_unavailable"}` on internal ingestion),
  preserving auth validation and rate-limit semantics.
- **Durable outbox and non-overlapping reconciliation (`ingestion-api.ts`, `ingestion-worker.ts`):**
  `POST /internal/ingestion/deliveries` preserves durable MongoDB `w:1,j:true` acceptance
  before returning `202`. When Redis is down, `boundedEnqueue` (`1500ms`) fails fast and
  defers the durably accepted delivery to the MongoDB outbox. When Redis is restored on
  the same API and worker PIDs, `createReconciliationCoordinator` (`reconcileTimeoutMs = Math.max(intervalMs * 2, 2000)`,
  default `10000ms` for `intervalMs = 5000ms`) holds its single-flight mutex until the
  underlying `runReconcile()` and all tracked child operations actually settle (never
  overlapping across timeout cycles and ignoring late completion after timeout), and
  re-enqueues and persists all three validated families (`fixture-market`,
  `observed-candle`, `synthetic-gold`) while preserving `MAX_ATTEMPTS = 3`, terminal
  failure codes (`invalid_contract`, `attempts_exhausted`, `queue_attempts_exhausted`,
  `persistence_unavailable`), digest conflict `409 {"error":"delivery_identity_conflict"}`,
  canonical digests, and revision/projection ordering.
- **Routing boundary:** `compose.yaml` retains `GET /health/ready` as the default API
  container healthcheck and real Vite (`apps/web/vite.config.ts`) proxies only `/api`
  (returning the SPA HTML shell on `/health/*`), so local direct HTTP and real Vite
  `/api` proxy survival during Redis outage do not claim external production load-balancer
  routing availability.

## Decision and constraints

Keep a **modular monolith**: one Node API/worker codebase, built from `apps/api`,
with separate HTTP API and BullMQ worker processes. Keep Python for bounded
provider collection and later offline forecast research. React calls the API;
it never calls Python, a data provider or an AI provider directly. MongoDB owns
durable delivery and domain records; Redis transports jobs. No market cache,
time-series projection, microservice split or general plugin framework is needed
for this foundation.

Modules will be extracted incrementally where a concrete task needs a boundary.
Keep existing route shapes, defaults, collection identities, hashes, decimal
precision, timestamp semantics, replay and E2E behavior. A1 creates no runtime
directory structure or new collection. The [roadmap](ROADMAP.md) sequences A2,
A3, P2.1 research and A4 before news ingestion or automated collection.

## Implemented baseline

```mermaid
flowchart LR
  Web["React / Vite\nfixture and opt-in stored views"] --> API["Express API\nserver.ts"]
  Fixture["Packaged synthetic market fixture"] --> API
  Python["Python collector\nexplicit fixture submit / opt-in KBS"] -->|authenticated delivery| API
  API -->|durable receipt / account / stored reads| Mongo["MongoDB\nordinary collections"]
  API -->|enqueue ID + digest| Redis["Redis / BullMQ\njob transport"]
  Redis --> Worker["Node worker\nworker.ts, same API image"]
  Worker -->|reconcile nonterminal outbox| Mongo
  Worker -->|revisions and projections| Mongo
```

| Area | Code and ownership today | Important limit |
|---|---|---|
| Composition | `apps/api/src/server.ts`, `health.ts`, `stores.ts`, `dependency-lifecycle.ts`, `config.ts`; `worker.ts` composes the separate process | Cold start requires both MongoDB and Redis; post-startup Redis loss keeps the API process alive, lowers full readiness (`GET /health/ready` -> 503), preserves fixture/Mongo capability probes and reads, and auto-reconnects with bounded backoff. |
| Accounts / watchlist | `auth.ts`, `watchlists.ts`; MongoDB `users`, `sessions`, `watchlists` | Auth rate limiting and KDF concurrency guards are in process, **not Redis-backed**. Sessions and ownership are Mongo-backed; this is the bounded local auth slice. |
| Fixture market reads | `fixture-market-data-provider.ts`, `stock-search.ts`, `daily-history.ts` | Search/history/default web views read the packaged fixture, not ingestion collections. |
| Ingestion contracts | `ingestion-contract.ts`, `gold-contract.ts`, `packages/schemas`; shared JSON primitives in `platform/contracts/json.ts`; validated-family classifier in `ingestion-contract.ts` on A3; Python validators and shared parity corpora | Strict fixture v1, observed candle v2 and synthetic gold v1 are different payload families; version alone cannot distinguish both v1 families, and wire discriminators are rejected. |
| Delivery lifecycle | `ingestion-api.ts`, `ingestion-store.ts`, `ingestion-queue.ts`, `ingestion-worker.ts` | Authenticated HTTP, Mongo outbox with derived legacy family support, bounded enqueue, reconciliation, attempts and receipt statuses already exist. |
| Family persistence | `IngestionStore` dispatches validated families to `ObservedStore`, `GoldStore` and `persistFixture` | Ordinary collections with unique identities; no MongoDB time-series collection or multi-document batch transaction. |
| Stored queries | `observed-history.ts`, collection-status contract, `gold-read.ts` and their services/contracts | Observed and gold flags default false. Gold P1.4 is API-only and synthetic-only. Reads do not repair projections, fetch providers or fall back to fixture. |
| Python / browser | `services/collector/collector`, `apps/web/src`, `tests/e2e` | Fixture validation/submission and bounded opt-in KBS collection exist. No automated gold/news collector, news/AI/forecast pipeline or gold UI exists. |

Compose runs MongoDB, Redis, API, worker and web; the collector is an explicit
profile command. API and worker use the same Dockerfile/build and separate entry
points; there is no implemented `apps/worker` service tree. Redis has AOF enabled
locally. This does not replace MongoDB as the ingestion authority or demonstrate
production durability, backup/restore or routing behavior.

### Existing data and completion semantics

1. The collector constructs the unchanged `{deliveryId, payloadDigest, payload}`
   envelope. The internal API authenticates, strictly parses/validates and verifies
   the RFC 8785 / SHA-256 payload digest before accepting it.
2. `ingestion_deliveries` stores the complete **normalized payload**, not provider
   wire bytes. An acknowledged Mongo insert with `w:1,j:true` precedes HTTP 202.
   Same delivery ID/digest returns its receipt; changed digest for that ID is 409.
   Mongo acceptance failure is 503. No successful acceptance response may precede
   durable Mongo acceptance.
3. Enqueue is bounded to 1.5 seconds. A failed/timed-out enqueue leaves the durable
   delivery for recovery. Jobs contain ID/digest; deterministic queue identity is
   secondary to Mongo receipt state. The worker scans up to 100 oldest nonterminal
   receipts at startup and every five seconds, within the existing three-attempt
   budget. Failure/exhaustion is terminal; recovery must not silently reset it.
4. The worker confirms family persistence before recording terminal `success`.
   HTTP 202 alone is not processing success; neither receipt success nor successful
   polling establishes source freshness, complete coverage or source rights.
   Document writes are atomic individually; partial rows can remain after failure.

| Family | Durable records | Ordering and replay to preserve |
|---|---|---|
| Synthetic market v1 | `canonical_assets`, `canonical_observations` | Immutable identity/content; exact replay is a no-op, conflicting content at the same identity fails without replacement. |
| Observed candle v2 | `observed_assets`, `observed_candle_revisions`, `observed_candles_latest` | Revision content is immutable; latest maximizes exact UTC microsecond collection time then digest. Original offset/string remains available; collection order does not prove market chronology. |
| Synthetic gold v1 | `gold_assets`, `gold_quote_revisions`, `gold_quote_snapshots`, `gold_quotes_latest` | Preserve complete first revision. Snapshot maximizes `(collectedOrder, contentDigest)`; asset latest maximizes `(sourceVerified, sourceOrder, collectedOrder, contentDigest)`. Reused A in A→B→A still advances/repairs both projections while retaining two revisions. |

Observed and gold store monetary values as canonical decimal strings; gold
timestamps preserve six UTC fractional digits, observed ordering preserves exact
UTC microseconds while retaining the original timestamp. Do not replace these
with floating-point money or millisecond-only `Date` ordering. Revision and
projection writes remain separate: history/latest can diverge until replay,
and stored reads can include rows from incomplete/failed deliveries. No read
claims an atomic batch, freshness or completeness from projection presence.

## Proposed module boundaries — not implemented directories

The following is a target dependency shape, not a mandatory folder migration.
`modules/<name>` under `apps/api/src` is an illustrative future location; use an
incremental extraction only when an approved task needs it. Existing files can
serve these boundaries until then. Do not relocate all files or add a generic
handler framework during A2/A3.

```mermaid
flowchart TD
  API["API composition / HTTP"] --> Query["Market, gold, news queries"]
  API --> Identity["Identity / watchlists"]
  API --> Ingest["Delivery acceptance"]
  Worker["Worker composition"] --> Dispatch["Validated-family dispatch"]
  Ingest --> Contracts["Contracts / family classification"]
  Dispatch --> Contracts
  Dispatch --> Domain["Family persistence\nfixture / observed / gold / future news"]
  Query --> Domain
  Ingest --> Lifecycle["Delivery repository / queue port"]
  Dispatch --> Lifecycle
  Lifecycle --> Infra["Mongo / BullMQ adapters"]
  Domain --> Infra
  Policy["Future source policy"] -.-> Ingest
  Policy -.-> AI["Future AI analysis jobs"]
  AI -.-> Domain
```

| Boundary | Owns | Allowed dependencies / exclusions |
|---|---|---|
| Composition (`server.ts`, `worker.ts`) | Config, concrete adapters, startup/shutdown, health wiring | Wires modules; domain code does not import entry points or start listeners. |
| Contract / family classification | Strict validation and a typed family result | Pure schema/identity/decimal/time primitives; no Express, queue, DB or provider calls. |
| Delivery lifecycle | Accept/idempotency/conflict, receipt state, attempts, reconciliation | Delivery repository and queue adapter ports; no news/gold economic rules. |
| Market / gold / future news domains | Family identity, revisions, ordering, projections and bounded query services | Contracts and own persistence adapters; no HTTP response objects or collector execution. Family rules stay explicit. |
| Identity / watchlists | Session authentication, account records and owner-scoped lists | Mongo repository and fixture query capability as today; no ingestion credentials or background AI dependency. |
| Source policy (future P2) | Purpose-specific rights decisions and provenance of evidence | Queried at collection/storage/redisplay/AI/training boundaries; cannot grant rights merely because a URL or feed is public. |
| AI analysis (future P3) | Bounded analysis jobs, evidence links, versions, budget, abstention | Approved content revisions and source policy; no direct market-price arithmetic or synchronous model call in public GET handlers. |
| Forecast research (future P5) | Offline dataset manifest, training/evaluation and go/no-go artifact | Approved snapshots/revisions and point-in-time evidence; no live DB writes or training inside HTTP requests. |

### Dependency and failure matrix

This table identifies the dependency a capability actually uses and the future
failure boundary to validate; it does not change today's all-dependency gate.

| Capability | Direct work dependencies | Pre-A4 baseline constraint | Implemented A4 behavior (`ci/dependency-health-recovery`) |
|---|---|---|---|
| Fixture search/history (`/health/ready/fixture`) | Initialized packaged fixture/catalog | API startup/full readiness requires Mongo + Redis | Survives post-startup Redis and MongoDB outages on the same API process; direct HTTP and local Vite `/api` proxy verified. |
| Account/session/watchlist (`/health/ready/mongo`) | Mongo; initialized market provider for list presentation; in-process auth guards | Same API lifecycle | Survives post-startup Redis outage; fails closed (`503`) during MongoDB outage and automatically recovers on the same PID when MongoDB returns. |
| Stored observed/gold reads (`/health/ready/mongo`) | Mongo, enabled flag and initialized API | Same API lifecycle; no queue call in the read service | Survives post-startup Redis outage via direct HTTP and Vite `/api` proxy; fails closed (`503`) during MongoDB outage and recovers automatically on MongoDB restore. |
| Internal delivery acceptance/poll (`/health/ready/ingestion`) | Mongo; configured secret and initialized delivery store; bounded queue enqueue | Pre-A4 Redis failure stopped the API process | Preserves durable MongoDB accept-before-202 during Redis outage, defers failed/timed-out enqueue to outbox, and rejects with `503` (no false `202`) when MongoDB is down. |
| Worker persistence/recovery (`127.0.0.1:3002`) | Mongo + Redis/BullMQ, initialized stores, running worker, recent non-stale reconciliation | Worker has separate loopback readiness | Reports `503` on Mongo/Redis loss or stale/failed reconciliation; automatically reconnects and reconciles deferred `fixture-market`, `observed-candle`, and `synthetic-gold` outbox rows within `MAX_ATTEMPTS=3`. |
| Future collection / AI / forecasts | Approved source access, network/model budget or eligible dataset as appropriate | Not implemented | Isolate failures from public read handlers; each task supplies its own evidence and gate. |

`GET /health/live` currently reports process/HTTP liveness without probing stores.
`GET /health/ready` currently probes Mongo and Redis plus application initialization;
the worker has its own loopback readiness listener on port 3002. Keep full readiness
as **all enabled required dependencies and initialization**, distinct from liveness.
A4 will define capability-specific readiness for reads, ingestion and worker work,
with sanitized dependency status and tests for startup, loss and restoration.
It must also change the current Redis shutdown/reconnect behavior if degraded
reads are to survive. Do not merely remove a readiness check.

Compose currently uses full API readiness; a deployment/load balancer using that
same probe may remove the entire instance during Redis loss. Capability readiness
does not by itself make degraded reads reachable. Validate deployment routing or
a separate read-serving arrangement before claiming external availability. No
production load-balancer behavior has been demonstrated by A1.

## Future source, news, AI and forecast flow

```mermaid
flowchart LR
  Rights["P2 purpose-specific rights decision"] -.-> Collector["Approved collector / curated link input"]
  Collector -.-> Accept["Strict internal acceptance + Mongo outbox"]
  Accept -.-> Jobs["Worker family dispatch"]
  Jobs -.-> News["News identity / immutable revisions / current view"]
  News -.-> Read["Bounded API queries + existing React design"]
  News -.-> AI["P3 permitted-content AI jobs"]
  AI -.-> Review["Evidence-linked result / reviewed event"]
  Review -.-> Read
  Dataset["P5 cutoff + revision manifest"] -.-> Research["Offline Python evaluation / shadow report"]
  News -.-> Dataset
  Gold["Eligible gold history"] -.-> Dataset
```

Dashed edges are proposed. P2.1 will define a small source-rights registry design,
not a generic permissions platform or implemented collection. Record access,
storage, public redisplay, AI input and model training **separately**, with source,
scope, evidence/date, limits, expiry/recheck and decision owner. `unknown` stays
closed for that purpose; permission for metadata is not permission for full text,
AI or training. Resolve retention/deletion obligations per right and data class
before collecting; today's absence of TTL on synthetic raw/revisions is not a
promise to keep licensed content or full text forever. Retain audit identifiers
or evidence only within the applicable permission. Source-specific gates can
remain stricter; the gold live-source gate remains closed.

P2 news will separate canonical article identity from content revisions and
collection times; canonical URL/publisher, published/updated/collected timestamps,
language and provenance remain explicit. P2.1 must settle permitted fields and
dedup/revision policy before P2.2 ingestion; no full-text fetch is implied by RSS.
P2.3 adds bounded query/UI states using the existing app design. Cross-family
delivery lifecycle may be reused, but economic/article identity rules stay local.

P3 runs permitted-content AI work asynchronously with model/prompt/input-revision
versions, citations, budget, timeout and deterministic fallback to source links.
Treat source text as untrusted data. Prices/spreads/returns come from code; facts,
computed measurements and interpretation remain distinguishable. Proposed events
need human review; unsupported claims abstain. The PRD held-out evaluation gate
must pass before exposing the corresponding analysis. No LLM price oracle or
investment recommendation is authorized.

P5 is offline research first. Its dataset manifest must freeze source rights,
series/target/horizon/threshold, timezone and cutoff, extraction/version, exact
input revision/delivery identities and hashes, availability times and split dates.
Select only data known by each cutoff, including news publication/collection,
gold corrections and macro vintages; a later winning revision cannot silently
rewrite an earlier training example. Keep immutable eligible dataset artifacts
under a rights-aware retention policy. Baseline, walk-forward, untouched holdout,
calibration and matured-target shadow results produce a versioned go/no-go report.
Do not add online model serving or forecast storage in A1–A4; only a future gated
task may publish a validated report/probability artifact to the app.

## Compatibility, rollout and rollback

| Serial task | Bounded change | Acceptance and rollback boundary |
|---|---|---|
| A1 · architecture decision | Documentation and portal navigation | Local link/build checks passed; independent GPT-6 Astra review approved with no findings. Merged baseline CI passed as linked above. No runtime behavior changed. |
| A2 · ingestion primitives | Shared JSON primitives extracted; domain rules remain local | Existing Node/Python parity, identities/hashes, decimals/microseconds and ingestion tests remain authoritative; local checks, independent GPT-6 Astra review and merged baseline CI passed as recorded above. Revert extraction if parity changes; no bulk migration. |
| A3 · family dispatch | Explicit internal classification/dispatch of **validated legacy payloads** on the working branch | Preserves all three existing envelopes, digests, delivery IDs, queue IDs and BullMQ job names; tests verify replay/recovery, legacy nonterminal outbox rows without `family`, and invalid-contract isolation. Local checks passed and independent GPT-6 Astra review approved on 20/10/2026 as recorded above; remote CI pending. Revert code without data rewrite. |
| P2.1 · source research | Decide allowed news fields, purpose-specific rights and retention | Research only; no new collector or automatic jobs. |
| A4 · dependency health/recovery | Implemented on `ci/dependency-health-recovery`: post-startup Redis survival + bounded reconnect, capability probes (`/health/ready/fixture`, `/health/ready/mongo`, `/health/ready/ingestion`), worker probe/reconcile guards, and isolated container outage/recovery tests | Verified locally across 193 unit tests, 51 integration tests (including 7 real-process isolated container outage/recovery scenarios), Compose smoke/replay and E2E; independent Codex review and remote CI pending. Roll back to prior API/worker pair if regression; no data migration. |

The classifier inspects a payload only after its existing strict validation,
yielding an internal family (`fixture-market`, `observed-candle` or
`synthetic-gold`). It is not a new wire discriminator. Do not infer family from
`schemaVersion` alone, change accepted JSON to inject a field, or alter the bytes
that participate in any digest/identity. Derive classification for legacy outbox
rows on read; optional internal `family` metadata is additive and its absence is
tolerated. No bulk database migration is required for A2/A3.

Keep queue payload/name/job identities compatible with jobs already waiting or
retrying. Keep projection ownership and per-document ordering unchanged across
API/worker versions. Release/revert a compatible API/worker pair; validate a new
family before allowing it to submit work an older worker cannot understand.
Never clear receipts, revisions or queues as a routine rollback. A future storage
change needs its own compatibility and recovery plan, with backup/restore evidence.

Run applicable existing checks for each runtime task: Node lint/typecheck/unit,
real MongoDB/Redis integration, Python contracts/collector checks, fixture
validators, build/Compose smoke and committed Playwright core journeys as required
by Application CI. Do not invent a runtime acceptance result for this docs task.

## ADR-001 — why this foundation

**Accepted decision, 18/10/2026:** incremental modular monolith, two Node process
roles and specialist Python commands/offline research. A single developer and
serial workflow benefit from one contract and deployment lineage; existing
outbox and family stores already provide the key ingestion seam. Separate worker
execution keeps background work out of request handling without requiring network
contracts between every domain.

**Tradeoffs:** shared release/DB still couples domains; API startup currently
over-couples read availability to Redis; classification and persistence branches
can grow. Explicit module ownership, A2/A3 extraction and A4 failure tests address
those concrete problems. In-process auth limits also do not provide a global
limit across future API replicas; scaling requires a separate reviewed decision.

**Alternatives deferred:** microservices add deployment, distributed tracing and
contract overhead before independent scaling/ownership evidence; a generic
ingestion framework hides family-specific revision rules; a mass folder move adds
review/rollback risk without capability; a new time-series projection/cache needs
measured query demand plus rebuild/invalidation evidence. Revisit these decisions
when measured workload, operational ownership or isolation requirements justify
them, rather than treating the original conceptual diagram as implemented code.

**Open decisions:** source rights/retention in P2.1 and the gold gate, concrete A4
readiness/routing contract, news identity/revision semantics, AI provider/budget,
forecast-eligible history and production backup/network/cost. None is silently
resolved by this architecture document.

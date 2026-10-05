import { createServer } from "node:http";
import { readConfig } from "./config.js";
import { createStores } from "./stores.js";
import { IngestionStore } from "./ingestion-store.js";
import { startIngestionWorker } from "./ingestion-worker.js";

const config = readConfig();
const stores = createStores(config);
let runtime: Awaited<ReturnType<typeof startIngestionWorker>> | undefined;
let shuttingDown = false;
const health = createServer(async (_request, response) => {
  const ready = await runtime?.ready() ?? false;
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" }); response.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
});
health.listen(3002, "127.0.0.1");
const startup = (async () => { await stores.mongo.connect(); runtime = await startIngestionWorker(new IngestionStore(stores.mongo.db()), config.redisUrl); console.info(JSON.stringify({ event: "ingestion_worker_initialized" })); })();
void startup.catch(() => { console.warn(JSON.stringify({ event: "ingestion_worker_startup_failed" })); void shutdown(1); });
async function shutdown(code = 0) {
  if (shuttingDown) return; shuttingDown = true;
  const force = setTimeout(() => process.exit(code || 1), 5000);
  health.close();
  await startup.catch(() => undefined);
  await runtime?.close(); await stores.mongo.close(); clearTimeout(force); process.exitCode = code;
}
process.on("SIGTERM", () => { void shutdown(); }); process.on("SIGINT", () => { void shutdown(); });

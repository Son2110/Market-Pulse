import { MongoClient } from "mongodb";
import { IngestionStore } from "../src/ingestion-store.js";
import { startIngestionWorker } from "../src/ingestion-worker.js";

const [mongoUrl, database, redisUrl, name, boundary] = process.argv.slice(2);
if (!mongoUrl || !database || !redisUrl || !name) throw new Error("Missing test harness arguments");
const client = new MongoClient(mongoUrl);
await client.connect();
const pause = async (stage: string) => { process.send?.({ stage }); await new Promise<void>(() => undefined); };
const runtime = await startIngestionWorker(new IngestionStore(client.db(database)), redisUrl, {
  name, reconcileMs: 250, lockDuration: 1000, stalledInterval: 1000,
  hooks: boundary === "success" ? { beforeComplete: async () => pause("success") } : { afterWrite: async count => { if (count === 12) await pause("write"); } },
});
process.send?.({ stage: "ready" });
process.on("SIGTERM", () => { void runtime.close().then(() => client.close()).then(() => process.exit(0)); });

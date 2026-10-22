import { timingSafeEqual } from "node:crypto";
import express from "express";
import { isMongoDependencyError } from "./platform/dependencies/dependency-status.js";
import { withinTimeout } from "./platform/health/dependency-probes.js";
import { classifyPayload } from "./ingestion-contract.js";
import { ContractError, digest, strictJson } from "./platform/contracts/json.js";
import { DeliveryConflict, IngestionStore, receipt } from "./ingestion-store.js";

export function createBoundedEnqueue(enqueue: (id: string, digest: string, signal: AbortSignal) => Promise<void>, timeoutMs = 1500, maxInFlight = 4) {
  let active = 0;
  return async (id: string, digest: string) => {
    if (active >= maxInFlight) throw new Error("enqueue_capacity");
    active += 1;
    const controller = new AbortController();
    const operation = Promise.resolve().then(() => enqueue(id, digest, controller.signal)).finally(() => { active -= 1; });
    try { await withinTimeout(() => operation, timeoutMs, "enqueue_timeout"); }
    finally { controller.abort(); }
  };
}

export function createIngestionApi({
  store,
  secret,
  isReady,
  enqueue,
  enqueueTimeoutMs = 1500,
  onMongoResult,
}: {
  store: IngestionStore;
  secret?: string;
  isReady: () => boolean;
  enqueue: (id: string, digest: string, signal: AbortSignal) => Promise<void>;
  enqueueTimeoutMs?: number;
  onMongoResult?: (ready: boolean) => void;
}) {
  const router = express.Router();
  const boundedEnqueue = createBoundedEnqueue(enqueue, enqueueTimeoutMs);
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use((request, response, next) => {
    if (!secret) { response.status(503).json({ error: "ingestion_disabled" }); return; }
    const supplied = request.headers.authorization;
    const expected = `Bearer ${secret}`;
    if (typeof supplied !== "string" || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) { response.status(401).json({ error: "unauthorized" }); return; }
    if (!isReady()) { response.status(503).json({ error: "ingestion_unavailable" }); return; }
    next();
  });
  router.get("/deliveries/:id", async (request, response) => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(request.params.id)) { response.status(400).json({ error: "invalid_delivery_id" }); return; }
    try {
      const delivery = await store.deliveries.findOne({ _id: request.params.id });
      onMongoResult?.(true);
      response.status(delivery ? 200 : 404).json(delivery ? receipt(delivery) : { error: "not_found" });
    } catch (error) {
      if (isMongoDependencyError(error)) onMongoResult?.(false);
      response.status(503).json({ error: "ingestion_unavailable" });
    }
  });
  router.post("/deliveries", (request, response, next) => {
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "") || (request.headers["content-encoding"] && request.headers["content-encoding"] !== "identity")) { response.status(415).json({ error: "unsupported_media_type" }); return; }
    next();
  }, express.raw({ type: () => true, limit: "1mb", inflate: false }), async (request, response) => {
    try {
      const bytes: unknown = request.body;
      if (!Buffer.isBuffer(bytes)) throw new ContractError();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const envelope = strictJson(text);
      if (!envelope || Array.isArray(envelope) || typeof envelope !== "object" || Object.keys(envelope).sort().join(",") !== "deliveryId,payload,payloadDigest") throw new ContractError();
      const { deliveryId, payloadDigest, payload } = envelope;
      if (typeof deliveryId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(deliveryId) || typeof payloadDigest !== "string" || !/^[a-f0-9]{64}$/.test(payloadDigest) || payload === undefined) throw new ContractError();
      const classified = classifyPayload(payload);
      if (digest(payload) !== payloadDigest) throw new ContractError();
      const delivery = await store.accept(deliveryId, payloadDigest, classified.payload);
      onMongoResult?.(true);
      console.info(JSON.stringify({ event: "ingestion_receipt", deliveryId, provider: delivery.provider, status: delivery.status, attempt: delivery.attempts, counts: delivery.counts }));
      if (["accepted", "queued", "running"].includes(delivery.status)) {
        try {
          await boundedEnqueue(deliveryId, payloadDigest);
        } catch {
          console.warn(JSON.stringify({ event: "ingestion_enqueue_deferred", deliveryId, provider: delivery.provider, status: delivery.status }));
          console.warn(JSON.stringify({ event: "queue_dispatch_deferred", role: "api", service: "redis", deliveryId }));
        }
      }
      const current = await store.deliveries.findOne({ _id: deliveryId }).catch(() => null);
      response.status(202).json(receipt(current ?? delivery));
    } catch (error) {
      if (error instanceof DeliveryConflict) { response.status(409).json({ error: "delivery_identity_conflict" }); return; }
      if (error instanceof ContractError || error instanceof SyntaxError || error instanceof TypeError) { response.status(400).json({ error: "invalid_contract" }); return; }
      if (isMongoDependencyError(error)) onMongoResult?.(false);
      response.status(503).json({ error: "ingestion_unavailable" });
    }
  });
  return router;
}

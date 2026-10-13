import { collectedOrder } from "./ingestion-contract.js";
import { observedAssetProjection, type ObservedHistoryResponse } from "./observed-history-contract.js";

const statuses = ["accepted", "queued", "running", "success", "failure", "unknown"] as const;
type Status = typeof statuses[number];
export interface ObservedCollectionStatusResponse {
  data: {
    dataset: ObservedHistoryResponse["data"]["dataset"];
    asset: ObservedHistoryResponse["data"]["asset"];
  };
  meta: Omit<ObservedHistoryResponse["meta"], "status"> & {
    status: "available" | "no_stored_bars";
    freshness: "unknown"; sessionCalendar: "unverified";
    selectedCandleCount: number; collectedAtRange: { from: string; to: string } | null;
    candleCountsByDeliveryStatus: Record<Status, number>;
    statusSemantics: "referenced_delivery_status_at_read_time";
    consistency: "non_atomic_read";
  };
}

export const observedDeliveryStatusProjection = {
  _id: 1, schemaVersion: 1, provider: 1, status: 1,
  ...Object.fromEntries(Object.entries(observedAssetProjection).filter(([key]) => key.startsWith("dataset."))),
};
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function selectedDeliveryId(document: unknown): string | null {
  const id = object(document)?.deliveryId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
}

export function observedCollectionStatusResponse(history: ObservedHistoryResponse, documents: unknown[], deliveries: unknown[]): ObservedCollectionStatusResponse {
  const receipts = new Map(deliveries.map(document => { const row = object(document); return [row?._id, row]; }));
  const counts: Record<Status, number> = { accepted: 0, queued: 0, running: 0, success: 0, failure: 0, unknown: 0 };
  for (const document of documents) {
    const id = selectedDeliveryId(document); const receipt = id ? receipts.get(id) : null;
    let status: Status = "unknown";
    const dataset = object(receipt?.dataset);
    if (receipt?.schemaVersion === "2.0.0" && receipt.provider === "KBS" && dataset
      && Object.keys(dataset).length === Object.keys(history.data.dataset).length
      && Object.entries(history.data.dataset).every(([key, value]) => dataset[key] === value)
      && statuses.slice(0, -1).includes(receipt.status as Status)) status = receipt.status as Status;
    counts[status]++;
  }
  const collected = history.data.candles.map(row => row.collectedAt).sort((a, b) => collectedOrder(a).localeCompare(collectedOrder(b)));
  return {
    data: { dataset: history.data.dataset, asset: history.data.asset },
    meta: {
      ...history.meta, status: documents.length ? "available" : "no_stored_bars", freshness: "unknown", sessionCalendar: "unverified",
      selectedCandleCount: documents.length, collectedAtRange: collected.length ? { from: collected[0]!, to: collected.at(-1)! } : null,
      candleCountsByDeliveryStatus: counts, statusSemantics: "referenced_delivery_status_at_read_time", consistency: "non_atomic_read",
    },
  };
}

import { Router, type ErrorRequestHandler } from "express";
import type { Db, Document } from "mongodb";
import { latestObservedRange, observedAssetProjection, observedCandleProjection, observedHistoryResponse, parseObservedHistoryQuery, validatedObservedAsset, type ObservedHistoryRange, type ObservedHistoryResponse, type ObservedLatestWindowResponse } from "./observed-history-contract.js";
import { observedCollectionStatusResponse, observedDeliveryStatusProjection, selectedDeliveryId, type ObservedCollectionStatusResponse } from "./observed-collection-status-contract.js";
import { DependencyTimeoutError, withinTimeout } from "./platform/health/dependency-probes.js";

export interface ObservedHistoryReader {
  read(symbol: string, range: ObservedHistoryRange): Promise<ObservedHistoryResponse | null>;
  collectionStatus?(symbol: string, range: ObservedHistoryRange): Promise<ObservedCollectionStatusResponse | null>;
  latestWindow?(): Promise<ObservedLatestWindowResponse | null>;
}

export class ObservedHistoryService implements ObservedHistoryReader {
  constructor(private readonly db: Db, private readonly timeoutMs = 1000) {}
  async latestWindow(): Promise<ObservedLatestWindowResponse | null> {
    const deadline = performance.now() + Math.max(1, Math.trunc(this.timeoutMs));
    const remainingMs = () => {
      const remaining = Math.floor(deadline - performance.now());
      if (remaining <= 0) throw new DependencyTimeoutError();
      return remaining;
    };
    return withinTimeout(async () => {
      // CSOT also bounds selection and pool checkout; both reads share one deadline.
      const assetTimeout = remainingMs();
      const asset = await this.db.collection<Document & { _id: string }>("observed_assets")
        .findOne({ _id: "VN:HOSE:FPT" }, { projection: observedAssetProjection, maxTimeMS: assetTimeout, timeoutMS: assetTimeout });
      remainingMs();
      if (!asset) return null;
      const data = validatedObservedAsset("FPT", asset);
      const candleTimeout = remainingMs();
      const cursor = this.db.collection("observed_candles_latest").find({
        "record.assetId": "VN:HOSE:FPT", "record.source.provider": "KBS", "record.interval": "1d", "record.adjustmentBasis": "unknown",
      }, { projection: observedCandleProjection, maxTimeMS: candleTimeout, timeoutMS: candleTimeout, timeoutMode: "cursorLifetime", hint: "asset_daily_history" })
        .sort({ "record.tradingDate": -1 }).limit(1);
      let rows: Document[];
      try { rows = await cursor.toArray(); }
      finally { await cursor.close({ timeoutMS: Math.max(1, Math.floor(deadline - performance.now())) }); }
      remainingMs();
      const date: unknown = rows[0]?.record?.tradingDate;
      const range = rows.length ? latestObservedRange(typeof date === "string" ? date : "") : null;
      if (range) observedHistoryResponse("FPT", range, asset, rows);
      return { data, meta: { status: range ? "available" : "no_data", provider: "KBS", interval: "1d", latestTradingDate: range?.to ?? null,
        range, calendarDays: 30, sourceAsOf: null, freshness: "unknown", completeness: "unknown", selectionSemantics: "max_stored_trading_date" } };
    }, this.timeoutMs);
  }
  async read(symbol: string, range: ObservedHistoryRange): Promise<ObservedHistoryResponse | null> {
    const selected = await this.select(symbol, range, false);
    return selected?.history ?? null;
  }
  async collectionStatus(symbol: string, range: ObservedHistoryRange): Promise<ObservedCollectionStatusResponse | null> {
    const selected = await this.select(symbol, range, true);
    if (!selected) return null;
    const ids = [...new Set(selected.candles.map(selectedDeliveryId).filter((id): id is string => id !== null))];
    const deliveries = ids.length ? await this.db.collection<Document & { _id: string }>("ingestion_deliveries")
      .find({ _id: { $in: ids } }, { projection: observedDeliveryStatusProjection, maxTimeMS: this.timeoutMs }).limit(32).toArray() : [];
    return observedCollectionStatusResponse(selected.history, selected.candles, deliveries);
  }
  private async select(symbol: string, range: ObservedHistoryRange, withDelivery: boolean) {
    const assetId = `VN:${symbol === "FPT" ? "HOSE" : "INDEX"}:${symbol}`;
    const asset = await this.db.collection<Document & { _id: string }>("observed_assets").findOne({ _id: assetId }, { projection: observedAssetProjection, maxTimeMS: this.timeoutMs });
    if (!asset) return null;
    const candles = await this.db.collection("observed_candles_latest").find({
      "record.assetId": assetId, "record.tradingDate": { $gte: range.from, $lte: range.to },
      "record.source.provider": "KBS", "record.interval": "1d", "record.adjustmentBasis": symbol === "FPT" ? "unknown" : "not_applicable",
    }, { projection: withDelivery ? { ...observedCandleProjection, deliveryId: 1 } : observedCandleProjection, maxTimeMS: this.timeoutMs }).sort({ "record.tradingDate": 1 }).limit(33).toArray();
    return { history: observedHistoryResponse(symbol, range, asset, candles), candles };
  }
}

export function createObservedHistoryRouter(reader: ObservedHistoryReader, isReady: () => boolean = () => true) {
  const router = Router();
  router.get("/:symbol/latest-window", async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(request.params.symbol)) { response.status(400).json({ error: "invalid_symbol" }); return; }
    if (new URL(request.originalUrl, "http://localhost").searchParams.size) { response.status(400).json({ error: "invalid_query" }); return; }
    if (request.params.symbol.toUpperCase() !== "FPT") { response.status(404).json({ error: "asset_not_found" }); return; }
    try {
      if (!isReady()) throw new Error("not_ready");
      const result = await reader.latestWindow?.();
      if (!result) { response.status(404).json({ error: "asset_not_found" }); return; }
      response.status(200).json(result);
    } catch { response.status(503).json({ error: "observed_latest_window_unavailable" }); }
  });
  for (const endpoint of ["history", "collection-status"] as const) router.get(`/:symbol/${endpoint}`, async (request, response) => {
    response.set("Cache-Control", "no-store");
    const symbol = request.params.symbol;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(symbol)) { response.status(400).json({ error: "invalid_symbol" }); return; }
    const range = parseObservedHistoryQuery(request.originalUrl);
    if (!range) { response.status(400).json({ error: "invalid_query" }); return; }
    const normalized = symbol.toUpperCase();
    if (!["FPT", "VNINDEX"].includes(normalized)) { response.status(404).json({ error: "asset_not_found" }); return; }
    try {
      if (!isReady()) throw new Error("not_ready");
      const history = endpoint === "history" ? await reader.read(normalized, range) : await reader.collectionStatus?.(normalized, range);
      if (!history) { response.status(404).json({ error: "asset_not_found" }); return; }
      response.status(200).json(history);
    } catch { response.status(503).json({ error: endpoint === "history" ? "observed_history_unavailable" : "observed_collection_status_unavailable" }); }
  });
  const malformedPath: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (!(error instanceof URIError)) { next(error); return; }
    response.set("Cache-Control", "no-store").status(400).json({ error: "invalid_symbol" });
  };
  router.use(malformedPath);
  return router;
}

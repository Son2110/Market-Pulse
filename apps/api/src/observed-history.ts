import { Router, type ErrorRequestHandler } from "express";
import type { Db, Document } from "mongodb";
import { observedAssetProjection, observedCandleProjection, observedHistoryResponse, parseObservedHistoryQuery, type ObservedHistoryRange, type ObservedHistoryResponse } from "./observed-history-contract.js";

export interface ObservedHistoryReader {
  read(symbol: string, range: ObservedHistoryRange): Promise<ObservedHistoryResponse | null>;
}

export class ObservedHistoryService implements ObservedHistoryReader {
  constructor(private readonly db: Db, private readonly timeoutMs = 1000) {}
  async read(symbol: string, range: ObservedHistoryRange): Promise<ObservedHistoryResponse | null> {
    const assetId = `VN:${symbol === "FPT" ? "HOSE" : "INDEX"}:${symbol}`;
    const asset = await this.db.collection<Document & { _id: string }>("observed_assets").findOne({ _id: assetId }, { projection: observedAssetProjection, maxTimeMS: this.timeoutMs });
    if (!asset) return null;
    const candles = await this.db.collection("observed_candles_latest").find({
      "record.assetId": assetId, "record.tradingDate": { $gte: range.from, $lte: range.to },
      "record.source.provider": "KBS", "record.interval": "1d", "record.adjustmentBasis": symbol === "FPT" ? "unknown" : "not_applicable",
    }, { projection: observedCandleProjection, maxTimeMS: this.timeoutMs }).sort({ "record.tradingDate": 1 }).limit(33).toArray();
    return observedHistoryResponse(symbol, range, asset, candles);
  }
}

export function createObservedHistoryRouter(reader: ObservedHistoryReader, isReady: () => boolean = () => true) {
  const router = Router();
  router.get("/:symbol/history", async (request, response) => {
    response.set("Cache-Control", "no-store");
    const symbol = request.params.symbol;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(symbol)) { response.status(400).json({ error: "invalid_symbol" }); return; }
    const range = parseObservedHistoryQuery(request.originalUrl);
    if (!range) { response.status(400).json({ error: "invalid_query" }); return; }
    const normalized = symbol.toUpperCase();
    if (!["FPT", "VNINDEX"].includes(normalized)) { response.status(404).json({ error: "asset_not_found" }); return; }
    try {
      if (!isReady()) throw new Error("not_ready");
      const history = await reader.read(normalized, range);
      if (!history) { response.status(404).json({ error: "asset_not_found" }); return; }
      response.status(200).json(history);
    } catch { response.status(503).json({ error: "observed_history_unavailable" }); }
  });
  const malformedPath: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (!(error instanceof URIError)) { next(error); return; }
    response.set("Cache-Control", "no-store").status(400).json({ error: "invalid_symbol" });
  };
  router.use(malformedPath);
  return router;
}

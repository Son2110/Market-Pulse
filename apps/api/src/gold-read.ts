import { Router } from "express";
import type { Db, Document } from "mongodb";
import { goldAssetReadProjection, goldQuoteReadProjection, goldReadResponse, parseGoldHistoryQuery, parseGoldLatestQuery, validateGoldReadAsset, type GoldHistoryQuery, type GoldReadQuery, type GoldReadResponse } from "./gold-read-contract.js";

export interface GoldReader {
  latest(query: GoldReadQuery): Promise<GoldReadResponse>;
  history(query: GoldHistoryQuery): Promise<GoldReadResponse | null>;
}
export function goldHistoryPipeline(query: GoldHistoryQuery): Document[] {
  return [
    { $match: { assetId: query.assetId, "record.time.referenceDate": { $gte: query.from, $lte: query.to } } },
    { $facet: {
      rows: [
        { $set: { readOrder: { $ifNull: ["$record.time.sourceAsOf", "$record.time.collectedAt"] } } },
        { $sort: { readOrder: 1, _id: 1 } },
        { $skip: query.offset }, { $limit: query.limit }, { $project: goldQuoteReadProjection },
      ],
      total: [{ $count: "count" }],
    } },
  ];
}
export class GoldReadService implements GoldReader {
  constructor(private readonly db: Db) {}
  private async page(collection: string, pipeline: Document[]) {
    const result = await this.db.collection(collection).aggregate<{ rows: Document[]; total: { count: number }[] }>(pipeline, { maxTimeMS: 1000, allowDiskUse: false }).next();
    if (!result) throw new Error("gold_missing_facet");
    return { rows: result.rows, total: result.total[0]?.count ?? 0 };
  }
  async history(query: GoldHistoryQuery) {
    const asset = await this.db.collection<Document & { _id: string }>("gold_assets").findOne({ _id: query.assetId }, { projection: goldAssetReadProjection, maxTimeMS: 1000 });
    if (!asset) return null;
    validateGoldReadAsset(asset, query.assetId);
    const page = await this.page("gold_quote_snapshots", goldHistoryPipeline(query));
    return goldReadResponse(query, page.rows, page.total, [asset], query);
  }
  async latest(query: GoldReadQuery) {
    const match: Document = {};
    for (const key of ["provider", "product", "region"] as const) if (query[key] !== undefined) match[`record.${key}`] = query[key];
    const page = await this.page("gold_quotes_latest", [
      { $match: match },
      { $facet: {
        rows: [{ $sort: { _id: 1 } }, { $skip: query.offset }, { $limit: query.limit }, { $project: goldQuoteReadProjection }],
        total: [{ $count: "count" }],
      } },
    ]);
    const ids = page.rows.map(row => row.assetId as string);
    const assets = ids.length ? await this.db.collection<Document & { _id: string }>("gold_assets").find({ _id: { $in: ids } }, { projection: goldAssetReadProjection, maxTimeMS: 1000 }).limit(query.limit).toArray() : [];
    return goldReadResponse(query, page.rows, page.total, assets);
  }
}
export function createGoldReadRouter(reader: GoldReader, isReady: () => boolean = () => true) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.get("/latest", async (request, response) => {
    const query = parseGoldLatestQuery(request.originalUrl);
    if (!query) { response.status(400).json({ error: "invalid_query" }); return; }
    try {
      if (!isReady()) throw new Error("not_ready");
      response.json(await reader.latest(query));
    }
    catch { response.status(503).json({ error: "gold_latest_unavailable" }); }
  });
  router.get("/history", async (request, response) => {
    const query = parseGoldHistoryQuery(request.originalUrl);
    if (!query) { response.status(400).json({ error: "invalid_query" }); return; }
    try {
      if (!isReady()) throw new Error("not_ready");
      const result = await reader.history(query);
      if (!result) { response.status(404).json({ error: "product_not_found" }); return; }
      response.json(result);
    } catch { response.status(503).json({ error: "gold_history_unavailable" }); }
  });
  return router;
}

import express, { type NextFunction, type Request, type RequestHandler, type Response, Router } from "express";
import { ObjectId, type Collection, type Db, type WithId } from "mongodb";
import type { AssetCatalogProvider } from "./market-data.js";

interface WatchlistRecord {
  userId: ObjectId;
  name: string;
  symbols: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistOptions {
  db: Db;
  authenticate: RequestHandler;
  provider: AssetCatalogProvider;
  isReady: () => boolean;
  now?: () => number;
}

function jsonError(response: Response, status: number, error: string): void {
  response.status(status).json({ error });
}

function bodyless(request: Request, response: Response, next: NextFunction): void {
  if (request.headers["transfer-encoding"] !== undefined
    || (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
    jsonError(response, 400, "invalid_request");
    return;
  }
  next();
}

function requireJson(request: Request, response: Response, next: NextFunction): void {
  if (request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    jsonError(response, 415, "unsupported_media_type");
    return;
  }
  next();
}

function parseName(body: unknown): string | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "name")) return undefined;
  const name = (body as Record<string, unknown>).name;
  if (typeof name !== "string" || /\p{Cc}/u.test(name)) return undefined;
  const trimmed = name.trim();
  const length = Array.from(trimmed).length;
  return length >= 1 && length <= 100 ? trimmed : undefined;
}

function publicWatchlist(record: WithId<WatchlistRecord>) {
  return {
    id: record._id.toHexString(),
    name: record.name,
    symbols: [...record.symbols].sort(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createWatchlistApi(options: WatchlistOptions): { router: Router; initialize: () => Promise<void> } {
  const collection: Collection<WatchlistRecord> = options.db.collection("watchlists");
  const now = options.now ?? Date.now;
  let allowedSymbols: Set<string> | undefined;
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    if (!allowedSymbols || !options.isReady()) {
      jsonError(response, 503, "not_ready");
      return;
    }
    next();
  });
  router.use(options.authenticate);
  router.use((request, response, next) => {
    if ([...new URL(request.originalUrl, "http://localhost").searchParams].length !== 0) {
      jsonError(response, 400, "invalid_request");
      return;
    }
    next();
  });

  // Only the authenticated server principal supplies ownership to database filters.
  const owner = (response: Response): ObjectId => {
    const user = response.locals.authenticatedUser as { _id?: unknown } | undefined;
    if (!(user?._id instanceof ObjectId)) throw new Error("Missing authenticated principal");
    return user._id;
  };
  const ownedId = (request: Request, response: Response) => {
    if (typeof request.params.id !== "string" || !/^[a-f\d]{24}$/iu.test(request.params.id)) {
      jsonError(response, 400, "invalid_request");
      return undefined;
    }
    return { _id: new ObjectId(request.params.id), userId: owner(response) };
  };

  router.get("/", bodyless, async (_request, response) => {
    const record = await collection.findOne({ userId: owner(response) });
    response.status(200).json({ data: record ? [publicWatchlist(record)] : [] });
  });
  router.post("/", requireJson, express.json({ limit: "8kb", strict: false }), async (request, response) => {
    const name = parseName(request.body);
    if (name === undefined) return jsonError(response, 400, "invalid_request");
    const timestamp = new Date(now());
    const record: WithId<WatchlistRecord> = {
      _id: new ObjectId(), userId: owner(response), name, symbols: [], createdAt: timestamp, updatedAt: timestamp,
    };
    try {
      await collection.insertOne(record);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        return jsonError(response, 409, "watchlist_already_exists");
      }
      throw error;
    }
    response.status(201).json({ data: publicWatchlist(record) });
  });
  router.patch("/:id", requireJson, express.json({ limit: "8kb", strict: false }), async (request, response) => {
    const filter = ownedId(request, response);
    if (!filter) return;
    const name = parseName(request.body);
    if (name === undefined) return jsonError(response, 400, "invalid_request");
    const record = await collection.findOneAndUpdate(filter, { $set: { name, updatedAt: new Date(now()) } }, {
      returnDocument: "after", includeResultMetadata: false,
    });
    if (!record) return jsonError(response, 404, "not_found");
    response.status(200).json({ data: publicWatchlist(record) });
  });
  router.delete("/:id", bodyless, async (request, response) => {
    const filter = ownedId(request, response);
    if (!filter) return;
    const result = await collection.deleteOne(filter);
    if (result.deletedCount === 0) return jsonError(response, 404, "not_found");
    response.status(204).end();
  });

  for (const method of ["put", "delete"] as const) {
    router[method]("/:id/symbols/:symbol", bodyless, async (request, response) => {
      const filter = ownedId(request, response);
      if (!filter) return;
      const symbol = request.params.symbol;
      if (typeof symbol !== "string" || !allowedSymbols?.has(symbol)) return jsonError(response, 400, "invalid_request");
      const update = method === "put" ? { $addToSet: { symbols: symbol } } : { $pull: { symbols: symbol } };
      const record = await collection.findOneAndUpdate(filter, { ...update, $set: { updatedAt: new Date(now()) } }, {
        returnDocument: "after", includeResultMetadata: false,
      });
      if (!record) return jsonError(response, 404, "not_found");
      response.status(200).json({ data: publicWatchlist(record) });
    });
  }

  return {
    router,
    initialize: async () => {
      allowedSymbols = undefined;
      const assets = await options.provider.getAssets();
      const equities = assets.filter((asset) => asset.assetType === "equity");
      const symbols = new Set(equities.map((asset) => asset.symbol));
      const assetIds = new Set(equities.map((asset) => asset.assetId));
      if (equities.length !== 10 || symbols.size !== 10 || assetIds.size !== 10
        || equities.some((asset) => !asset.assetId || !/^[A-Z0-9][A-Z0-9._-]{0,31}$/u.test(asset.symbol) || asset.symbol === "VNINDEX")) {
        throw new Error("Watchlist catalog unavailable");
      }
      await collection.createIndex({ userId: 1 }, { unique: true, name: "watchlist_user_unique" });
      allowedSymbols = symbols;
    },
  };
}

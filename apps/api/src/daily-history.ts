import { Router } from "express";
import type { CanonicalCandle, DailyHistoryRequest, MarketDataProvider } from "./market-data.js";

const SYMBOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const QUERY_KEYS = new Set(["interval", "from", "to"]);

interface ParsedQuery {
  interval: "1d";
  from: string | null;
  to: string | null;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}

function parseQuery(originalUrl: string): ParsedQuery | null {
  const parameters = new URL(originalUrl, "http://localhost").searchParams;
  for (const key of parameters.keys()) {
    if (!QUERY_KEYS.has(key)) return null;
  }

  const single = (key: string): string | null | undefined => {
    const values = parameters.getAll(key);
    if (values.length > 1) return undefined;
    return values.length === 1 ? values[0] : null;
  };
  const interval = single("interval");
  const from = single("from");
  const to = single("to");
  if (interval === undefined || from === undefined || to === undefined) return null;
  if (interval !== null && interval !== "1d") return null;
  if (from !== null && !validCalendarDate(from)) return null;
  if (to !== null && !validCalendarDate(to)) return null;
  if (from !== null && to !== null && from > to) return null;
  return { interval: "1d", from: from ?? null, to: to ?? null };
}

function latestAsOf(candles: CanonicalCandle[]): string | null {
  return candles.at(-1)?.asOf ?? null;
}

export function createDailyHistoryRouter(provider: MarketDataProvider) {
  const router = Router();

  router.get("/:symbol/history", async (request, response) => {
    response.set("Cache-Control", "no-store");
    const { symbol } = request.params;
    if (!SYMBOL_PATTERN.test(symbol)) {
      response.status(400).json({ error: "invalid_symbol" });
      return;
    }

    const query = parseQuery(request.originalUrl);
    if (!query) {
      response.status(400).json({ error: "invalid_query" });
      return;
    }

    const providerRequest: DailyHistoryRequest = {
      symbol: symbol.toUpperCase(),
      interval: query.interval,
      range: { from: query.from, to: query.to },
    };
    try {
      const history = await provider.getDailyHistory(providerRequest);
      if (!history) {
        response.status(404).json({ error: "asset_not_found" });
        return;
      }

      response.status(200).json({
        data: {
          schemaVersion: "1.0.0",
          dataset: history.dataset,
          assets: [history.asset],
          candles: history.candles,
          quotes: [],
          indexObservations: [],
        },
        meta: {
          status: history.candles.length > 0 ? "available" : "no_data",
          provider: "marketpulse-fixture",
          interval: query.interval,
          requestedRange: { from: query.from, to: query.to },
          availableRange: history.availableRange,
          asOf: latestAsOf(history.candles),
        },
      });
    } catch {
      response.status(503).json({ error: "market_data_unavailable" });
    }
  });

  return router;
}

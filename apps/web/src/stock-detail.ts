import type { SearchResult } from "./stock-search.js";

export interface DailyCandle {
  assetId: string;
  interval: "1d";
  tradingDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeUnit: "shares";
  currency: "VND";
  unit: "VND";
  adjustmentBasis: "unadjusted" | "split_adjusted" | "total_return_adjusted";
  timezone: "Asia/Ho_Chi_Minh";
  asOf: string;
  ingestedAt: string;
  source: { provider: "marketpulse-fixture"; mode: "fixture"; recordId: string };
}

export interface HistoryResponse {
  data: {
    schemaVersion: "1.0.0";
    dataset: { mode: "fixture"; label: "SYNTHETIC FIXTURE — NOT MARKET DATA"; freshness: "fixture / unknown"; sessionCalendar: "unverified" };
    assets: [SearchResult["asset"]];
    candles: DailyCandle[];
    quotes: [];
    indexObservations: [];
  };
  meta: {
    status: "available" | "no_data";
    provider: "marketpulse-fixture";
    interval: "1d";
    requestedRange: { from: null; to: null };
    availableRange: { from: string | null; to: string | null };
    asOf: string | null;
  };
}

export function normalizeSymbol(value: string): string | null {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(value) && value.toUpperCase() !== "VNINDEX" ? value.toUpperCase() : null;
}

export function stockRoute(pathname: string): { kind: "search" } | { kind: "detail"; symbol: string } | { kind: "invalid" } {
  if (pathname === "/") return { kind: "search" };
  const match = /^\/stocks\/([^/]+)\/?$/.exec(pathname);
  if (!match) return { kind: "invalid" };
  try {
    const symbol = normalizeSymbol(decodeURIComponent(match[1]));
    return symbol ? { kind: "detail", symbol } : { kind: "invalid" };
  } catch { return { kind: "invalid" }; }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  return !!match && validDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60
    && (match[5] === "Z" || (Number(match[5].slice(1, 3)) < 24 && Number(match[5].slice(4)) < 60))
    && Number.isFinite(Date.parse(value));
}

export function isHistoryResponse(value: unknown, symbol: string): value is HistoryResponse {
  if (!record(value) || !record(value.data) || !record(value.meta)) return false;
  const { data, meta } = value;
  if (data.schemaVersion !== "1.0.0" || !record(data.dataset) || !Array.isArray(data.assets) || data.assets.length !== 1
    || !Array.isArray(data.candles) || data.candles.length > 1000 || !Array.isArray(data.quotes) || data.quotes.length !== 0
    || !Array.isArray(data.indexObservations) || data.indexObservations.length !== 0) return false;
  const { dataset } = data;
  if (dataset.mode !== "fixture" || dataset.label !== "SYNTHETIC FIXTURE — NOT MARKET DATA"
    || dataset.freshness !== "fixture / unknown" || dataset.sessionCalendar !== "unverified") return false;
  const asset: unknown = data.assets[0];
  if (!record(asset) || normalizeSymbol(symbol) !== symbol || asset.symbol !== symbol || asset.assetType !== "equity"
    || !["HOSE", "HNX", "UPCOM"].includes(String(asset.exchange)) || asset.assetId !== `VN:${asset.exchange}:${symbol}`
    || asset.currency !== "VND" || asset.unit !== "VND" || asset.timezone !== "Asia/Ho_Chi_Minh") return false;
  if (meta.provider !== "marketpulse-fixture" || meta.interval !== "1d" || !record(meta.requestedRange)
    || meta.requestedRange.from !== null || meta.requestedRange.to !== null || !record(meta.availableRange)) return false;
  const range = meta.availableRange;
  if (!((range.from === null && range.to === null) || (validDate(range.from) && validDate(range.to) && range.from <= range.to))) return false;
  let previousDate = "";
  let basis: unknown;
  const records = new Set<string>();
  for (const item of data.candles as unknown[]) {
    if (!record(item) || item.assetId !== asset.assetId || item.interval !== "1d" || !validDate(item.tradingDate)
      || item.tradingDate <= previousDate || !validDate(range.from) || !validDate(range.to)
      || item.tradingDate < range.from || item.tradingDate > range.to) return false;
    if (![item.open, item.high, item.low, item.close].every((price) => typeof price === "number" && Number.isFinite(price) && price > 0)) return false;
    const { open, high, low, close } = item as unknown as DailyCandle;
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high
      || typeof item.volume !== "number" || !Number.isSafeInteger(item.volume) || item.volume < 0 || item.volumeUnit !== "shares"
      || item.currency !== "VND" || item.unit !== "VND" || item.timezone !== "Asia/Ho_Chi_Minh"
      || !["unadjusted", "split_adjusted", "total_return_adjusted"].includes(String(item.adjustmentBasis))) return false;
    if (basis !== undefined && item.adjustmentBasis !== basis) return false;
    if (!validTimestamp(item.asOf) || !validTimestamp(item.ingestedAt) || Date.parse(item.ingestedAt) < Date.parse(item.asOf)
      || new Date(Date.parse(item.asOf) + 7 * 3600_000).toISOString().slice(0, 10) !== item.tradingDate
      || !record(item.source) || item.source.provider !== "marketpulse-fixture" || item.source.mode !== "fixture"
      || typeof item.source.recordId !== "string" || !item.source.recordId.startsWith("synthetic-") || records.has(item.source.recordId)) return false;
    records.add(item.source.recordId);
    previousDate = item.tradingDate;
    basis = item.adjustmentBasis;
  }
  const latest = data.candles.at(-1) as DailyCandle | undefined;
  return latest ? meta.status === "available" && meta.asOf === latest.asOf
    : meta.status === "no_data" && meta.asOf === null;
}

export function closingSummary(candles: DailyCandle[]) {
  const latest = candles.at(-1) ?? null;
  const previous = candles.at(-2) ?? null;
  const change = latest && previous ? latest.close - previous.close : null;
  const changePercent = change !== null && previous && previous.close > 0 ? change / previous.close * 100 : null;
  return { latest, previous, change, changePercent };
}

export function closingChart(candles: DailyCandle[], width = 720) {
  if (!candles.length) return { points: [], segments: [], ticks: [], hasGaps: false };
  const dates = candles.map((candle) => Date.parse(`${candle.tradingDate}T00:00:00Z`));
  const prices = candles.map((candle) => candle.close);
  const min = Math.min(...prices), max = Math.max(...prices);
  const padding = Math.max((max - min) * .15, max * .002, 1);
  const bottom = Math.max(0, min - padding), top = max + padding;
  const span = dates.at(-1)! - dates[0];
  const left = width < 480 ? 65 : 80;
  const right = width < 480 ? width - 40 : width - 80;
  const points = candles.map((candle, index) => ({
    candle, x: span === 0 ? (left + right) / 2 : left + (dates[index] - dates[0]) / span * (right - left),
    y: 220 - (candle.close - bottom) / (top - bottom) * 180,
  }));
  const segments: typeof points[] = [];
  let hasGaps = false;
  points.forEach((point, index) => {
    if (index === 0 || dates[index] - dates[index - 1] > 86400_000) {
      if (index > 0) hasGaps = true;
      segments.push([]);
    }
    segments.at(-1)!.push(point);
  });
  const ticks = [0, 1, 2, 3].map((index) => ({ y: 220 - index * 60, price: bottom + (top - bottom) * index / 3 }));
  return { points, segments, ticks, hasGaps };
}

export type DetailErrorKind = "invalid" | "unknown" | "unavailable" | "timeout" | "network" | "response";
export class DetailError extends Error {
  constructor(public readonly kind: DetailErrorKind) { super(kind); }
}

export async function fetchHistory(symbol: string, signal: AbortSignal, request: typeof fetch = fetch, timeoutMs = 10_000): Promise<HistoryResponse> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) throw new DetailError("invalid");
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await request(`/api/assets/${encodeURIComponent(normalized)}/history`, {
      signal: AbortSignal.any([signal, timeout.signal]), cache: "no-store", headers: { Accept: "application/json" },
    });
    if (response.status === 400) throw new DetailError("invalid");
    if (response.status === 404) throw new DetailError("unknown");
    if (!response.ok) throw new DetailError("unavailable");
    let body: unknown;
    try { body = await response.json(); } catch { throw new DetailError("response"); }
    if (!isHistoryResponse(body, normalized)) throw new DetailError("response");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.signal.aborted) throw new DetailError("timeout");
    if (error instanceof DetailError) throw error;
    throw new DetailError("network");
  } finally { clearTimeout(timer); }
}

export function detailErrorMessage(error: unknown): string {
  switch (error instanceof DetailError ? error.kind : "network") {
    case "invalid": return "Mã cổ phiếu không hợp lệ hoặc chưa được hỗ trợ. Trang này chỉ dành cho cổ phiếu.";
    case "unknown": return "Không tìm thấy mã cổ phiếu trong danh mục demo.";
    case "timeout": return "Tải lịch sử mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
    case "response": return "Chưa thể đọc lịch sử: dữ liệu hoặc thông tin nguồn không hợp lệ. Vui lòng thử lại.";
    case "unavailable": return "Lịch sử tạm thời chưa sẵn sàng. Vui lòng thử lại.";
    default: return "Không thể kết nối để tải lịch sử. Kiểm tra kết nối và thử lại.";
  }
}

export interface IndexCandle {
  assetId: "VN:INDEX:VNINDEX";
  interval: "1d";
  tradingDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: null;
  volumeUnit: "not_available";
  currency: null;
  unit: "index_point";
  adjustmentBasis: "not_applicable";
  timezone: "Asia/Ho_Chi_Minh";
  asOf: string;
  ingestedAt: string;
  source: { provider: "marketpulse-fixture"; mode: "fixture"; recordId: string };
}

export interface IndexHistoryResponse {
  data: {
    schemaVersion: "1.0.0";
    dataset: { mode: "fixture"; label: "SYNTHETIC FIXTURE — NOT MARKET DATA"; freshness: "fixture / unknown"; sessionCalendar: "unverified" };
    assets: [{ assetId: "VN:INDEX:VNINDEX"; symbol: "VNINDEX"; assetType: "index"; exchange: "INDEX"; currency: null; unit: "index_point"; timezone: "Asia/Ho_Chi_Minh" }];
    candles: IndexCandle[];
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

export function isMarketRoute(pathname: string): boolean {
  return pathname === "/market" || pathname === "/market/";
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

export function isIndexHistoryResponse(value: unknown): value is IndexHistoryResponse {
  if (!record(value) || !record(value.data) || !record(value.meta)) return false;
  const { data, meta } = value;
  if (data.schemaVersion !== "1.0.0" || !record(data.dataset) || !Array.isArray(data.assets) || data.assets.length !== 1
    || !Array.isArray(data.candles) || data.candles.length > 1000 || !Array.isArray(data.quotes) || data.quotes.length !== 0
    || !Array.isArray(data.indexObservations) || data.indexObservations.length !== 0) return false;
  const { dataset } = data;
  if (dataset.mode !== "fixture" || dataset.label !== "SYNTHETIC FIXTURE — NOT MARKET DATA"
    || dataset.freshness !== "fixture / unknown" || dataset.sessionCalendar !== "unverified") return false;
  const asset: unknown = data.assets[0];
  if (!record(asset) || asset.assetId !== "VN:INDEX:VNINDEX" || asset.symbol !== "VNINDEX" || asset.assetType !== "index"
    || asset.exchange !== "INDEX" || asset.currency !== null || asset.unit !== "index_point" || asset.timezone !== "Asia/Ho_Chi_Minh") return false;
  if (meta.provider !== "marketpulse-fixture" || meta.interval !== "1d" || !record(meta.requestedRange)
    || meta.requestedRange.from !== null || meta.requestedRange.to !== null || !record(meta.availableRange)) return false;
  const range = meta.availableRange;
  if (!((range.from === null && range.to === null) || (validDate(range.from) && validDate(range.to) && range.from <= range.to))) return false;
  let previousDate = "";
  const records = new Set<string>();
  for (const item of data.candles as unknown[]) {
    if (!record(item) || item.assetId !== asset.assetId || item.interval !== "1d" || !validDate(item.tradingDate)
      || item.tradingDate <= previousDate || !validDate(range.from) || !validDate(range.to)
      || item.tradingDate < range.from || item.tradingDate > range.to) return false;
    if (![item.open, item.high, item.low, item.close].every((price) => typeof price === "number" && Number.isFinite(price) && price > 0)) return false;
    const { open, high, low, close } = item as unknown as IndexCandle;
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high
      || item.volume !== null || item.volumeUnit !== "not_available" || item.currency !== null || item.unit !== "index_point"
      || item.timezone !== "Asia/Ho_Chi_Minh" || item.adjustmentBasis !== "not_applicable") return false;
    if (!validTimestamp(item.asOf) || !validTimestamp(item.ingestedAt) || Date.parse(item.ingestedAt) < Date.parse(item.asOf)
      || new Date(Date.parse(item.asOf) + 7 * 3600_000).toISOString().slice(0, 10) !== item.tradingDate
      || !record(item.source) || item.source.provider !== "marketpulse-fixture" || item.source.mode !== "fixture"
      || typeof item.source.recordId !== "string" || !item.source.recordId.startsWith("synthetic-") || item.source.recordId.length <= 10
      || records.has(item.source.recordId)) return false;
    records.add(item.source.recordId);
    previousDate = item.tradingDate;
  }
  const latest = data.candles.at(-1) as IndexCandle | undefined;
  return latest ? meta.status === "available" && meta.asOf === latest.asOf : meta.status === "no_data" && meta.asOf === null;
}

export function indexClosingSummary(candles: IndexCandle[]) {
  const latest = candles.at(-1) ?? null;
  const previous = candles.at(-2) ?? null;
  const change = latest && previous ? latest.close - previous.close : null;
  const changePercent = change !== null && previous && previous.close > 0 ? change / previous.close * 100 : null;
  return { latest, previous, change, changePercent };
}

export class IndexHistoryError extends Error {
  constructor(public readonly kind: "missing" | "unavailable" | "timeout" | "network" | "response") { super(kind); }
}

export async function fetchIndexHistory(signal: AbortSignal, request: typeof fetch = fetch, timeoutMs = 10_000): Promise<IndexHistoryResponse> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await request("/api/assets/VNINDEX/history", {
      signal: AbortSignal.any([signal, timeout.signal]), cache: "no-store", headers: { Accept: "application/json" },
    });
    if (response.status === 404) throw new IndexHistoryError("missing");
    if (!response.ok) throw new IndexHistoryError("unavailable");
    let body: unknown;
    try { body = await response.json(); } catch { throw new IndexHistoryError("response"); }
    if (!isIndexHistoryResponse(body)) throw new IndexHistoryError("response");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.signal.aborted) throw new IndexHistoryError("timeout");
    if (error instanceof IndexHistoryError) throw error;
    throw new IndexHistoryError("network");
  } finally { clearTimeout(timer); }
}

export function indexErrorMessage(error: unknown): string {
  switch (error instanceof IndexHistoryError ? error.kind : "network") {
    case "missing": return "VN-Index chưa có trong nguồn dữ liệu demo. Vui lòng thử lại sau.";
    case "timeout": return "Tải VN-Index mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
    case "response": return "Chưa thể đọc VN-Index: dữ liệu hoặc thông tin nguồn không hợp lệ. Vui lòng thử lại.";
    case "unavailable": return "Dữ liệu VN-Index tạm thời chưa sẵn sàng. Vui lòng thử lại.";
    default: return "Không thể kết nối để tải VN-Index. Kiểm tra kết nối và thử lại.";
  }
}

import { queryError } from "./stock-search.js";

export const sampleRange = { from: "2026-09-28", to: "2026-10-07" };
export interface ObservedRange { from: string; to: string }
export type DetailMode = { kind: "fixture" } | { kind: "observed"; range: ObservedRange } | { kind: "invalid"; message: string };
export function validObservedDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$(?![\s\S])/.test(value) && !value.startsWith("0000-")
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validObservedRange(range: ObservedRange): boolean {
  return validObservedDate(range.from) && validObservedDate(range.to) && range.from <= range.to
    && (Date.parse(range.to) - Date.parse(range.from)) / 86400_000 <= 31;
}
export function validatedSearch(search: string): string | null {
  const parameters = new URLSearchParams(search);
  const value = parameters.get("search");
  return parameters.getAll("search").length === 1 && value && !queryError(value) ? value : null;
}
export function detailMode(search: string, symbol: string | null): DetailMode {
  const parameters = new URLSearchParams(search);
  const invalid: DetailMode = { kind: "invalid", message: "Nguồn hoặc khoảng ngày không hợp lệ. Chọn một nguồn và hai ngày hợp lệ, chênh lệch tối đa 31 ngày (32 ngày lịch)." };
  if (["source", "from", "to"].some(key => parameters.getAll(key).length > 1)) return invalid;
  const source = parameters.get("source");
  if (source === null || source === "fixture") return parameters.has("from") || parameters.has("to") ? invalid : { kind: "fixture" };
  if (source !== "observed") return invalid;
  if (symbol !== "FPT") return { kind: "invalid", message: "Trang dữ liệu đã lưu hiện chỉ hỗ trợ cổ phiếu FPT." };
  if ([...parameters.keys()].some(key => !["source", "from", "to", "search"].includes(key))) return invalid;
  const range = { from: parameters.get("from") ?? "", to: parameters.get("to") ?? "" };
  return validObservedRange(range) ? { kind: "observed", range } : invalid;
}
export function detailHref(symbol: string, source: "fixture" | "observed", search: string | null, range = sampleRange): string {
  const parameters = new URLSearchParams();
  if (source === "observed") { parameters.set("source", source); parameters.set("from", range.from); parameters.set("to", range.to); }
  if (search) parameters.set("search", search);
  return `/stocks/${encodeURIComponent(symbol)}${parameters.size ? `?${parameters}` : ""}`;
}

export interface ObservedCandle {
  assetId: "VN:HOSE:FPT"; tradingDate: string; interval: "1d"; currency: "VND"; unit: "VND"; timezone: "Asia/Ho_Chi_Minh"; adjustmentBasis: "unknown";
  open: string; high: string; low: string; close: string; volume: null; volumeUnit: "not_available";
  providerTimeLabel: string; timeProvenance: "provider_naive_calendar_label"; sourceAsOf: null; collectedAt: string;
  source: { provider: "KBS"; connector: "vnstock"; connectorVersion: "4.0.8"; dependencyVersion: "2.6.2"; mode: "observed" };
  barId: string; contentDigest: string;
}
export interface ObservedHistory {
  data: { dataset: { mode: "observed"; label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN"; freshness: "unknown"; sessionCalendar: "unverified" };
    asset: { assetId: "VN:HOSE:FPT"; symbol: "FPT"; assetType: "equity"; currency: "VND"; unit: "VND"; timezone: "Asia/Ho_Chi_Minh" }; candles: ObservedCandle[] };
  meta: { status: "available" | "no_data"; provider: "KBS"; interval: "1d"; requestedRange: ObservedRange; returnedRange: ObservedRange | null;
    sourceAsOf: null; completeness: "unknown"; selectionSemantics: "per_bar_max_collected_at_utc_microseconds_then_content_digest" };
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function exact(value: unknown, expected: Record<string, unknown>): boolean {
  return keys(value, Object.keys(expected)) && Object.entries(expected).every(([key, field]) => value[key] === field);
}
export function compareDecimal(a: string, b: string): number {
  const [ai, af = ""] = a.split("."); const [bi, bf = ""] = b.split(".");
  if (ai.length !== bi.length) return ai.length > bi.length ? 1 : -1;
  const av = ai + af.padEnd(Math.max(af.length, bf.length), "0");
  const bv = bi + bf.padEnd(Math.max(af.length, bf.length), "0");
  return av === bv ? 0 : av > bv ? 1 : -1;
}
function decimal(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && /^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$(?![\s\S])/.test(value) && value !== "0";
}
function validClock(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$(?![\s\S])/.exec(value);
  return !!match && validObservedDate(match[1]) && +match[2] <= 23 && +match[3] <= 59 && +(match[4] ?? 0) <= 59;
}
function collectedTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 32) return false;
  const match = /^(.*)(Z|[+-](\d{2}):(\d{2}))$(?![\s\S])/.exec(value);
  if (!match || match[2] === "-00:00" || !match[1].includes("T") || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(match[1]) || !validClock(match[1])
    || (match[2] !== "Z" && (+match[3] > 23 || +match[4] > 59)) || !Number.isFinite(Date.parse(value))) return false;
  const utcYear = new Date(value).getUTCFullYear();
  return utcYear >= 1 && utcYear <= 9999;
}
const asset = { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" };
const dataset = { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" };
const source = { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" };
const candleKeys = ["assetId", "tradingDate", "interval", "currency", "unit", "timezone", "adjustmentBasis", "open", "high", "low", "close", "volume", "volumeUnit", "providerTimeLabel", "timeProvenance", "sourceAsOf", "collectedAt", "source", "barId", "contentDigest"];
export function isObservedHistory(value: unknown, range: ObservedRange): value is ObservedHistory {
  if (!validObservedRange(range) || !keys(value, ["data", "meta"]) || !keys(value.data, ["dataset", "asset", "candles"]) || !exact(value.data.asset, asset) || !exact(value.data.dataset, dataset)
    || !Array.isArray(value.data.candles) || value.data.candles.length > 32 || !keys(value.meta, ["status", "provider", "interval", "requestedRange", "returnedRange", "sourceAsOf", "completeness", "selectionSemantics"])) return false;
  const { candles } = value.data; const meta = value.meta;
  if (meta.provider !== "KBS" || meta.interval !== "1d" || meta.sourceAsOf !== null || meta.completeness !== "unknown" || meta.selectionSemantics !== "per_bar_max_collected_at_utc_microseconds_then_content_digest"
    || !exact(meta.requestedRange, { ...range }) || meta.status !== (candles.length ? "available" : "no_data")) return false;
  let previous = "";
  for (const row of candles) {
    if (!keys(row, candleKeys) || !["assetId", "currency", "unit", "timezone"].every(key => row[key] === asset[key as keyof typeof asset]) || row.interval !== "1d" || row.adjustmentBasis !== "unknown"
      || row.volume !== null || row.volumeUnit !== "not_available" || row.sourceAsOf !== null || row.timeProvenance !== "provider_naive_calendar_label" || !exact(row.source, source)
      || !validObservedDate(row.tradingDate) || row.tradingDate < range.from || row.tradingDate > range.to || row.tradingDate <= previous
      || typeof row.providerTimeLabel !== "string" || row.providerTimeLabel.length > 26 || !validClock(row.providerTimeLabel) || row.providerTimeLabel.slice(0, 10) !== row.tradingDate || !collectedTimestamp(row.collectedAt)
      || ![row.barId, row.contentDigest].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$(?![\s\S])/.test(hash)) || !decimal(row.open) || !decimal(row.high) || !decimal(row.low) || !decimal(row.close)) return false;
    if (compareDecimal(row.low, row.open) > 0 || compareDecimal(row.low, row.close) > 0 || compareDecimal(row.high, row.open) < 0 || compareDecimal(row.high, row.close) < 0) return false;
    previous = row.tradingDate;
  }
  return candles.length ? exact(meta.returnedRange, { from: candles[0].tradingDate, to: candles.at(-1).tradingDate }) : meta.returnedRange === null;
}

export function observedChart(candles: ObservedCandle[], width = 720) {
  const empty = { points: [] as { candle: ObservedCandle; x: number; y: number }[], segments: [] as { candle: ObservedCandle; x: number; y: number }[][], reliable: true, hasGaps: false };
  if (!candles.length) return empty;
  // Floating point is used only for approximate geometry; all displayed prices stay strings.
  const prices = candles.map(row => Number(row.close));
  const unique = new Map<number, string>();
  for (let i = 0; i < prices.length; i++) {
    if (!Number.isFinite(prices[i]) || prices[i] <= 0 || (unique.has(prices[i]) && unique.get(prices[i]) !== candles[i].close)) return { ...empty, reliable: false };
    unique.set(prices[i], candles[i].close);
  }
  const min = Math.min(...prices); const max = Math.max(...prices); const span = max - min;
  const padding = Math.max(span * .15, max * .002);
  const bottom = min - padding; const top = max + padding;
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || !Number.isFinite(top - bottom) || top <= bottom) return { ...empty, reliable: false };
  const dates = candles.map(row => Date.parse(row.tradingDate)); const dateSpan = dates.at(-1)! - dates[0];
  const points = candles.map((candle, index) => ({ candle, x: dateSpan ? 32 + (dates[index] - dates[0]) / dateSpan * (width - 64) : width / 2, y: 215 - (prices[index] - bottom) / (top - bottom) * 180 }));
  const positions = new Map<number, string>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || (positions.has(point.y) && positions.get(point.y) !== point.candle.close)) return { ...empty, reliable: false };
    positions.set(point.y, point.candle.close);
  }
  const segments: typeof points[] = []; let hasGaps = false;
  points.forEach((point, index) => {
    if (!index || dates[index] - dates[index - 1] > 86400_000) { segments.push([]); if (index) hasGaps = true; }
    segments.at(-1)!.push(point);
  });
  return { points, segments, reliable: true, hasGaps };
}
export type ObservedErrorKind = "invalid" | "missing" | "unavailable" | "timeout" | "network" | "response";
export class ObservedError extends Error { constructor(public readonly kind: ObservedErrorKind) { super(kind); } }
export async function fetchObservedHistory(symbol: string, range: ObservedRange, signal: AbortSignal, request: typeof fetch = fetch, timeoutMs = 10_000): Promise<ObservedHistory> {
  if (symbol !== "FPT" || !validObservedRange(range)) throw new ObservedError("invalid");
  const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await request(`/api/observed/assets/FPT/history?${new URLSearchParams({ ...range })}`, { signal: AbortSignal.any([signal, timeout.signal]), cache: "no-store", headers: { Accept: "application/json" } });
    if (response.status === 400) throw new ObservedError("invalid");
    if (response.status === 404) throw new ObservedError("missing");
    if (!response.ok) throw new ObservedError("unavailable");
    let body: unknown; try { body = await response.json(); } catch { throw new ObservedError("response"); }
    if (!isObservedHistory(body, range)) throw new ObservedError("response");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.signal.aborted) throw new ObservedError("timeout");
    if (error instanceof ObservedError) throw error;
    throw new ObservedError("network");
  } finally { clearTimeout(timer); }
}
export function observedErrorMessage(error: unknown): string {
  switch (error instanceof ObservedError ? error.kind : "network") {
    case "invalid": return "Mã hoặc khoảng ngày không hợp lệ. Chênh lệch tối đa 31 ngày (32 ngày lịch).";
    case "missing": return "Dữ liệu đã lưu chưa khả dụng cho mã này.";
    case "timeout": return "Tải dữ liệu đã lưu mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
    case "response": return "Chưa thể đọc dữ liệu đã lưu: giá hoặc thông tin nguồn không hợp lệ. Vui lòng thử lại.";
    case "unavailable": return "Dữ liệu đã lưu tạm thời chưa sẵn sàng. Vui lòng thử lại.";
    default: return "Không thể kết nối để tải dữ liệu đã lưu. Kiểm tra kết nối và thử lại.";
  }
}

import { compareDecimal, sampleRange, validObservedDate, validObservedRange, type ObservedRange } from "./observed-detail.js";

export type OverviewMode = { kind: "fixture" } | { kind: "observed"; range: ObservedRange } | { kind: "invalid"; message: string };
export function overviewMode(search: string): OverviewMode {
  const parameters = new URLSearchParams(search);
  const invalid: OverviewMode = { kind: "invalid", message: "Nguồn hoặc khoảng ngày không hợp lệ. Chọn một nguồn và hai ngày hợp lệ, chênh lệch tối đa 31 ngày (32 ngày lịch)." };
  if ([...parameters.keys()].some(key => !["source", "from", "to"].includes(key) || parameters.getAll(key).length !== 1)) return invalid;
  const source = parameters.get("source");
  if (source === null || source === "fixture") return parameters.has("from") || parameters.has("to") ? invalid : { kind: "fixture" };
  if (source !== "observed") return invalid;
  const range = { from: parameters.get("from") ?? "", to: parameters.get("to") ?? "" };
  return validObservedRange(range) ? { kind: "observed", range } : invalid;
}
export function overviewHref(source: "fixture" | "observed", range = sampleRange): string {
  return source === "fixture" ? "/market" : `/market?${new URLSearchParams({ source, ...range })}`;
}

export interface ObservedIndexCandle {
  assetId: "VN:INDEX:VNINDEX"; tradingDate: string; interval: "1d"; currency: null; unit: "index_point"; timezone: "Asia/Ho_Chi_Minh"; adjustmentBasis: "not_applicable";
  open: string; high: string; low: string; close: string; volume: null; volumeUnit: "not_available";
  providerTimeLabel: string; timeProvenance: "provider_naive_calendar_label"; sourceAsOf: null; collectedAt: string;
  source: { provider: "KBS"; connector: "vnstock"; connectorVersion: "4.0.8"; dependencyVersion: "2.6.2"; mode: "observed" };
  barId: string; contentDigest: string;
}
export interface ObservedIndexHistory {
  data: { dataset: { mode: "observed"; label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN"; freshness: "unknown"; sessionCalendar: "unverified" };
    asset: { assetId: "VN:INDEX:VNINDEX"; symbol: "VNINDEX"; assetType: "index"; currency: null; unit: "index_point"; timezone: "Asia/Ho_Chi_Minh" }; candles: ObservedIndexCandle[] };
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
const asset = { assetId: "VN:INDEX:VNINDEX", symbol: "VNINDEX", assetType: "index", currency: null, unit: "index_point", timezone: "Asia/Ho_Chi_Minh" };
const dataset = { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" };
const source = { provider: "KBS", connector: "vnstock", connectorVersion: "4.0.8", dependencyVersion: "2.6.2", mode: "observed" };
const candleKeys = ["assetId", "tradingDate", "interval", "currency", "unit", "timezone", "adjustmentBasis", "open", "high", "low", "close", "volume", "volumeUnit", "providerTimeLabel", "timeProvenance", "sourceAsOf", "collectedAt", "source", "barId", "contentDigest"];
export function isObservedIndexHistory(value: unknown, range: ObservedRange): value is ObservedIndexHistory {
  if (!validObservedRange(range) || !keys(value, ["data", "meta"]) || !keys(value.data, ["dataset", "asset", "candles"]) || !exact(value.data.asset, asset) || !exact(value.data.dataset, dataset)
    || !Array.isArray(value.data.candles) || value.data.candles.length > 32 || !keys(value.meta, ["status", "provider", "interval", "requestedRange", "returnedRange", "sourceAsOf", "completeness", "selectionSemantics"])) return false;
  const { candles } = value.data; const meta = value.meta;
  if (meta.provider !== "KBS" || meta.interval !== "1d" || meta.sourceAsOf !== null || meta.completeness !== "unknown" || meta.selectionSemantics !== "per_bar_max_collected_at_utc_microseconds_then_content_digest"
    || !exact(meta.requestedRange, { ...range }) || meta.status !== (candles.length ? "available" : "no_data")) return false;
  let previous = "";
  for (const row of candles) {
    if (!keys(row, candleKeys) || !["assetId", "currency", "unit", "timezone"].every(key => row[key] === asset[key as keyof typeof asset]) || row.interval !== "1d" || row.adjustmentBasis !== "not_applicable"
      || row.volume !== null || row.volumeUnit !== "not_available" || row.sourceAsOf !== null || row.timeProvenance !== "provider_naive_calendar_label" || !exact(row.source, source)
      || !validObservedDate(row.tradingDate) || row.tradingDate < range.from || row.tradingDate > range.to || row.tradingDate <= previous
      || typeof row.providerTimeLabel !== "string" || row.providerTimeLabel.length > 26 || !validClock(row.providerTimeLabel) || row.providerTimeLabel.slice(0, 10) !== row.tradingDate || !collectedTimestamp(row.collectedAt)
      || ![row.barId, row.contentDigest].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$(?![\s\S])/.test(hash)) || !decimal(row.open) || !decimal(row.high) || !decimal(row.low) || !decimal(row.close)) return false;
    if (compareDecimal(row.low, row.open) > 0 || compareDecimal(row.low, row.close) > 0 || compareDecimal(row.high, row.open) < 0 || compareDecimal(row.high, row.close) < 0) return false;
    previous = row.tradingDate;
  }
  return candles.length ? exact(meta.returnedRange, { from: candles[0].tradingDate, to: candles.at(-1).tradingDate }) : meta.returnedRange === null;
}

export type ObservedIndexErrorKind = "invalid" | "missing" | "unavailable" | "timeout" | "network" | "response";
export class ObservedIndexError extends Error { constructor(public readonly kind: ObservedIndexErrorKind) { super(kind); } }
export async function fetchObservedIndexHistory( range: ObservedRange, signal: AbortSignal, request: typeof fetch = fetch, timeoutMs = 10_000): Promise<ObservedIndexHistory> {
  if (!validObservedRange(range)) throw new ObservedIndexError("invalid");
  signal.throwIfAborted();
  const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await request(`/api/observed/assets/VNINDEX/history?${new URLSearchParams({ ...range })}`, { signal: AbortSignal.any([signal, timeout.signal]), cache: "no-store", headers: { Accept: "application/json" } });
    if (response.status === 400) throw new ObservedIndexError("invalid");
    if (response.status === 404) throw new ObservedIndexError("missing");
    if (!response.ok) throw new ObservedIndexError("unavailable");
    let body: unknown; try { body = await response.json(); } catch { throw new ObservedIndexError("response"); }
    signal.throwIfAborted(); timeout.signal.throwIfAborted();
    if (!isObservedIndexHistory(body, range)) throw new ObservedIndexError("response");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.signal.aborted) throw new ObservedIndexError("timeout");
    if (error instanceof ObservedIndexError) throw error;
    throw new ObservedIndexError("network");
  } finally { clearTimeout(timer); }
}
export function observedIndexErrorMessage(error: unknown): string {
  switch (error instanceof ObservedIndexError ? error.kind : "network") {
    case "invalid": return "Khoảng ngày không hợp lệ. Chênh lệch tối đa 31 ngày (32 ngày lịch).";
    case "missing": return "Dữ liệu đã lưu chưa khả dụng cho VN-Index.";
    case "timeout": return "Tải dữ liệu đã lưu mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
    case "response": return "Chưa thể đọc dữ liệu đã lưu: giá hoặc thông tin nguồn không hợp lệ. Vui lòng thử lại.";
    case "unavailable": return "Dữ liệu đã lưu tạm thời chưa sẵn sàng. Vui lòng thử lại.";
    default: return "Không thể kết nối để tải dữ liệu đã lưu. Kiểm tra kết nối và thử lại.";
  }
}

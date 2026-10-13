import { validObservedDate, validObservedRange, type ObservedHistory, type ObservedRange } from "./observed-detail.js";

export const deliveryStatuses = ["accepted", "queued", "running", "success", "failure", "unknown"] as const;
export type DeliveryStatus = typeof deliveryStatuses[number];
export interface ObservedCollectionStatus {
  data: Pick<ObservedHistory["data"], "dataset" | "asset">;
  meta: Omit<ObservedHistory["meta"], "status"> & {
    status: "available" | "no_stored_bars"; freshness: "unknown"; sessionCalendar: "unverified";
    selectedCandleCount: number; collectedAtRange: ObservedRange | null;
    candleCountsByDeliveryStatus: Record<DeliveryStatus, number>;
    statusSemantics: "referenced_delivery_status_at_read_time"; consistency: "non_atomic_read";
  };
}
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function exact(value: unknown, expected: Record<string, unknown>): boolean {
  return keys(value, Object.keys(expected)) && Object.entries(expected).every(([key, field]) => value[key] === field);
}
const asset = { assetId: "VN:HOSE:FPT", symbol: "FPT", assetType: "equity", currency: "VND", unit: "VND", timezone: "Asia/Ho_Chi_Minh" };
const dataset = { mode: "observed", label: "OBSERVED KBS DAILY CANDLES — FRESHNESS UNKNOWN", freshness: "unknown", sessionCalendar: "unverified" };
const metaKeys = ["status", "provider", "interval", "requestedRange", "returnedRange", "sourceAsOf", "completeness", "selectionSemantics", "freshness", "sessionCalendar", "selectedCandleCount", "collectedAtRange", "candleCountsByDeliveryStatus", "statusSemantics", "consistency"];
const days = (range: ObservedRange) => (Date.parse(range.to) - Date.parse(range.from)) / 86400_000 + 1;
function count(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 32; }
function timestamp(value: unknown): bigint | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$(?![\s\S])/.exec(value);
  if (!match || !validObservedDate(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59
    || match[6] === "-00:00" || (match[6] !== "Z" && (+match[7] > 23 || +match[8] > 59))) return null;
  const milliseconds = Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[6]}`);
  if (!Number.isFinite(milliseconds)) return null;
  const year = new Date(milliseconds).getUTCFullYear();
  if (year < 1 || year > 9999) return null;
  // Keep sub-millisecond ordering and normalize offsets without changing displayed text.
  return BigInt(milliseconds) * 1000n + BigInt((match[5] ?? "").padEnd(6, "0"));
}
export function isObservedCollectionStatus(value: unknown, range: ObservedRange): value is ObservedCollectionStatus {
  if (!validObservedRange(range) || !keys(value, ["data", "meta"]) || !keys(value.data, ["dataset", "asset"])
    || !exact(value.data.asset, asset) || !exact(value.data.dataset, dataset) || !keys(value.meta, metaKeys)) return false;
  const meta = value.meta;
  if (meta.provider !== "KBS" || meta.interval !== "1d" || meta.sourceAsOf !== null || meta.completeness !== "unknown"
    || meta.freshness !== "unknown" || meta.sessionCalendar !== "unverified"
    || meta.selectionSemantics !== "per_bar_max_collected_at_utc_microseconds_then_content_digest"
    || meta.statusSemantics !== "referenced_delivery_status_at_read_time" || meta.consistency !== "non_atomic_read"
    || !exact(meta.requestedRange, { ...range }) || !count(meta.selectedCandleCount) || meta.selectedCandleCount > days(range)
    || !keys(meta.candleCountsByDeliveryStatus, [...deliveryStatuses])) return false;
  const counts = deliveryStatuses.map(status => (meta.candleCountsByDeliveryStatus as Record<string, unknown>)[status]);
  if (!counts.every(count) || counts.reduce((sum, value) => sum + value, 0) !== meta.selectedCandleCount) return false;
  if (meta.selectedCandleCount === 0) return meta.status === "no_stored_bars" && meta.returnedRange === null && meta.collectedAtRange === null;
  if (meta.status !== "available" || !keys(meta.returnedRange, ["from", "to"])
    || !validObservedDate(meta.returnedRange.from) || !validObservedDate(meta.returnedRange.to)) return false;
  const returned = { from: meta.returnedRange.from, to: meta.returnedRange.to };
  if (!validObservedRange(returned) || returned.from < range.from || returned.to > range.to || days(returned) < meta.selectedCandleCount
    || !keys(meta.collectedAtRange, ["from", "to"])) return false;
  const first = timestamp(meta.collectedAtRange.from); const last = timestamp(meta.collectedAtRange.to);
  return first !== null && last !== null && first <= last;
}
export type CollectionStatusErrorKind = "invalid" | "missing" | "unavailable" | "timeout" | "network" | "response";
export class CollectionStatusError extends Error { constructor(public readonly kind: CollectionStatusErrorKind) { super(kind); } }
export async function fetchObservedCollectionStatus(symbol: string, range: ObservedRange, signal: AbortSignal, request: typeof fetch = fetch, timeoutMs = 10_000): Promise<ObservedCollectionStatus> {
  if (symbol !== "FPT" || !validObservedRange(range)) throw new CollectionStatusError("invalid");
  const timeout = new AbortController(); const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await request(`/api/observed/assets/FPT/collection-status?${new URLSearchParams({ ...range })}`, { signal: AbortSignal.any([signal, timeout.signal]), cache: "no-store", headers: { Accept: "application/json" } });
    if (response.status === 400) throw new CollectionStatusError("invalid");
    if (response.status === 404) throw new CollectionStatusError("missing");
    if (!response.ok) throw new CollectionStatusError("unavailable");
    let body: unknown; try { body = await response.json(); } catch { throw new CollectionStatusError("response"); }
    if (!isObservedCollectionStatus(body, range)) throw new CollectionStatusError("response");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.signal.aborted) throw new CollectionStatusError("timeout");
    if (error instanceof CollectionStatusError) throw error;
    throw new CollectionStatusError("network");
  } finally { clearTimeout(timer); }
}
export function collectionStatusErrorMessage(error: unknown): string {
  switch (error instanceof CollectionStatusError ? error.kind : "network") {
    case "invalid": return "Mã hoặc khoảng ngày của trạng thái thu thập không hợp lệ.";
    case "missing": return "Trạng thái thu thập đã lưu chưa khả dụng cho mã này.";
    case "timeout": return "Tải trạng thái thu thập mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
    case "response": return "Chưa thể đọc trạng thái thu thập: phản hồi không hợp lệ. Vui lòng thử lại.";
    case "unavailable": return "Trạng thái thu thập tạm thời chưa sẵn sàng. Vui lòng thử lại.";
    default: return "Không thể kết nối để tải trạng thái thu thập. Kiểm tra kết nối và thử lại.";
  }
}

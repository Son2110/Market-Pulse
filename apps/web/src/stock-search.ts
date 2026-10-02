export interface SearchResult {
  asset: {
    assetId: string;
    symbol: string;
    assetType: "equity";
    exchange: "HOSE" | "HNX" | "UPCOM";
    currency: "VND";
    unit: "VND";
    timezone: "Asia/Ho_Chi_Minh";
  };
  companyName: string;
  aliases: string[];
  reference: { officialSources: string[]; reviewedOn: string };
}

export interface SearchResponse {
  data: SearchResult[];
  meta: {
    scope: "fixture equities";
    dataset: "fixture / unknown";
    label: "SYNTHETIC FIXTURE — NOT MARKET DATA";
    provider: "marketpulse-fixture";
    asOf: null;
  };
}

export function queryError(query: string): string | null {
  if (Array.from(query).length > 100) return "Vui lòng nhập tối đa 100 ký tự.";
  if (!query.normalize("NFD").replace(/\p{M}/gu, "").trim()) {
    return "Vui lòng nhập mã cổ phiếu hoặc tên doanh nghiệp.";
  }
  return null;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validSource(value: unknown): value is string {
  if (!nonblank(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isSearchResponse(value: unknown): value is SearchResponse {
  if (!record(value) || !record(value.meta) || !Array.isArray(value.data)) return false;
  const meta = value.meta;
  if (meta.scope !== "fixture equities" || meta.dataset !== "fixture / unknown"
    || meta.label !== "SYNTHETIC FIXTURE — NOT MARKET DATA"
    || meta.provider !== "marketpulse-fixture" || meta.asOf !== null || value.data.length > 10) return false;
  const ids = new Set<string>();
  return value.data.every((result: unknown) => {
    if (!record(result) || !record(result.asset) || !record(result.reference)) return false;
    const asset = result.asset;
    const reference = result.reference;
    if (typeof asset.symbol !== "string" || !/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(asset.symbol)
      || !["HOSE", "HNX", "UPCOM"].includes(String(asset.exchange))
      || asset.assetId !== `VN:${asset.exchange}:${asset.symbol}`
      || asset.assetType !== "equity" || asset.currency !== "VND" || asset.unit !== "VND"
      || asset.timezone !== "Asia/Ho_Chi_Minh" || ids.has(String(asset.assetId))) return false;
    ids.add(String(asset.assetId));
    return nonblank(result.companyName)
      && Array.isArray(result.aliases) && result.aliases.every(nonblank)
      && Array.isArray(reference.officialSources) && reference.officialSources.length > 0
      && reference.officialSources.every(validSource) && validDate(reference.reviewedOn);
  });
}

export type SearchErrorKind = "invalid" | "unavailable" | "timeout" | "network" | "response";

export class SearchError extends Error {
  constructor(public readonly kind: SearchErrorKind) {
    super(kind);
  }
}

export async function fetchSearch(
  query: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<SearchResponse> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await request(`/api/assets/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.any([signal, timeout.signal]),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (response.status === 400) throw new SearchError("invalid");
    if (!response.ok) throw new SearchError("unavailable");
    let body: unknown;
    try { body = await response.json(); } catch { throw new SearchError("response"); }
    if (!isSearchResponse(body)) throw new SearchError("response");
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.signal.aborted) throw new SearchError("timeout");
    if (error instanceof SearchError) throw error;
    throw new SearchError("network");
  } finally {
    clearTimeout(timer);
  }
}

export function errorMessage(error: unknown): string {
  switch (error instanceof SearchError ? error.kind : "network") {
    case "invalid": return "Nội dung tìm kiếm chưa hợp lệ. Vui lòng nhập từ 1 đến 100 ký tự.";
    case "timeout": return "Tìm kiếm mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.";
    case "response": return "Chưa thể đọc thông tin doanh nghiệp. Vui lòng thử lại.";
    case "unavailable": return "Tìm kiếm tạm thời chưa sẵn sàng. Vui lòng thử lại.";
    default: return "Không thể kết nối để tìm kiếm. Kiểm tra kết nối và thử lại.";
  }
}

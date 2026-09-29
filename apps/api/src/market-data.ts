export interface HistoryRange {
  from: string | null;
  to: string | null;
}

export interface CanonicalAsset {
  assetId: string;
  symbol: string;
  assetType: "equity" | "index";
  exchange: "HOSE" | "HNX" | "UPCOM" | "INDEX";
  currency: "VND" | null;
  unit: "VND" | "index_point";
  timezone: "Asia/Ho_Chi_Minh";
}

export interface CanonicalCandle {
  assetId: string;
  interval: "1d";
  tradingDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  volumeUnit: "shares" | "not_available";
  currency: "VND" | null;
  unit: "VND" | "index_point";
  adjustmentBasis: "unadjusted" | "split_adjusted" | "total_return_adjusted" | "not_applicable";
  timezone: "Asia/Ho_Chi_Minh";
  asOf: string;
  ingestedAt: string;
  source: {
    provider: string;
    mode: "fixture" | "observed";
    recordId: string;
  };
}

export interface CanonicalDataset {
  mode: "fixture" | "observed";
  label: string;
  freshness: "fixture / unknown" | "unknown" | "delayed" | "current";
  sessionCalendar: "unverified" | "verified";
}

export interface DailyHistoryRequest {
  symbol: string;
  interval: "1d";
  range: HistoryRange;
}

export interface DailyHistorySeries {
  dataset: CanonicalDataset;
  asset: CanonicalAsset;
  candles: CanonicalCandle[];
  availableRange: HistoryRange;
}

export interface MarketDataProvider {
  getDailyHistory(request: DailyHistoryRequest): Promise<DailyHistorySeries | null>;
}

export interface AssetCatalogProvider {
  getAssets(): Promise<CanonicalAsset[]>;
}

export class MarketDataUnavailableError extends Error {
  constructor() {
    super("Market data is unavailable.");
    this.name = "MarketDataUnavailableError";
  }
}

import type { ProviderErrorCode, ProviderId } from "@/lib/providers/types";

export type CoinStage = "bonding" | "graduated" | "pool" | "unknown";
export type CoinFidelity =
  | "canonical-finalized"
  | "canonical-confirmed"
  | "canonical-reconstructed"
  | "indexed"
  | "market-derived"
  | "unavailable";

export interface CoinProvenance {
  sourceId: ProviderId;
  role:
    | "canonical-launch"
    | "canonical-graduation"
    | "accelerated-discovery"
    | "paid-profile-discovery"
    | "market-enrichment"
    | "price-enrichment"
    | "stored-observation";
  fidelity: CoinFidelity;
  eventAt: string | null;
  observedAt: string;
  availableAt: string;
  retrievedAt: string;
  signature?: string;
  slot?: number;
  missingReason?: string;
}

export interface CoinMissingField {
  field: string;
  reason: string;
  sourceId?: ProviderId;
}

export interface CoinMarketSnapshot {
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  buys24h: number | null;
  sells24h: number | null;
  priceChange24hPct: number | null;
  pairAddress: string | null;
  dexId: string | null;
  pairCreatedAt: string | null;
  observedAt: string | null;
}

export interface CoinResearchSummary {
  status: "predicted" | "features-only";
  referenceClock: "launch" | "graduation";
  cutoffSeconds: number;
  decisionAt: string;
  probability: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  modelVersion: string | null;
  coordinationEvidence0To100: number | null;
  grossRoundTripRetentionPct: number | null;
  roundTripRetentionPct: number | null;
  evidenceCoveragePct: number | null;
}

export interface CoinListItem {
  mint: string;
  name: string | null;
  symbol: string | null;
  imageUri: string | null;
  metadataUri: string | null;
  creator: string | null;
  createdAt: string | null;
  createdSlot: number | null;
  creationSignature: string | null;
  canonicalConfirmed: boolean;
  lifecycle: {
    venue: "pump" | "pump-swap" | "unknown";
    stage: CoinStage;
    graduatedAt: string | null;
    poolAddress: string | null;
  };
  market: CoinMarketSnapshot;
  /** Latest persisted point-in-time result. Absent means no audited snapshot exists. */
  research?: CoinResearchSummary;
  provenance: CoinProvenance[];
  missing: CoinMissingField[];
}

export interface CoinObservation {
  id: string;
  mint: string;
  sourceId: ProviderId;
  observationType: string;
  eventAt: string;
  observedAt: string | null;
  availableAt: string | null;
  retrievedAt: string;
  slot: number | null;
  transactionIndex: number | null;
  instructionIndex: number | null;
  commitment: string | null;
  canonicalStatus: string;
  fidelity: CoinFidelity;
  signature: string | null;
  normalized: Record<string, unknown>;
  nullReason: string | null;
}

export interface StorageState {
  state: "written" | "read-only" | "unavailable" | "failed";
  reason: string | null;
  assetsWritten?: number;
  observationsWritten?: number;
}

export interface DiscoveryCoverage {
  sourceId: ProviderId;
  signaturesScanned: number;
  transactionsRequested: number;
  transactionsDecoded: number;
  exactCreatesFound: number;
  exactMigrationsFound: number;
  newestEventAt: string | null;
  oldestEventAt: string | null;
  partial: boolean;
  errorCode?: ProviderErrorCode;
  missingReason?: string;
}

export interface CoinsCursor {
  rpcBefore?: string;
  pumpSwapBefore?: string;
  trackerPage?: number;
}

export interface CoinsListResponse {
  generatedAt: string;
  coins: CoinListItem[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  ingestion: {
    requestedSource: "auto" | "rpc" | "tracker";
    discoverySources: ProviderId[];
    coverage: DiscoveryCoverage[];
    storage: StorageState;
    warnings: string[];
  };
}

export interface CoinHistoryCoverage {
  signaturesScanned: number;
  transactionsDecoded: number;
  oldestEventAt: string | null;
  newestEventAt: string | null;
  partial: boolean;
  missingReasons: string[];
}

export interface CoinDetailResponse {
  generatedAt: string;
  coin: CoinListItem;
  observations: CoinObservation[];
  historyCoverage: CoinHistoryCoverage;
  storage: StorageState;
  warning: string;
}

export interface BackfillResponse {
  startedAt: string;
  completedAt: string;
  request: {
    before: string | null;
    until: string | null;
    maxPages: number;
    signaturesPerPage: number;
    maxAssets: number;
    historyPerAsset: number;
    maxHistoryAssets: number;
    dryRun: boolean;
  };
  assetsDiscovered: number;
  observationsDiscovered: number;
  nextBefore: string | null;
  coverage: DiscoveryCoverage[];
  storage: StorageState;
  warnings: string[];
}

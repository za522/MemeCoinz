import type {
  CoinListItem,
  CoinObservation,
  StorageState,
} from "@/lib/coins/types";
import type {
  HeliusAddressHistoryData,
  JitoTipEvidenceData,
  JupiterRoundTripProbe,
  ProviderErrorCode,
  ProviderId,
  SolanaTrackerBundlersData,
  SolanaTrackerDeployerHistoryData,
  SolanaTrackerHolderChartData,
  SolanaTrackerHoldersData,
  SolanaTrackerRiskSnapshotData,
  SolanaTrackerTradesData,
  XContractCountsData,
  XPostSearchData,
} from "@/lib/providers/types";

export type CollectionProviderState =
  | "collected"
  | "partial"
  | "skipped-disabled"
  | "skipped-not-configured"
  | "failed";

export interface CollectionProviderResult<T> {
  providerId: ProviderId;
  state: CollectionProviderState;
  metered: boolean;
  configured: boolean;
  startedAt: string;
  completedAt: string;
  data: T | null;
  itemsCollected: number;
  pagesFetched: number;
  truncated: boolean;
  errorCode: ProviderErrorCode | null;
  caveats: string[];
}

export interface XTokenCollectionData {
  posts: XPostSearchData | null;
  counts: XContractCountsData | null;
  componentErrors: {
    posts: ProviderErrorCode | null;
    counts: ProviderErrorCode | null;
  };
}

export interface SolanaTrackerTokenCollectionData {
  trades: SolanaTrackerTradesData | null;
  holders: SolanaTrackerHoldersData | null;
  holderChart: SolanaTrackerHolderChartData | null;
  bundlers: SolanaTrackerBundlersData | null;
  risk: SolanaTrackerRiskSnapshotData | null;
  deployerHistory: SolanaTrackerDeployerHistoryData | null;
  componentErrors: {
    trades: ProviderErrorCode | null;
    holders: ProviderErrorCode | null;
    holderChart: ProviderErrorCode | null;
    bundlers: ProviderErrorCode | null;
    risk: ProviderErrorCode | null;
    deployerHistory: ProviderErrorCode | "missing_deployer" | null;
  };
}

export interface TokenCollectionOptions {
  from: string;
  to: string;
  maxPages?: number;
  orderSizesUsd?: number[];
  slippageBps?: number;
  identity?: {
    fullName?: string | null;
    officialUrls?: string[];
  };
  /**
   * Explicit caller authorization for credentialed calls. The global cost
   * gate must also be true. Defaults false so public/internal GET paths cannot
   * accidentally burn quota merely because deployment credentials exist.
   */
  allowMetered?: boolean;
  /**
   * Existing canonical/indexed asset row supplied by the caller. Collection
   * writes use the existing ingestion persistence path only when this exists.
   */
  persistCoin?: CoinListItem | null;
}

export interface TokenCollectionResponse {
  schemaVersion: "memetrace-token-collection/v1";
  mint: string;
  generatedAt: string;
  window: {
    from: string;
    to: string;
    endExclusive: true;
    maxPagesPerProvider: number;
  };
  policy: {
    scraping: "disabled";
    trading: "disabled";
    transactionSubmission: "disabled";
    meteredProvidersEnabled: boolean;
    note: string;
  };
  providers: {
    helius: CollectionProviderResult<HeliusAddressHistoryData>;
    solanaTracker: CollectionProviderResult<SolanaTrackerTokenCollectionData>;
    x: CollectionProviderResult<XTokenCollectionData>;
    jupiter: CollectionProviderResult<JupiterRoundTripProbe[]>;
    jito: CollectionProviderResult<JitoTipEvidenceData>;
  };
  coinObservations: CoinObservation[];
  persistence: StorageState;
  warnings: string[];
}

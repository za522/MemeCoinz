export type ProviderId =
  | "solana-rpc"
  | "dex-screener"
  | "helius"
  | "solana-tracker"
  | "x-api"
  | "jupiter"
  | "pump-onchain"
  | "jito"
  | "pump-fun-ui"
  | "fomo-family"
  | "photon"
  | "memescope-net";

export type ProviderCategory =
  | "ledger"
  | "market-data"
  | "indexer"
  | "social"
  | "execution"
  | "launchpad"
  | "mev"
  | "reference-interface";

export type ProviderAccess =
  | "public"
  | "public-rate-limited"
  | "credentialed"
  | "manual-only";

export type ProviderConnectionState =
  | "connected"
  | "degraded"
  | "configured-unverified"
  | "not-configured"
  | "manual-only"
  | "disabled";

export type ProviderCapability =
  | "network-health"
  | "canonical-transactions"
  | "token-supply"
  | "token-metadata"
  | "token-discovery"
  | "pool-market-data"
  | "paid-attention"
  | "holder-analytics"
  | "creator-history-inputs"
  | "risk-labels"
  | "historical-address-transactions"
  | "recent-social-counts"
  | "full-archive-social-counts"
  | "filtered-social-stream"
  | "live-price"
  | "execution-quote"
  | "launch-program-events"
  | "bundle-evidence"
  | "manual-cross-check";

export type ProviderHistoricalCoverage =
  | "canonical-archive"
  | "vendor-archive"
  | "mixed"
  | "live-only"
  | "none";

export type ProviderErrorCode =
  | "timeout"
  | "network_error"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "upstream_error"
  | "invalid_response"
  | "not_configured"
  | "not_supported";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  category: ProviderCategory;
  access: ProviderAccess;
  automated: boolean;
  officialUrl: string;
  documentationUrl: string | null;
  environmentVariable: string | null;
  statusMethod: "live-health-check" | "configuration-check" | "policy-disabled";
  interfaces: string[];
  historicalCoverage: ProviderHistoricalCoverage;
  capabilities: ProviderCapability[];
  collects: string[];
  limitations: string[];
  commercialUseNote: string;
  implementationNote?: string;
}

export interface ProviderStatus {
  state: ProviderConnectionState;
  configured: boolean;
  checkedAt: string;
  latencyMs: number | null;
  message: string;
  errorCode?: ProviderErrorCode;
  retryAfterSeconds?: number;
}

export interface ProviderRegistryEntry extends ProviderDefinition {
  status: ProviderStatus;
}

export interface SourceRegistryResponse {
  generatedAt: string;
  policy: {
    scraping: "disabled";
    secrets: "server-only";
    liveTrading: "disabled";
    note: string;
  };
  sources: ProviderRegistryEntry[];
}

export interface UpstreamSuccess<T> {
  ok: true;
  data: T;
  checkedAt: string;
  latencyMs: number;
  httpStatus: number;
}

export interface UpstreamFailure {
  ok: false;
  code: ProviderErrorCode;
  checkedAt: string;
  latencyMs: number;
  httpStatus: number | null;
  retryAfterSeconds?: number;
}

export type UpstreamResult<T> = UpstreamSuccess<T> | UpstreamFailure;

export interface SolanaHealthData {
  health: string;
  slot: number;
  rpcMode: "public-mainnet" | "configured-mainnet";
}

export interface SolanaTokenSupply {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString: string;
  contextSlot: number;
}

export interface DexTokenIdentity {
  address: string;
  name: string;
  symbol: string;
}

export interface DexPairSnapshot {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string | null;
  baseToken: DexTokenIdentity;
  quoteToken: DexTokenIdentity;
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  pairCreatedAt: number | null;
  activeBoosts: number | null;
  volume: Record<string, number>;
  priceChange: Record<string, number>;
  transactions: Record<string, { buys: number; sells: number }>;
  websites: string[];
  socials: Array<{ platform: string; handle: string }>;
}

export interface DexPaidOrder {
  type: string;
  status: string;
  paymentTimestamp: number | null;
}

export interface DexTokenData {
  pairs: DexPairSnapshot[];
  paidOrders: DexPaidOrder[];
}

export interface JupiterPriceData {
  mint: string;
  usdPrice: number | null;
  decimals: number | null;
  blockId: number | null;
  priceChange24hPct: number | null;
}

export interface HeliusAssetData {
  id: string;
  interface: string | null;
  name: string | null;
  symbol: string | null;
  description: string | null;
  jsonUri: string | null;
  imageUri: string | null;
  owner: string | null;
  frozen: boolean | null;
  burnt: boolean | null;
  tokenSupply: string | null;
  decimals: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lastIndexedSlot: number | null;
}

export interface SolanaTrackerTokenData {
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  description: string | null;
  creator: string | null;
  createdTransaction: string | null;
  createdAtUnix: number | null;
  holders: number | null;
  buys: number | null;
  sells: number | null;
  transactions: number | null;
  riskScore: number | null;
  pools: Array<{
    poolAddress: string;
    market: string | null;
    liquidityUsd: number | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    lpBurnPct: number | null;
  }>;
}

export interface XCountBucket {
  start: string;
  end: string;
  postCount: number;
}

export interface XRecentCountsData {
  query: string;
  totalPostCount: number;
  granularity: "minute" | "hour" | "day";
  buckets: XCountBucket[];
}

export interface TokenEnrichmentProvider<T> {
  providerId: ProviderId;
  status: ProviderStatus;
  data: T | null;
}

export interface TokenEnrichmentResponse {
  mint: string;
  generatedAt: string;
  meteredProvidersEnabled: boolean;
  warning: string;
  providers: {
    solana: TokenEnrichmentProvider<SolanaTokenSupply>;
    dexScreener: TokenEnrichmentProvider<DexTokenData>;
    jupiter: TokenEnrichmentProvider<JupiterPriceData>;
    helius: TokenEnrichmentProvider<HeliusAssetData>;
    solanaTracker: TokenEnrichmentProvider<SolanaTrackerTokenData>;
    xRecentCounts: TokenEnrichmentProvider<XRecentCountsData>;
  };
}

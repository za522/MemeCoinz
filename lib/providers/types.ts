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
  mint: string;
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
  tokenAddress: string | null;
  type: string;
  status: string;
  paymentTimestamp: number | null;
}

export interface DexTokenProfile {
  tokenAddress: string;
  chainId: string;
  url: string | null;
  icon: string | null;
  header: string | null;
  description: string | null;
  links: Array<{ type: string | null; label: string | null; url: string }>;
}

export interface DexComponentAvailability {
  available: boolean;
  checkedAt: string;
  latencyMs: number;
  httpStatus: number | null;
  errorCode?: ProviderErrorCode;
  retryAfterSeconds?: number;
}

export interface DexTokenData {
  pairs: DexPairSnapshot[];
  paidOrders: DexPaidOrder[];
  availability: {
    pairs: DexComponentAvailability;
    paidOrders: DexComponentAvailability;
  };
}

export interface JupiterPriceData {
  mint: string;
  found: boolean;
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

export interface SolanaTrackerLatestToken extends SolanaTrackerTokenData {
  metadataUri: string | null;
  createdOn: string | null;
  curvePercentage: number | null;
  latestPoolMarket: string | null;
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

export type XArchiveMode = "recent" | "full-archive";

export interface XIdentityQuery {
  contractAddress: string;
  fullName?: string | null;
  officialUrls?: string[];
}

export interface XPostPublicMetrics {
  retweetCount: number | null;
  replyCount: number | null;
  likeCount: number | null;
  quoteCount: number | null;
  bookmarkCount: number | null;
  impressionCount: number | null;
}

export interface XPostRecord {
  id: string;
  authorId: string | null;
  createdAt: string;
  text: string | null;
  lang: string | null;
  identityMatches: Array<"exact-contract" | "official-url" | "full-name">;
  publicMetrics: XPostPublicMetrics;
  /** X returns these counters as they exist when queried, not as they stood at createdAt. */
  publicMetricsObservedAt: string;
  author: {
    username: string | null;
    name: string | null;
    verified: boolean | null;
    followersCount: number | null;
    /** User profile metrics are mutable and are never backdated to the post timestamp. */
    profileObservedAt: string;
  } | null;
}

export interface XPostSearchData {
  query: string;
  mode: XArchiveMode;
  requestedStart: string;
  requestedEnd: string;
  posts: XPostRecord[];
  pagesFetched: number;
  nextToken: string | null;
  truncated: boolean;
  caveat: string;
}

export interface XContractCountsData extends XRecentCountsData {
  mode: XArchiveMode;
  requestedStart: string;
  requestedEnd: string;
  /** Exact identity clauses actually present in the aggregate query. */
  identityClasses: Array<"exact-contract" | "official-url" | "full-name">;
  pagesFetched: number;
  nextToken: string | null;
  truncated: boolean;
}

export interface HeliusTokenBalanceChange {
  accountIndex: number;
  owner: string | null;
  mint: string;
  decimals: number | null;
  preRawAmount: string | null;
  postRawAmount: string | null;
  rawDelta: string | null;
  uiDelta: number | null;
}

export interface HeliusHistoricalTransaction {
  signature: string;
  slot: number;
  transactionIndex: number | null;
  blockTime: number | null;
  confirmationStatus: string | null;
  success: boolean;
  feeLamports: number | null;
  feePayer: string | null;
  accountKeys: string[];
  nativeBalanceChanges: Array<{
    account: string;
    preLamports: number;
    postLamports: number;
    deltaLamports: number;
  }>;
  tokenBalanceChanges: HeliusTokenBalanceChange[];
  /** Lossless provider row for durable raw-object storage. Never expose secrets. */
  raw: Record<string, unknown>;
}

export interface HeliusAddressHistoryData {
  address: string;
  requestedFrom: string;
  requestedTo: string;
  commitment: "confirmed" | "finalized";
  transactions: HeliusHistoricalTransaction[];
  pagesFetched: number;
  nextPaginationToken: string | null;
  truncated: boolean;
  caveat: string;
}

export interface SolanaTrackerTrade {
  signature: string;
  side: "buy" | "sell" | null;
  wallet: string | null;
  tokenAmount: number | null;
  priceUsd: number | null;
  volumeUsd: number | null;
  volumeSol: number | null;
  eventAt: string;
  program: string | null;
  pools: string[];
  /** Lossless normalized source row for audit/debugging. */
  raw: Record<string, unknown>;
}

export interface SolanaTrackerTradesData {
  mint: string;
  requestedFrom: string;
  requestedTo: string;
  trades: SolanaTrackerTrade[];
  pagesFetched: number;
  nextCursor: string | null;
  truncated: boolean;
  caveat: string;
}

export interface SolanaTrackerHolder {
  wallet: string;
  tokenAccount: string | null;
  amount: number | null;
  valueUsd: number | null;
  percentage: number | null;
}

export interface SolanaTrackerHoldersData {
  mint: string;
  totalHolders: number | null;
  holders: SolanaTrackerHolder[];
  pagesFetched: number;
  nextCursor: string | null;
  truncated: boolean;
  asOf: string;
  caveat: string;
}

export interface SolanaTrackerHolderChartPoint {
  holderCount: number;
  eventAt: string;
}

export interface SolanaTrackerHolderChartData {
  mint: string;
  requestedFrom: string;
  requestedTo: string;
  interval: string;
  points: SolanaTrackerHolderChartPoint[];
  caveat: string;
}

export interface SolanaTrackerBundlerWallet {
  wallet: string;
  initialBalance: number | null;
  initialPercentage: number | null;
  currentBalance: number | null;
  currentPercentage: number | null;
  bundleAt: string | null;
}

export interface SolanaTrackerBundlersData {
  mint: string;
  count: number | null;
  totalBalance: number | null;
  totalPercentage: number | null;
  totalInitialBalance: number | null;
  totalInitialPercentage: number | null;
  wallets: SolanaTrackerBundlerWallet[];
  asOf: string;
  caveat: string;
  raw: Record<string, unknown>;
}

export interface SolanaTrackerRiskFactor {
  name: string | null;
  description: string | null;
  level: string | null;
  score: number | null;
}

export interface SolanaTrackerRiskSnapshotData {
  mint: string;
  score: number | null;
  rugged: boolean | null;
  deployer: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topTenPercentage: number | null;
  developerPercentage: number | null;
  insiderPercentage: number | null;
  sniperPercentage: number | null;
  bundlerCount: number | null;
  bundlerPercentage: number | null;
  factors: SolanaTrackerRiskFactor[];
  asOf: string;
  caveat: string;
  raw: Record<string, unknown>;
}

export interface SolanaTrackerDeployerToken {
  mint: string;
  name: string | null;
  symbol: string | null;
  createdAt: string | null;
  graduated: boolean | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
}

export interface SolanaTrackerDeployerHistoryData {
  wallet: string;
  tokens: SolanaTrackerDeployerToken[];
  pagesFetched: number;
  nextPage: number | null;
  truncated: boolean;
  total: number | null;
  asOf: string;
  caveat: string;
}

export interface JupiterQuoteRouteLeg {
  ammKey: string | null;
  label: string | null;
  inputMint: string | null;
  outputMint: string | null;
  inAmount: string | null;
  outAmount: string | null;
  feeAmount: string | null;
  feeMint: string | null;
  percent: number | null;
}

export interface JupiterQuoteProbe {
  side: "buy" | "sell";
  requestedAt: string;
  completedAt: string;
  latencyMs: number;
  routeAvailable: boolean;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string | null;
  otherAmountThreshold: string | null;
  priceImpactPct: number | null;
  contextSlot: number | null;
  providerTimeTakenSeconds: number | null;
  routePlan: JupiterQuoteRouteLeg[];
  failureCode: ProviderErrorCode | "no_route" | null;
}

export interface JupiterRoundTripProbe {
  mint: string;
  orderSizeUsd: number;
  slippageBps: number;
  buy: JupiterQuoteProbe;
  sell: JupiterQuoteProbe | null;
  expectedRoundTripUsd: number | null;
  roundTripRetentionPct: number | null;
  observedAt: string;
  endpointMode: "keyed" | "public-lite";
  caveat: string;
}

export interface JitoTipFloorPoint {
  eventAt: string;
  landedTips25thPercentileSol: number | null;
  landedTips50thPercentileSol: number | null;
  landedTips75thPercentileSol: number | null;
  landedTips95thPercentileSol: number | null;
  landedTips99thPercentileSol: number | null;
  emaLandedTips50thPercentileSol: number | null;
}

export interface JitoTipEvidenceData {
  observedAt: string;
  tipAccounts: string[];
  latestTipFloor: JitoTipFloorPoint | null;
  availability: {
    tipAccounts: boolean;
    tipFloor: boolean;
  };
  caveat: string;
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
  confirmation: {
    confirmed: boolean;
    confirmingProviderIds: ProviderId[];
  };
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

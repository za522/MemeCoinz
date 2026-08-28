/**
 * Provider-neutral contracts for point-in-time feature engineering.
 *
 * `eventAt` is when something happened. `availableAt` is when the collector
 * could first have used it. Both must be at or before a feature cutoff.
 */

export type ISODateTime = string;

export const FEATURE_CUTOFF_SECONDS = [30, 60, 300, 900, 3_600] as const;
export type FeatureCutoffSeconds = (typeof FEATURE_CUTOFF_SECONDS)[number];

export type EvidenceFidelity = "exact" | "reconstructed" | "proxy";
export type CollectionStatus = "complete" | "partial" | "unavailable";

export type FeatureFamily =
  | "lifecycleFlow"
  | "liquidityExecution"
  | "ownershipCreator"
  | "coordinationWash"
  | "narrativePaidAttention"
  | "marketRegime";

export interface TimestampedEvidence {
  id: string;
  eventAt: ISODateTime;
  availableAt: ISODateTime;
  sourceId: string;
  fidelity: EvidenceFidelity;
  /** False records are retained for audits but excluded from features. */
  canonical?: boolean;
}

export interface FamilyCoverage {
  family: FeatureFamily;
  status: CollectionStatus;
  eventFrom?: ISODateTime;
  eventThrough?: ISODateTime;
  notes?: string[];
}

export interface LaunchRecord extends TimestampedEvidence {
  mint: string;
  creatorWallet: string;
  launchedAt: ISODateTime;
  graduationAt?: ISODateTime;
}

export type TradeSide = "buy" | "sell";

export type WashEvidenceTag =
  | "same-beneficial-owner"
  | "repeated-back-and-forth"
  | "circular-funding"
  | "self-match";

export interface TradeObservation extends TimestampedEvidence {
  signature: string;
  wallet: string;
  side: TradeSide;
  /** Null when the transaction was not USD-normalized as of the cutoff. */
  volumeUsd: number | null;
  tokenAmount: number | null;
  priceUsd: number | null;
  slot: number;
  transactionOrder?: number;
  feePayer: string;
  networkAndPriorityFeeUsd: number | null;
  /** Exact when supplied by an authoritative bundle source; otherwise omit. */
  exactBundleId?: string;
  /** A proxy clue must never be displayed as an exact bundle. */
  bundleClue?: boolean;
  priorSharedLaunchCount?: number;
  washEvidenceTags?: WashEvidenceTag[];
}

export type TransferPurpose = "funding" | "token-transfer" | "other";
export type CounterpartyClassification =
  | "ordinary"
  | "exchange"
  | "popular-bot"
  | "unknown";

export interface TransferObservation extends TimestampedEvidence {
  signature: string;
  fromWallet: string;
  toWallet: string;
  amountUsd: number;
  slot: number;
  purpose: TransferPurpose;
  counterpartyClassification: CounterpartyClassification;
  circularFlowClue?: boolean;
}

/** Vendor/indexer classifications kept separate from wallet-level evidence. */
export interface CoordinationProxySnapshot extends TimestampedEvidence {
  provider: string;
  bundlerWalletCount: number | null;
  bundledSupplySharePct: number | null;
  initialBundledSupplySharePct: number | null;
  riskScore0To100: number | null;
  insiderSupplySharePct: number | null;
  sniperSupplySharePct: number | null;
  ruggedFlag: boolean | null;
  classificationCaveat: string;
}

export interface MarketObservation extends TimestampedEvidence {
  priceUsd: number;
  marketCapUsd: number;
  bondingCurveProgressPct: number | null;
  graduated: boolean;
  cumulativeBuyVolumeUsd?: number;
  cumulativeSellVolumeUsd?: number;
  cumulativeBuyCount?: number;
  cumulativeSellCount?: number;
  liquidityUsd?: number;
  quoteReserveUsd?: number;
}

export interface HolderBalance {
  ownerWallet: string;
  sharePct: number;
  isCreator?: boolean;
  isKnownProgramAccount?: boolean;
}

export interface HolderSnapshot extends TimestampedEvidence {
  holderCount: number;
  /** Owner-resolved shares. Known program accounts are excluded by the engine. */
  balances: HolderBalance[];
  creatorSharePct: number | null;
  ownerResolutionCoveragePct: number;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  metadataMutable: boolean | null;
}

export interface CreatorObservation extends TimestampedEvidence {
  currentSharePct: number | null;
  cumulativeNetSoldUsd: number | null;
  cumulativeFeeExtractionUsd: number | null;
  priorLaunchCount: number | null;
  priorGraduationCount: number | null;
  priorTwentyFourHourSurvivorCount: number | null;
}

export type QuoteSide = "buy" | "sell";

export interface QuoteObservation extends TimestampedEvidence {
  side: QuoteSide;
  orderSizeUsd: number;
  routeAvailable: boolean;
  priceImpactPct: number | null;
  networkAndPriorityFeeUsd: number | null;
  /** Net USD received for sells; USD-equivalent token value for buys. */
  expectedValueUsd: number | null;
  latencyMs: number | null;
}

export type SocialIdentityMatch =
  | "exact-contract"
  | "official-url"
  | "full-name"
  | "ticker-only";

export interface SocialPostObservation extends TimestampedEvidence {
  platformPostId: string;
  authorId: string;
  identityMatch: SocialIdentityMatch;
  automatedLikelihood0To1: number | null;
  sentimentMinus1To1: number | null;
  authorFollowers: number | null;
  authorVerified: boolean | null;
  engagementCount: number | null;
  narrativeClusterId: string | null;
  narrativeNovelty0To100: number | null;
}

/** Aggregate exact-identity counts; not interchangeable with enumerated posts. */
export interface SocialCountObservation extends TimestampedEvidence {
  bucketStart: ISODateTime;
  bucketEnd: ISODateTime;
  postCount: number;
  identityClasses: Array<"exact-contract" | "official-url" | "full-name">;
  manipulationCaveat: string;
}

export interface PaidAttentionObservation extends TimestampedEvidence {
  channel: string;
  spendUsd: number | null;
  boostCount: number;
  trendingRank: number | null;
}

/** Deterministic launch-metadata narrative; distinct from social-post evidence. */
export interface MetadataNarrativeObservation extends TimestampedEvidence {
  theme: string;
  matchedTokens: string[];
  themeConfidence0To100: number;
  metadataCompleteness0To100: number;
  socialLinkCount: number | null;
}

export type RegimeLabel = "risk-on" | "neutral" | "congested" | "risk-off";

export interface MarketRegimeObservation extends TimestampedEvidence {
  solReturnOneHourPct: number;
  solVolatilityOneHourPct: number;
  medianPriorityFeeMicroLamports: number;
  blockCongestionPct: number;
  launchesLastHour: number;
  medianLaunchVolumeFiveMinutesUsd: number;
  riskAppetite0To100: number;
  label: RegimeLabel;
}

export interface PointInTimeInput {
  launch: LaunchRecord;
  coverage: FamilyCoverage[];
  market: MarketObservation[];
  trades: TradeObservation[];
  transfers: TransferObservation[];
  coordinationProxies?: CoordinationProxySnapshot[];
  holders: HolderSnapshot[];
  creators: CreatorObservation[];
  quotes: QuoteObservation[];
  socialPosts: SocialPostObservation[];
  socialCounts?: SocialCountObservation[];
  metadataNarrative?: MetadataNarrativeObservation[];
  paidAttention: PaidAttentionObservation[];
  regimes: MarketRegimeObservation[];
}

export interface LifecycleFlowFeatures {
  tokenAgeSeconds: number;
  secondsSinceGraduation: number | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  priceReturnFromFirstObservationPct: number | null;
  bondingCurveProgressPct: number | null;
  buyVolumeUsd: number | null;
  sellVolumeUsd: number | null;
  netFlowUsd: number | null;
  buySellVolumeImbalance: number | null;
  buyCount: number | null;
  sellCount: number | null;
  uniqueBuyers: number | null;
  uniqueSellers: number | null;
  tradesPerMinute: number | null;
  uniqueBuyersPerMinute: number | null;
  recentToPriorVolumeVelocityRatio: number | null;
  buyVolumeAccelerationUsdPerMinuteSquared: number | null;
}

export interface ExecutionProbeFeatures {
  orderSizeUsd: number;
  buyRouteAvailable: boolean | null;
  sellRouteAvailable: boolean | null;
  buyPriceImpactPct: number | null;
  sellPriceImpactPct: number | null;
  /** Quote-pair retention before unknown network/priority fees. */
  grossRoundTripRetentionPct: number | null;
  roundTripRetentionPct: number | null;
  totalFeesUsd: number | null;
  quoteLatencyMs: number | null;
}

export interface LiquidityExecutionFeatures {
  liquidityUsd: number | null;
  quoteReserveUsd: number | null;
  probes: ExecutionProbeFeatures[];
}

export interface OwnershipCreatorFeatures {
  holderCount: number | null;
  topOneOwnerSharePct: number | null;
  topTenOwnerSharePct: number | null;
  topTwentyOwnerSharePct: number | null;
  ownerHhi: number | null;
  effectiveOwnerCount: number | null;
  ownerResolutionCoveragePct: number | null;
  creatorSharePct: number | null;
  creatorNetSoldUsd: number | null;
  creatorFeeExtractionUsd: number | null;
  creatorPriorGraduationRatePct: number | null;
  creatorPriorSurvivalRatePct: number | null;
  mintAuthorityRevoked: boolean | null;
  freezeAuthorityRevoked: boolean | null;
  metadataMutable: boolean | null;
}

export interface CoordinationWashFeatures {
  earlyBuyerCount: number | null;
  qualifiedCommonFunderClusterCount: number | null;
  qualifiedCommonFunderBuyerPct: number | null;
  ambiguousCommonFunderBuyerPct: number | null;
  recurringEarlyBuyerCohortPct: number | null;
  sameSlotEarlyBuyerPct: number | null;
  sharedFeePayerEarlyBuyerPct: number | null;
  exactBundleEarlyBuyerPct: number | null;
  bundleClueEarlyBuyerPct: number | null;
  synchronizedExitEarlyBuyerPct: number | null;
  circularFlowClueUsd: number | null;
  washEvidenceVolumePct: number | null;
  /** Deterministic evidence index, not proof of coordination or intent. */
  coordinationEvidence0To100: number | null;
  /** Deterministic evidence index, not proof of wash trading or wrongdoing. */
  washEvidence0To100: number | null;
  /** Provider proxy fields are never treated as proof or merged into the evidence indices. */
  indexedBundlerWalletCount: number | null;
  indexedBundledSupplySharePct: number | null;
  indexedInitialBundledSupplySharePct: number | null;
  indexedRiskScore0To100: number | null;
  indexedInsiderSupplySharePct: number | null;
  indexedSniperSupplySharePct: number | null;
  indexedRuggedFlag: boolean | null;
}

export interface NarrativePaidAttentionFeatures {
  metadataTheme: string | null;
  metadataThemeConfidence0To100: number | null;
  metadataCompleteness0To100: number | null;
  metadataSocialLinkCount: number | null;
  postCount: number | null;
  postsPerMinute: number | null;
  recentToPriorPostVelocityRatio: number | null;
  postAccelerationPerMinuteSquared: number | null;
  uniqueAuthorCount: number | null;
  uniqueAuthorRatioPct: number | null;
  exactIdentityMentionRatioPct: number | null;
  likelyAutomatedPostRatioPct: number | null;
  sentimentMean: number | null;
  sentimentCoveragePct: number | null;
  influentialAuthorMentionCount: number | null;
  narrativeClusterCount: number | null;
  meanNarrativeNovelty0To100: number | null;
  paidBoostCount: number | null;
  knownPaidExposureUsd: number | null;
  bestTrendingRank: number | null;
  /** Aggregate exact-identity counts kept separate from enumerated-post metrics. */
  indexedExactIdentityPostCount: number | null;
  indexedExactIdentityPostsPerMinute: number | null;
  indexedExactIdentityRecentToPriorVelocityRatio: number | null;
}

export interface MarketRegimeFeatures {
  solReturnOneHourPct: number | null;
  solVolatilityOneHourPct: number | null;
  medianPriorityFeeMicroLamports: number | null;
  blockCongestionPct: number | null;
  launchesLastHour: number | null;
  medianLaunchVolumeFiveMinutesUsd: number | null;
  riskAppetite0To100: number | null;
  label: RegimeLabel | null;
}

export interface FamilyEvidenceQuality {
  status: CollectionStatus;
  coveragePct: number;
  selectedRecordCount: number;
  exactRecordCount: number;
  reconstructedRecordCount: number;
  proxyRecordCount: number;
  sourceCount: number;
  latestAvailableLagSeconds: number | null;
  missingFields: string[];
  notes: string[];
}

export interface EvidenceQualityFeatures {
  overallCoveragePct: number;
  exactRecordRatioPct: number | null;
  reconstructedRecordRatioPct: number | null;
  proxyRecordRatioPct: number | null;
  sourceCount: number;
  missingFieldCount: number;
  byFamily: Record<FeatureFamily, FamilyEvidenceQuality>;
}

export interface PointInTimeFeatureVector {
  mint: string;
  cutoffSeconds: FeatureCutoffSeconds;
  cutoffAt: ISODateTime;
  lifecycleFlow: LifecycleFlowFeatures;
  liquidityExecution: LiquidityExecutionFeatures;
  ownershipCreator: OwnershipCreatorFeatures;
  coordinationWash: CoordinationWashFeatures;
  narrativePaidAttention: NarrativePaidAttentionFeatures;
  marketRegime: MarketRegimeFeatures;
  evidenceQuality: EvidenceQualityFeatures;
  sourceIds: string[];
  caveats: string[];
}

export interface PositionExitSample extends TimestampedEvidence {
  /** Net USD available after exit swap and transaction costs. */
  netExitValueUsd: number | null;
  exitRouteAvailable: boolean;
  priceImpactPct: number | null;
}

export interface ExecutablePositionPath {
  id: string;
  mint: string;
  cutoffSeconds: FeatureCutoffSeconds;
  orderSizeUsd: number;
  entryAt: ISODateTime;
  entryAvailableAt: ISODateTime;
  entryRouteAvailable: boolean;
  /** Total cash committed, including entry fees and impact. */
  totalEntryCostUsd: number | null;
  exits: PositionExitSample[];
  coverage: {
    status: CollectionStatus;
    eventThrough: ISODateTime;
    availableAt: ISODateTime;
    fidelity: EvidenceFidelity;
    sourceIds: string[];
  };
}

export interface OutcomeDefinition {
  horizonSeconds: number;
  targetMultiple: number;
  downsideMultiple: number;
}

export interface ExecutableOutcomeLabel {
  mint: string;
  cutoffSeconds: FeatureCutoffSeconds;
  orderSizeUsd: number;
  horizonSeconds: number;
  status: "available" | "pending" | "unavailable";
  labelAvailableAt: ISODateTime;
  targetMultiple: number;
  downsideMultiple: number;
  reachedTargetBeforeDownside: boolean | null;
  maximumNetReturnPct: number | null;
  maximumDrawdownPct: number | null;
  exitabilityPct: number | null;
  exitSucceededAtHorizon: boolean | null;
  observedExitSampleCount: number;
  fidelity: EvidenceFidelity;
  sourceIds: string[];
  caveats: string[];
}

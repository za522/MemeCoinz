/**
 * Research-domain contracts for point-in-time memecoin replay.
 *
 * Numbers in this layer describe evidence and derived research summaries. They
 * are not trade instructions. Every observation carries an availability time
 * so a replay can exclude information that was not knowable at its cutoff.
 */

export type ISODateTime = string;

export type EvidenceFidelity =
  | "exact"
  | "reconstructed"
  | "proxy"
  | "unavailable";

export type SourceKind =
  | "onchain"
  | "launchpad"
  | "market-data"
  | "social"
  | "execution"
  | "derived";

export type SourceStatus = "healthy" | "degraded" | "unavailable";

export type TemporalCoverage = "archive" | "live-only" | "mixed";

export type SolanaCommitment = "processed" | "confirmed" | "finalized";

export type FeaturePillar =
  | "lifecycle-flow"
  | "liquidity-execution"
  | "ownership-creator"
  | "coordination-wash"
  | "narrative-paid-attention"
  | "market-regime"
  | "source-fidelity";

export type CutoffLabel = "30s" | "1m" | "5m" | "15m" | "1h";

export interface ResearchCutoff {
  label: CutoffLabel;
  elapsedSeconds: number;
}

export const RESEARCH_CUTOFFS: readonly ResearchCutoff[] = [
  { label: "30s", elapsedSeconds: 30 },
  { label: "1m", elapsedSeconds: 60 },
  { label: "5m", elapsedSeconds: 300 },
  { label: "15m", elapsedSeconds: 900 },
  { label: "1h", elapsedSeconds: 3_600 },
] as const;

export interface SourceRecord {
  id: string;
  label: string;
  kind: SourceKind;
  status: SourceStatus;
  fidelity: EvidenceFidelity;
  temporalCoverage: TemporalCoverage;
  observedThrough: ISODateTime;
  fields: string[];
  limitation?: string;
  commercialUseNote?: string;
}

export interface ObservationContext {
  /** Seconds after the token creation transaction. */
  elapsedSeconds: number;
  /** When the represented event or state existed. */
  eventTime: ISODateTime;
  /** When our collector first observed the record. */
  observedAt: ISODateTime;
  /** Earliest instant the record is allowed into a point-in-time feature set. */
  availableAt: ISODateTime;
  commitment: SolanaCommitment;
  canonical: boolean;
  fidelity: EvidenceFidelity;
  sourceIds: string[];
}

export interface TokenIdentity {
  chain: "solana";
  launchVenue: "pump.fun";
  contractAddress: string;
  name: string;
  ticker: string;
  creatorAddress: string;
  createdAt: ISODateTime;
  imageUrl?: string;
  officialUrls: string[];
}

export interface LifecycleFlowObservation extends ObservationContext {
  priceUsd: number;
  launchPriceUsd: number;
  marketCapUsd: number;
  bondingCurveProgressPct: number;
  cumulativeBuyVolumeUsd: number;
  cumulativeSellVolumeUsd: number;
  cumulativeBuyCount: number;
  cumulativeSellCount: number;
  cumulativeUniqueBuyers: number;
  cumulativeUniqueSellers: number;
  holderCount: number;
  graduated: boolean;
  migrationPoolAddress?: string;
}

export type ExecutionDirection = "buy" | "sell";

export interface ExecutionQuoteProbe {
  direction: ExecutionDirection;
  notionalUsd: number;
  expectedValueUsd: number;
  priceImpactPct: number;
  networkAndPriorityFeeUsd: number;
  routeAvailable: boolean;
  quoteLatencyMs: number;
}

export interface LiquidityExecutionObservation extends ObservationContext {
  /** USD value of the quote-side reserve; do not confuse with total pool TVL. */
  quoteReserveUsd: number;
  baseReserveTokens: number;
  poolTvlUsd: number;
  routeCount: number;
  executableQuoteProbes: ExecutionQuoteProbe[];
}

export interface AuthorityState {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  metadataMutable: boolean;
  liquidityControlKnown: boolean;
}

export interface CreatorHistory {
  priorLaunchCount: number;
  priorGraduationCount: number;
  priorTwentyFourHourSurvivorCount: number;
  priorSevereDrawdownCount: number;
  medianPriorPeakMultiple: number | null;
}

export interface OwnershipCreatorObservation extends ObservationContext {
  /** Shares by controlling owner wallet, after known program accounts are removed. */
  ownerWalletSharesPct: number[];
  /** Shares by raw token account. One owner can control multiple accounts. */
  tokenAccountSharesPct: number[];
  creatorCurrentSharePct: number;
  creatorNetSoldUsd: number;
  creatorFeeExtractionUsd: number;
  creatorHistory: CreatorHistory;
  authorities: AuthorityState;
}

export interface CoordinationWashObservation extends ObservationContext {
  earlyBuyerCount: number;
  commonFunderClusterCount: number;
  earlyBuyersWithCommonFunderPct: number;
  recurringCohortWalletCount: number;
  recurringCohortBuyerPct: number;
  sameSlotEarlyBuyerPct: number;
  bundledTransactionClueCount: number;
  synchronizedExitPct: number;
  circularFlowUsd: number;
  suspectedWashVolumePct: number;
  selfFundingLoopCount: number;
}

export interface NarrativeCluster {
  id: string;
  label: string;
  postCount: number;
  uniqueAuthorCount: number;
  noveltyScore0To100: number;
}

export interface NarrativePaidAttentionObservation extends ObservationContext {
  cumulativePostCount: number;
  cumulativeUniqueAuthors: number;
  cumulativeExactContractMentions: number;
  cumulativeOfficialUrlMentions: number;
  cumulativeLikelyAutomatedPosts: number;
  verifiedAuthorCount: number;
  paidBoostCount: number;
  paidExposureUsd: number;
  trendingRank: number | null;
  clusters: NarrativeCluster[];
}

export type RegimeLabel =
  | "risk-on"
  | "neutral"
  | "congested"
  | "risk-off";

export interface MarketRegimeObservation extends ObservationContext {
  solReturnOneHourPct: number;
  solRealizedVolatilityOneHourPct: number;
  medianPriorityFeeMicroLamports: number;
  blockCongestionPct: number;
  pumpLaunchesLastHour: number;
  medianLaunchVolumeFiveMinutesUsd: number;
  riskAppetiteScore0To100: number;
  label: RegimeLabel;
}

export interface ExecutableOutcome {
  notionalUsd: number;
  netReturnPct: number;
  exitSucceeded: boolean;
  maximumObservedPriceImpactPct: number;
}

export interface HistoricalOutcome {
  /** Labels are unavailable to training or replay logic before this instant. */
  labelAvailableAt: ISODateTime;
  graduatedAtSeconds: number | null;
  peakPriceMultipleOneHour: number;
  peakPriceMultipleTwentyFourHours: number;
  maximumDrawdownTwentyFourHoursPct: number;
  survivedTwentyFourHours: boolean;
  executableOutcomes: ExecutableOutcome[];
  fidelity: EvidenceFidelity;
  sourceIds: string[];
}

export interface ResearchReplay {
  mode: "illustrative-historical-replay";
  fixtureLabel: string;
  disclaimer: string;
  generatedAt: ISODateTime;
  identity: TokenIdentity;
  sources: SourceRecord[];
  lifecycleFlow: LifecycleFlowObservation[];
  liquidityExecution: LiquidityExecutionObservation[];
  ownershipCreator: OwnershipCreatorObservation[];
  coordinationWash: CoordinationWashObservation[];
  narrativePaidAttention: NarrativePaidAttentionObservation[];
  marketRegime: MarketRegimeObservation[];
  historicalOutcome: HistoricalOutcome;
}

export type ScoreBand = "low" | "moderate" | "high" | "very-high";

export interface ScoreComponent {
  key: string;
  label: string;
  rawValue: number;
  normalized0To100: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface IllustrativeAssessment {
  score0To100: number;
  band: ScoreBand;
  status: "illustrative-heuristic-not-validated";
  components: ScoreComponent[];
  interpretation: string;
}

export interface SourceFidelitySummary {
  score0To100: number;
  exactCount: number;
  reconstructedCount: number;
  proxyCount: number;
  unavailableCount: number;
  degradedSourceCount: number;
  limitations: string[];
}

export interface LifecycleFlowSummary {
  priceReturnFromLaunchPct: number;
  curveVelocityPctPointsPerMinute: number;
  netFlowUsd: number;
  buySellImbalance: number;
  transactionsPerMinute: number;
  uniqueBuyersPerMinute: number;
  holderGrowthPerMinute: number;
  graduated: boolean;
}

export interface LiquidityExecutionSummary {
  quoteReserveUsd: number;
  poolTvlUsd: number;
  reserveCoverageByNotional: Array<{
    notionalUsd: number;
    reserveCoverageMultiple: number;
  }>;
  probes: Array<
    ExecutionQuoteProbe & {
      retentionPct: number;
      totalCostPct: number;
    }
  >;
  executionScore: IllustrativeAssessment;
}

export interface OwnershipCreatorSummary {
  topOwnerWalletSharePct: number;
  topTenOwnerWalletSharePct: number;
  topTenTokenAccountSharePct: number;
  ownerWalletHhi: number;
  ownerWalletEffectiveCount: number;
  creatorPriorGraduationRatePct: number | null;
  creatorPriorSurvivalRatePct: number | null;
  creatorCurrentSharePct: number;
  creatorNetSoldUsd: number;
  authorities: AuthorityState;
}

export interface CoordinationWashSummary {
  coordinationEvidenceScore: IllustrativeAssessment;
  washEvidenceScore: IllustrativeAssessment;
  commonFunderEvidencePct: number;
  recurringCohortEvidencePct: number;
  sameSlotEarlyBuyerPct: number;
  synchronizedExitPct: number;
}

export interface NarrativePaidAttentionSummary {
  postsPerMinute: number;
  postVelocityChangePerMinute: number;
  uniqueAuthorRatioPct: number;
  exactIdentityMentionRatioPct: number;
  likelyAutomatedPostRatioPct: number;
  paidExposureUsd: number;
  trendingRank: number | null;
  topNarratives: NarrativeCluster[];
}

export type MarketRegimeSummary = MarketRegimeObservation;

export interface ResearchOutputs {
  opportunity: IllustrativeAssessment;
  integrityRisk: IllustrativeAssessment;
  executability: IllustrativeAssessment;
  evidenceConfidence: IllustrativeAssessment;
}

export interface ResearchCutoffSnapshot {
  identity: TokenIdentity;
  cutoff: ResearchCutoff;
  asOf: ISODateTime;
  lifecycleFlow: LifecycleFlowSummary;
  liquidityExecution: LiquidityExecutionSummary;
  ownershipCreator: OwnershipCreatorSummary;
  coordinationWash: CoordinationWashSummary;
  narrativePaidAttention: NarrativePaidAttentionSummary;
  marketRegime: MarketRegimeSummary;
  sourceFidelity: SourceFidelitySummary;
  outputs: ResearchOutputs;
  sourceIds: string[];
  caveats: string[];
}

export interface ResearchSummary {
  mode: ResearchReplay["mode"];
  fixtureLabel: string;
  disclaimer: string;
  identity: TokenIdentity;
  selectedCutoff: ResearchCutoffSnapshot;
  timeline: ResearchCutoffSnapshot[];
  historicalOutcome: HistoricalOutcome;
}

import type {
  CoordinationWashObservation,
  EvidenceFidelity,
  ExecutionQuoteProbe,
  LifecycleFlowObservation,
  LiquidityExecutionObservation,
  MarketRegimeObservation,
  NarrativePaidAttentionObservation,
  ObservationContext,
  OwnershipCreatorObservation,
  ResearchReplay,
  SolanaCommitment,
} from "./types";

const CREATED_AT = "2026-07-12T14:00:00.000Z";

const atSecond = (elapsedSeconds: number): string =>
  new Date(Date.parse(CREATED_AT) + elapsedSeconds * 1_000).toISOString();

const context = (
  elapsedSeconds: number,
  sourceIds: string[],
  fidelity: EvidenceFidelity = "exact",
  commitment: SolanaCommitment = "finalized",
  availabilityDelaySeconds = 0,
): ObservationContext => ({
  elapsedSeconds,
  eventTime: atSecond(elapsedSeconds),
  observedAt: atSecond(elapsedSeconds + availabilityDelaySeconds),
  availableAt: atSecond(elapsedSeconds + availabilityDelaySeconds),
  commitment,
  canonical: true,
  fidelity,
  sourceIds,
});

const exitProbes = (
  rows: Array<
    [
      notionalUsd: number,
      expectedValueUsd: number,
      priceImpactPct: number,
      feeUsd: number,
      routeAvailable: boolean,
      latencyMs: number,
    ]
  >,
): ExecutionQuoteProbe[] =>
  rows.map(
    ([
      notionalUsd,
      expectedValueUsd,
      priceImpactPct,
      networkAndPriorityFeeUsd,
      routeAvailable,
      quoteLatencyMs,
    ]) => ({
      direction: "sell",
      notionalUsd,
      expectedValueUsd,
      priceImpactPct,
      networkAndPriorityFeeUsd,
      routeAvailable,
      quoteLatencyMs,
    }),
  );

const lifecycleFlow: LifecycleFlowObservation[] = [
  {
    ...context(30, ["solana-archive", "pump-program"], "exact", "confirmed"),
    priceUsd: 0.0000031,
    launchPriceUsd: 0.000002,
    marketCapUsd: 3_100,
    bondingCurveProgressPct: 8.4,
    cumulativeBuyVolumeUsd: 3_480,
    cumulativeSellVolumeUsd: 570,
    cumulativeBuyCount: 62,
    cumulativeSellCount: 13,
    cumulativeUniqueBuyers: 49,
    cumulativeUniqueSellers: 11,
    holderCount: 47,
    graduated: false,
  },
  {
    ...context(60, ["solana-archive", "pump-program"]),
    priceUsd: 0.0000046,
    launchPriceUsd: 0.000002,
    marketCapUsd: 4_600,
    bondingCurveProgressPct: 17.2,
    cumulativeBuyVolumeUsd: 7_820,
    cumulativeSellVolumeUsd: 1_640,
    cumulativeBuyCount: 123,
    cumulativeSellCount: 35,
    cumulativeUniqueBuyers: 91,
    cumulativeUniqueSellers: 27,
    holderCount: 86,
    graduated: false,
  },
  {
    ...context(300, ["solana-archive", "pump-program"]),
    priceUsd: 0.0000148,
    launchPriceUsd: 0.000002,
    marketCapUsd: 14_800,
    bondingCurveProgressPct: 58.6,
    cumulativeBuyVolumeUsd: 45_300,
    cumulativeSellVolumeUsd: 18_750,
    cumulativeBuyCount: 511,
    cumulativeSellCount: 234,
    cumulativeUniqueBuyers: 348,
    cumulativeUniqueSellers: 166,
    holderCount: 302,
    graduated: false,
  },
  {
    ...context(900, ["solana-archive", "pump-program", "dex-pool-archive"]),
    priceUsd: 0.0000264,
    launchPriceUsd: 0.000002,
    marketCapUsd: 26_400,
    bondingCurveProgressPct: 100,
    cumulativeBuyVolumeUsd: 126_400,
    cumulativeSellVolumeUsd: 67_900,
    cumulativeBuyCount: 1_384,
    cumulativeSellCount: 711,
    cumulativeUniqueBuyers: 812,
    cumulativeUniqueSellers: 461,
    holderCount: 671,
    graduated: true,
    migrationPoolAddress: "IllustrativeReplayPool_NotARealAddress",
  },
  {
    ...context(3_600, ["solana-archive", "pump-program", "dex-pool-archive"]),
    priceUsd: 0.0000187,
    launchPriceUsd: 0.000002,
    marketCapUsd: 18_700,
    bondingCurveProgressPct: 100,
    cumulativeBuyVolumeUsd: 244_900,
    cumulativeSellVolumeUsd: 211_600,
    cumulativeBuyCount: 2_774,
    cumulativeSellCount: 1_945,
    cumulativeUniqueBuyers: 1_406,
    cumulativeUniqueSellers: 1_057,
    holderCount: 804,
    graduated: true,
    migrationPoolAddress: "IllustrativeReplayPool_NotARealAddress",
  },
];

const liquidityExecution: LiquidityExecutionObservation[] = [
  {
    ...context(30, ["pump-program", "route-reconstruction"], "reconstructed", "confirmed"),
    quoteReserveUsd: 5_900,
    baseReserveTokens: 1_903_000_000,
    poolTvlUsd: 11_700,
    routeCount: 1,
    executableQuoteProbes: exitProbes([
      [100, 96.4, 3.1, 0.42, true, 460],
      [500, 424, 14.7, 2.1, true, 510],
      [1_000, 0, 100, 0, false, 600],
    ]),
  },
  {
    ...context(60, ["pump-program", "route-reconstruction"], "reconstructed"),
    quoteReserveUsd: 9_800,
    baseReserveTokens: 2_130_000_000,
    poolTvlUsd: 19_300,
    routeCount: 1,
    executableQuoteProbes: exitProbes([
      [100, 97.8, 1.8, 0.42, true, 420],
      [500, 452, 9.2, 2.1, true, 485],
      [1_000, 825, 17.1, 4.2, true, 530],
    ]),
  },
  {
    ...context(300, ["pump-program", "route-reconstruction"], "reconstructed"),
    quoteReserveUsd: 24_900,
    baseReserveTokens: 1_740_000_000,
    poolTvlUsd: 49_100,
    routeCount: 1,
    executableQuoteProbes: exitProbes([
      [100, 98.8, 0.8, 0.38, true, 350],
      [500, 481, 3.4, 1.9, true, 370],
      [1_000, 930, 6.6, 3.8, true, 405],
    ]),
  },
  {
    ...context(900, ["dex-pool-archive", "route-reconstruction"], "reconstructed"),
    quoteReserveUsd: 52_600,
    baseReserveTokens: 1_990_000_000,
    poolTvlUsd: 104_500,
    routeCount: 2,
    executableQuoteProbes: exitProbes([
      [100, 99.1, 0.5, 0.35, true, 285],
      [500, 489, 1.7, 1.75, true, 295],
      [1_000, 963, 3.3, 3.5, true, 320],
    ]),
  },
  {
    ...context(3_600, ["dex-pool-archive", "route-reconstruction"], "reconstructed"),
    quoteReserveUsd: 37_400,
    baseReserveTokens: 2_000_000_000,
    poolTvlUsd: 73_800,
    routeCount: 2,
    executableQuoteProbes: exitProbes([
      [100, 98.9, 0.7, 0.36, true, 310],
      [500, 484, 2.5, 1.8, true, 330],
      [1_000, 945, 4.8, 3.6, true, 355],
    ]),
  },
];

const creatorHistory = {
  priorLaunchCount: 7,
  priorGraduationCount: 2,
  priorTwentyFourHourSurvivorCount: 1,
  priorSevereDrawdownCount: 5,
  medianPriorPeakMultiple: 1.42,
};

const authorities = {
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  metadataMutable: true,
  liquidityControlKnown: false,
};

const ownershipRows: Array<
  Omit<
    OwnershipCreatorObservation,
    keyof ObservationContext | "creatorHistory" | "authorities"
  > & { elapsedSeconds: number }
> = [
  {
    elapsedSeconds: 30,
    ownerWalletSharesPct: [18, 13, 10, 8, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 10],
    tokenAccountSharesPct: [13, 10, 9, 8, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 15],
    creatorCurrentSharePct: 10.8,
    creatorNetSoldUsd: 0,
    creatorFeeExtractionUsd: 28,
  },
  {
    elapsedSeconds: 60,
    ownerWalletSharesPct: [15, 12, 9, 8, 7, 6, 5, 5, 4, 4, 4, 3, 3, 2, 13],
    tokenAccountSharesPct: [12, 9, 8, 8, 7, 6, 5, 5, 5, 4, 4, 3, 3, 2, 19],
    creatorCurrentSharePct: 8.2,
    creatorNetSoldUsd: 210,
    creatorFeeExtractionUsd: 59,
  },
  {
    elapsedSeconds: 300,
    ownerWalletSharesPct: [12, 9, 8, 7, 6, 5, 5, 4, 4, 4, 4, 3, 3, 3, 23],
    tokenAccountSharesPct: [9, 8, 7, 7, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 27],
    creatorCurrentSharePct: 4.1,
    creatorNetSoldUsd: 1_980,
    creatorFeeExtractionUsd: 281,
  },
  {
    elapsedSeconds: 900,
    ownerWalletSharesPct: [10, 8, 7, 6, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 30],
    tokenAccountSharesPct: [8, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 33],
    creatorCurrentSharePct: 1.7,
    creatorNetSoldUsd: 5_460,
    creatorFeeExtractionUsd: 836,
  },
  {
    elapsedSeconds: 3_600,
    ownerWalletSharesPct: [13, 10, 8, 7, 6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 23],
    tokenAccountSharesPct: [10, 8, 8, 7, 6, 5, 5, 4, 4, 4, 4, 3, 3, 2, 27],
    creatorCurrentSharePct: 0.9,
    creatorNetSoldUsd: 8_900,
    creatorFeeExtractionUsd: 1_722,
  },
];

const ownershipCreator: OwnershipCreatorObservation[] = ownershipRows.map(
  ({ elapsedSeconds, ...row }) => ({
    ...context(elapsedSeconds, ["solana-archive", "wallet-label-snapshot"], "reconstructed"),
    ...row,
    creatorHistory,
    authorities,
  }),
);

const coordinationRows: Array<
  Omit<CoordinationWashObservation, keyof ObservationContext> & {
    elapsedSeconds: number;
  }
> = [
  {
    elapsedSeconds: 30,
    earlyBuyerCount: 49,
    commonFunderClusterCount: 2,
    earlyBuyersWithCommonFunderPct: 18.4,
    recurringCohortWalletCount: 5,
    recurringCohortBuyerPct: 10.2,
    sameSlotEarlyBuyerPct: 22.4,
    bundledTransactionClueCount: 2,
    synchronizedExitPct: 0,
    circularFlowUsd: 180,
    suspectedWashVolumePct: 5.8,
    selfFundingLoopCount: 1,
  },
  {
    elapsedSeconds: 60,
    earlyBuyerCount: 91,
    commonFunderClusterCount: 3,
    earlyBuyersWithCommonFunderPct: 23.1,
    recurringCohortWalletCount: 11,
    recurringCohortBuyerPct: 12.1,
    sameSlotEarlyBuyerPct: 20.9,
    bundledTransactionClueCount: 3,
    synchronizedExitPct: 3.4,
    circularFlowUsd: 490,
    suspectedWashVolumePct: 7.2,
    selfFundingLoopCount: 1,
  },
  {
    elapsedSeconds: 300,
    earlyBuyerCount: 348,
    commonFunderClusterCount: 6,
    earlyBuyersWithCommonFunderPct: 27.9,
    recurringCohortWalletCount: 51,
    recurringCohortBuyerPct: 14.7,
    sameSlotEarlyBuyerPct: 18.2,
    bundledTransactionClueCount: 4,
    synchronizedExitPct: 11.8,
    circularFlowUsd: 4_280,
    suspectedWashVolumePct: 10.6,
    selfFundingLoopCount: 2,
  },
  {
    elapsedSeconds: 900,
    earlyBuyerCount: 812,
    commonFunderClusterCount: 10,
    earlyBuyersWithCommonFunderPct: 29.4,
    recurringCohortWalletCount: 132,
    recurringCohortBuyerPct: 16.3,
    sameSlotEarlyBuyerPct: 16.1,
    bundledTransactionClueCount: 5,
    synchronizedExitPct: 19.7,
    circularFlowUsd: 14_900,
    suspectedWashVolumePct: 13.8,
    selfFundingLoopCount: 3,
  },
  {
    elapsedSeconds: 3_600,
    earlyBuyerCount: 1_406,
    commonFunderClusterCount: 13,
    earlyBuyersWithCommonFunderPct: 31.2,
    recurringCohortWalletCount: 241,
    recurringCohortBuyerPct: 17.1,
    sameSlotEarlyBuyerPct: 14.8,
    bundledTransactionClueCount: 5,
    synchronizedExitPct: 28.9,
    circularFlowUsd: 37_600,
    suspectedWashVolumePct: 16.4,
    selfFundingLoopCount: 4,
  },
];

const coordinationWash: CoordinationWashObservation[] = coordinationRows.map(
  ({ elapsedSeconds, ...row }) => ({
    ...context(
      elapsedSeconds,
      ["solana-archive", "wallet-label-snapshot", "bundle-proxy"],
      "reconstructed",
    ),
    ...row,
  }),
);

const narrativeRows: Array<
  Omit<NarrativePaidAttentionObservation, keyof ObservationContext> & {
    elapsedSeconds: number;
  }
> = [
  {
    elapsedSeconds: 30,
    cumulativePostCount: 14,
    cumulativeUniqueAuthors: 9,
    cumulativeExactContractMentions: 8,
    cumulativeOfficialUrlMentions: 2,
    cumulativeLikelyAutomatedPosts: 3,
    verifiedAuthorCount: 0,
    paidBoostCount: 0,
    paidExposureUsd: 0,
    trendingRank: null,
    clusters: [
      { id: "archive", label: "on-chain archive frog", postCount: 9, uniqueAuthorCount: 6, noveltyScore0To100: 72 },
      { id: "generic", label: "new Solana launch", postCount: 5, uniqueAuthorCount: 3, noveltyScore0To100: 18 },
    ],
  },
  {
    elapsedSeconds: 60,
    cumulativePostCount: 31,
    cumulativeUniqueAuthors: 19,
    cumulativeExactContractMentions: 19,
    cumulativeOfficialUrlMentions: 5,
    cumulativeLikelyAutomatedPosts: 7,
    verifiedAuthorCount: 1,
    paidBoostCount: 0,
    paidExposureUsd: 0,
    trendingRank: null,
    clusters: [
      { id: "archive", label: "on-chain archive frog", postCount: 22, uniqueAuthorCount: 14, noveltyScore0To100: 74 },
      { id: "generic", label: "new Solana launch", postCount: 9, uniqueAuthorCount: 5, noveltyScore0To100: 16 },
    ],
  },
  {
    elapsedSeconds: 300,
    cumulativePostCount: 186,
    cumulativeUniqueAuthors: 103,
    cumulativeExactContractMentions: 126,
    cumulativeOfficialUrlMentions: 27,
    cumulativeLikelyAutomatedPosts: 51,
    verifiedAuthorCount: 4,
    paidBoostCount: 1,
    paidExposureUsd: 80,
    trendingRank: 38,
    clusters: [
      { id: "archive", label: "on-chain archive frog", postCount: 112, uniqueAuthorCount: 71, noveltyScore0To100: 77 },
      { id: "forensics", label: "wallet forensics", postCount: 43, uniqueAuthorCount: 21, noveltyScore0To100: 63 },
      { id: "generic", label: "new Solana launch", postCount: 31, uniqueAuthorCount: 11, noveltyScore0To100: 14 },
    ],
  },
  {
    elapsedSeconds: 900,
    cumulativePostCount: 592,
    cumulativeUniqueAuthors: 281,
    cumulativeExactContractMentions: 381,
    cumulativeOfficialUrlMentions: 91,
    cumulativeLikelyAutomatedPosts: 201,
    verifiedAuthorCount: 12,
    paidBoostCount: 3,
    paidExposureUsd: 310,
    trendingRank: 11,
    clusters: [
      { id: "archive", label: "on-chain archive frog", postCount: 314, uniqueAuthorCount: 169, noveltyScore0To100: 76 },
      { id: "forensics", label: "wallet forensics", postCount: 188, uniqueAuthorCount: 79, noveltyScore0To100: 68 },
      { id: "generic", label: "new Solana launch", postCount: 90, uniqueAuthorCount: 33, noveltyScore0To100: 12 },
    ],
  },
  {
    elapsedSeconds: 3_600,
    cumulativePostCount: 1_438,
    cumulativeUniqueAuthors: 624,
    cumulativeExactContractMentions: 892,
    cumulativeOfficialUrlMentions: 224,
    cumulativeLikelyAutomatedPosts: 558,
    verifiedAuthorCount: 24,
    paidBoostCount: 5,
    paidExposureUsd: 540,
    trendingRank: 19,
    clusters: [
      { id: "archive", label: "on-chain archive frog", postCount: 692, uniqueAuthorCount: 343, noveltyScore0To100: 70 },
      { id: "forensics", label: "wallet forensics", postCount: 511, uniqueAuthorCount: 211, noveltyScore0To100: 66 },
      { id: "generic", label: "new Solana launch", postCount: 235, uniqueAuthorCount: 70, noveltyScore0To100: 9 },
    ],
  },
];

const narrativePaidAttention: NarrativePaidAttentionObservation[] =
  narrativeRows.map(({ elapsedSeconds, ...row }) => ({
    ...context(
      elapsedSeconds,
      ["x-archive", "paid-attention-snapshot"],
      "reconstructed",
    ),
    ...row,
  }));

const regimeRows: Array<
  Omit<MarketRegimeObservation, keyof ObservationContext> & {
    elapsedSeconds: number;
    availabilityDelaySeconds?: number;
  }
> = [
  { elapsedSeconds: 30, solReturnOneHourPct: 1.2, solRealizedVolatilityOneHourPct: 2.1, medianPriorityFeeMicroLamports: 42_000, blockCongestionPct: 48, pumpLaunchesLastHour: 1_940, medianLaunchVolumeFiveMinutesUsd: 4_200, riskAppetiteScore0To100: 68, label: "risk-on" },
  { elapsedSeconds: 60, availabilityDelaySeconds: 30, solReturnOneHourPct: 1.3, solRealizedVolatilityOneHourPct: 2.2, medianPriorityFeeMicroLamports: 44_000, blockCongestionPct: 51, pumpLaunchesLastHour: 1_955, medianLaunchVolumeFiveMinutesUsd: 4_260, riskAppetiteScore0To100: 69, label: "risk-on" },
  { elapsedSeconds: 300, solReturnOneHourPct: 1.5, solRealizedVolatilityOneHourPct: 2.5, medianPriorityFeeMicroLamports: 53_000, blockCongestionPct: 59, pumpLaunchesLastHour: 2_030, medianLaunchVolumeFiveMinutesUsd: 4_480, riskAppetiteScore0To100: 72, label: "risk-on" },
  { elapsedSeconds: 900, solReturnOneHourPct: 1.1, solRealizedVolatilityOneHourPct: 3.1, medianPriorityFeeMicroLamports: 71_000, blockCongestionPct: 71, pumpLaunchesLastHour: 2_180, medianLaunchVolumeFiveMinutesUsd: 4_910, riskAppetiteScore0To100: 65, label: "congested" },
  { elapsedSeconds: 3_600, solReturnOneHourPct: -0.8, solRealizedVolatilityOneHourPct: 4.6, medianPriorityFeeMicroLamports: 88_000, blockCongestionPct: 76, pumpLaunchesLastHour: 2_340, medianLaunchVolumeFiveMinutesUsd: 4_110, riskAppetiteScore0To100: 47, label: "congested" },
];

const marketRegime: MarketRegimeObservation[] = regimeRows.map(
  ({ elapsedSeconds, availabilityDelaySeconds = 0, ...row }) => ({
    ...context(
      elapsedSeconds,
      ["solana-archive", "market-regime-archive"],
      "exact",
      "finalized",
      availabilityDelaySeconds,
    ),
    ...row,
  }),
);

/**
 * A synthetic-but-realistically-shaped replay for UI and calculation testing.
 * It is deliberately not a real token, trained forecast, backtest result, or
 * recommendation. Production collectors should replace it without changing
 * the domain contracts.
 */
export const researchFixture: ResearchReplay = {
  mode: "illustrative-historical-replay",
  fixtureLabel: "ILLUSTRATIVE REPLAY · SYNTHETIC INPUTS",
  disclaimer:
    "Historical-replay demonstration only. The asset and observations are synthetic; scores are unvalidated heuristics, not model output or trading advice.",
  generatedAt: "2026-08-28T09:00:00.000Z",
  identity: {
    chain: "solana",
    launchVenue: "pump.fun",
    contractAddress: "IllustrativeReplayOnly_NotARealContract",
    name: "Archive Frog",
    ticker: "ARCFROG",
    creatorAddress: "IllustrativeCreator_NotARealWallet",
    createdAt: CREATED_AT,
    officialUrls: ["https://example.invalid/archive-frog"],
  },
  sources: [
    {
      id: "solana-archive",
      label: "Solana archival transactions",
      kind: "onchain",
      status: "healthy",
      fidelity: "exact",
      temporalCoverage: "archive",
      observedThrough: atSecond(3_600),
      fields: ["instructions", "slots", "fees", "balances", "token owners"],
      limitation: "Private intent and dropped transactions are not observable on-chain.",
    },
    {
      id: "pump-program",
      label: "Pump.fun program-state decoder",
      kind: "launchpad",
      status: "healthy",
      fidelity: "exact",
      temporalCoverage: "archive",
      observedThrough: atSecond(3_600),
      fields: ["creation", "curve reserves", "swaps", "graduation"],
    },
    {
      id: "dex-pool-archive",
      label: "Post-graduation DEX pool archive",
      kind: "market-data",
      status: "healthy",
      fidelity: "exact",
      temporalCoverage: "archive",
      observedThrough: atSecond(3_600),
      fields: ["pool reserves", "swaps", "liquidity events"],
    },
    {
      id: "route-reconstruction",
      label: "Historical route reconstruction",
      kind: "execution",
      status: "degraded",
      fidelity: "reconstructed",
      temporalCoverage: "archive",
      observedThrough: atSecond(3_600),
      fields: ["standard notional probes", "impact", "fees", "route availability"],
      limitation: "Historical router latency and private failed routes cannot be recovered exactly.",
    },
    {
      id: "wallet-label-snapshot",
      label: "Versioned wallet and owner resolution",
      kind: "derived",
      status: "healthy",
      fidelity: "reconstructed",
      temporalCoverage: "mixed",
      observedThrough: atSecond(3_600),
      fields: ["controlling owners", "funders", "creator history", "cohorts"],
      limitation: "Shared exchange and popular bot funders can create false relationships.",
    },
    {
      id: "bundle-proxy",
      label: "Historical bundle-evidence proxy",
      kind: "derived",
      status: "degraded",
      fidelity: "proxy",
      temporalCoverage: "mixed",
      observedThrough: atSecond(3_600),
      fields: ["same-slot ordering", "tips", "atomic transaction clues"],
      limitation: "Ordering and tip evidence cannot prove historical bundle membership.",
    },
    {
      id: "x-archive",
      label: "Point-in-time X post archive",
      kind: "social",
      status: "healthy",
      fidelity: "reconstructed",
      temporalCoverage: "archive",
      observedThrough: atSecond(3_600),
      fields: ["post text", "created_at", "author", "exact-address mentions"],
      limitation: "Current engagement values must not be treated as historical engagement.",
      commercialUseNote: "Production use requires an approved plan and compliance review.",
    },
    {
      id: "paid-attention-snapshot",
      label: "Paid and trending attention snapshots",
      kind: "market-data",
      status: "degraded",
      fidelity: "proxy",
      temporalCoverage: "mixed",
      observedThrough: atSecond(3_600),
      fields: ["paid boosts", "paid exposure", "trending rank"],
      limitation: "Historical rankings are incomplete and must carry explicit coverage flags.",
    },
    {
      id: "market-regime-archive",
      label: "Solana market-regime archive",
      kind: "market-data",
      status: "healthy",
      fidelity: "exact",
      temporalCoverage: "archive",
      observedThrough: atSecond(3_600),
      fields: ["SOL returns", "volatility", "priority fees", "launch activity"],
    },
  ],
  lifecycleFlow,
  liquidityExecution,
  ownershipCreator,
  coordinationWash,
  narrativePaidAttention,
  marketRegime,
  historicalOutcome: {
    labelAvailableAt: "2026-07-13T14:00:00.000Z",
    graduatedAtSeconds: 742,
    peakPriceMultipleOneHour: 14.6,
    peakPriceMultipleTwentyFourHours: 18.9,
    maximumDrawdownTwentyFourHoursPct: 91.4,
    survivedTwentyFourHours: true,
    executableOutcomes: [
      { notionalUsd: 100, netReturnPct: 482, exitSucceeded: true, maximumObservedPriceImpactPct: 1.6 },
      { notionalUsd: 500, netReturnPct: 397, exitSucceeded: true, maximumObservedPriceImpactPct: 6.9 },
      { notionalUsd: 1_000, netReturnPct: 271, exitSucceeded: true, maximumObservedPriceImpactPct: 13.8 },
    ],
    fidelity: "reconstructed",
    sourceIds: ["solana-archive", "pump-program", "dex-pool-archive"],
  },
};

export const illustrativeResearchReplay = researchFixture;

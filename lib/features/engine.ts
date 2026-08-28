import {
  FEATURE_CUTOFF_SECONDS,
  type CollectionStatus,
  type EvidenceFidelity,
  type EvidenceQualityFeatures,
  type FamilyCoverage,
  type FamilyEvidenceQuality,
  type FeatureCutoffSeconds,
  type FeatureFamily,
  type MarketObservation,
  type PointInTimeFeatureVector,
  type PointInTimeInput,
  type QuoteObservation,
  type TimestampedEvidence,
  type TradeObservation,
} from "./types";

const FAMILY_ORDER: readonly FeatureFamily[] = [
  "lifecycleFlow",
  "liquidityExecution",
  "ownershipCreator",
  "coordinationWash",
  "narrativePaidAttention",
  "marketRegime",
];

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const clamp = (value: number, minimum = 0, maximum = 100): number =>
  Math.min(maximum, Math.max(minimum, value));

const divideOrNull = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const timestamp = (value: string): number => Date.parse(value);

const isUsableAt = <T extends TimestampedEvidence>(
  record: T,
  cutoffMs: number,
  earliestEventMs = Number.NEGATIVE_INFINITY,
): boolean => {
  const eventMs = timestamp(record.eventAt);
  const availableMs = timestamp(record.availableAt);
  return (
    record.canonical !== false &&
    Number.isFinite(eventMs) &&
    Number.isFinite(availableMs) &&
    eventMs >= earliestEventMs &&
    eventMs <= cutoffMs &&
    availableMs <= cutoffMs
  );
};

const usableAt = <T extends TimestampedEvidence>(
  records: readonly T[],
  cutoffMs: number,
  earliestEventMs = Number.NEGATIVE_INFINITY,
): T[] =>
  records.filter((record) => isUsableAt(record, cutoffMs, earliestEventMs));

const latest = <T extends TimestampedEvidence>(records: readonly T[]): T | null =>
  [...records].sort((left, right) => {
    const eventDifference = timestamp(right.eventAt) - timestamp(left.eventAt);
    return eventDifference || timestamp(right.availableAt) - timestamp(left.availableAt);
  })[0] ?? null;

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const topShare = (shares: readonly number[], count: number): number =>
  sum([...shares].sort((a, b) => b - a).slice(0, count));

const eventWindow = <T extends TimestampedEvidence>(
  records: readonly T[],
  startExclusiveMs: number,
  endInclusiveMs: number,
): T[] =>
  records.filter((record) => {
    const eventMs = timestamp(record.eventAt);
    return eventMs > startExclusiveMs && eventMs <= endInclusiveMs;
  });

const countBy = <T>(values: readonly T[]): Map<T, number> => {
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
};

const membersInRepeatedGroups = <T>(values: readonly T[]): number => {
  const repeated = new Set(
    [...countBy(values)].filter(([, count]) => count > 1).map(([key]) => key),
  );
  return values.filter((value) => repeated.has(value)).length;
};

const coverageFor = (
  coverage: readonly FamilyCoverage[],
  family: FeatureFamily,
  launchMs: number,
  cutoffMs: number,
): FamilyCoverage =>
  (() => {
    const declared = coverage.find((candidate) => candidate.family === family);
    if (!declared) {
      return {
        family,
        status: "unavailable" as const,
        notes: ["Collection coverage was not declared for this family."],
      };
    }
    const throughMs = declared.eventThrough ? timestamp(declared.eventThrough) : null;
    const fromMs = declared.eventFrom ? timestamp(declared.eventFrom) : null;
    const boundedGap =
      (throughMs !== null && (!Number.isFinite(throughMs) || throughMs < cutoffMs)) ||
      (family !== "marketRegime" &&
        fromMs !== null &&
        (!Number.isFinite(fromMs) || fromMs > launchMs));
    if (declared.status === "complete" && boundedGap) {
      return {
        ...declared,
        status: "partial" as const,
        notes: [
          ...(declared.notes ?? []),
          "Declared time bounds do not span the full feature window; completeness was downgraded.",
        ],
      };
    }
    return declared;
  })();

const nullableCount = <T>(
  records: readonly T[],
  status: CollectionStatus,
): number | null => (status === "unavailable" ? null : records.length);

const nullableSum = (
  values: readonly number[],
  status: CollectionStatus,
): number | null => (status === "unavailable" ? null : sum(values));

const completeUsdSum = (trades: readonly TradeObservation[]): number | null => {
  if (!trades.length || trades.some((trade) => trade.volumeUsd === null)) return null;
  return sum(trades.map((trade) => trade.volumeUsd as number));
};

const fidelityCounts = (records: readonly TimestampedEvidence[]) => ({
  exact: records.filter((record) => record.fidelity === "exact").length,
  reconstructed: records.filter((record) => record.fidelity === "reconstructed").length,
  proxy: records.filter((record) => record.fidelity === "proxy").length,
});

const familyQuality = (
  coverage: FamilyCoverage,
  records: readonly TimestampedEvidence[],
  missingFields: string[],
  possibleFieldCount: number,
  cutoffMs: number,
): FamilyEvidenceQuality => {
  const counts = fidelityCounts(records);
  const latestAvailable = records.length
    ? Math.max(...records.map((record) => timestamp(record.availableAt)))
    : null;
  return {
    status: coverage.status,
    coveragePct:
      coverage.status === "unavailable"
        ? 0
        : round(clamp(((possibleFieldCount - missingFields.length) / possibleFieldCount) * 100), 2),
    selectedRecordCount: records.length,
    exactRecordCount: counts.exact,
    reconstructedRecordCount: counts.reconstructed,
    proxyRecordCount: counts.proxy,
    sourceCount: unique(records.map((record) => record.sourceId)).length,
    latestAvailableLagSeconds:
      latestAvailable === null ? null : round((cutoffMs - latestAvailable) / 1_000, 3),
    missingFields,
    notes: coverage.notes ?? [],
  };
};

const fieldNamesWithNull = (value: object): string[] =>
  Object.entries(value)
    .filter(([, fieldValue]) => fieldValue === null)
    .map(([fieldName]) => fieldName);

const tradeTotals = (
  trades: readonly TradeObservation[],
  market: MarketObservation | null,
  status: CollectionStatus,
) => {
  if (status === "unavailable") {
    return {
      buyVolume: null,
      sellVolume: null,
      buyCount: null,
      sellCount: null,
    };
  }
  const buys = trades.filter((trade) => trade.side === "buy");
  const sells = trades.filter((trade) => trade.side === "sell");
  const observedBuyVolume = completeUsdSum(buys);
  const observedSellVolume = completeUsdSum(sells);
  return {
    buyVolume:
      market?.cumulativeBuyVolumeUsd ??
      (observedBuyVolume ?? (buys.length === 0 && status === "complete" ? 0 : null)),
    sellVolume:
      market?.cumulativeSellVolumeUsd ??
      (observedSellVolume ?? (sells.length === 0 && status === "complete" ? 0 : null)),
    buyCount:
      market?.cumulativeBuyCount ??
      (buys.length || status === "complete" ? buys.length : null),
    sellCount:
      market?.cumulativeSellCount ??
      (sells.length || status === "complete" ? sells.length : null),
  };
};

const latestQuote = (
  quotes: readonly QuoteObservation[],
  side: QuoteObservation["side"],
  orderSizeUsd: number,
): QuoteObservation | null =>
  latest(quotes.filter((quote) => quote.side === side && quote.orderSizeUsd === orderSizeUsd));

/** Build one leakage-safe feature row for one coin and cutoff. */
export function derivePointInTimeFeatures(
  input: PointInTimeInput,
  cutoffSeconds: FeatureCutoffSeconds,
): PointInTimeFeatureVector {
  if (!FEATURE_CUTOFF_SECONDS.includes(cutoffSeconds)) {
    throw new Error(`Unsupported feature cutoff: ${cutoffSeconds}`);
  }

  const launchMs = timestamp(input.launch.launchedAt);
  if (!Number.isFinite(launchMs)) throw new Error("launch.launchedAt must be a valid timestamp");
  const cutoffMs = launchMs + cutoffSeconds * 1_000;
  const cutoffAt = new Date(cutoffMs).toISOString();

  const markets = usableAt(input.market, cutoffMs, launchMs);
  const trades = usableAt(input.trades, cutoffMs, launchMs);
  const transfers = usableAt(input.transfers, cutoffMs);
  const coordinationProxies = usableAt(input.coordinationProxies ?? [], cutoffMs, launchMs);
  const holders = usableAt(input.holders, cutoffMs, launchMs);
  const creators = usableAt(input.creators, cutoffMs, launchMs);
  const quotes = usableAt(input.quotes, cutoffMs, launchMs);
  const socialPosts = usableAt(input.socialPosts, cutoffMs, launchMs).filter(
    (post) => post.identityMatch !== "ticker-only",
  );
  const socialCounts = usableAt(input.socialCounts ?? [], cutoffMs, launchMs).filter(
    (count) =>
      timestamp(count.bucketStart) >= launchMs &&
      timestamp(count.bucketEnd) <= cutoffMs &&
      count.identityClasses.length > 0,
  );
  const paidAttention = usableAt(input.paidAttention, cutoffMs, launchMs);
  const regimes = usableAt(input.regimes, cutoffMs);

  const lifecycleCoverage = coverageFor(input.coverage, "lifecycleFlow", launchMs, cutoffMs);
  const liquidityCoverage = coverageFor(input.coverage, "liquidityExecution", launchMs, cutoffMs);
  const ownershipCoverage = coverageFor(input.coverage, "ownershipCreator", launchMs, cutoffMs);
  const coordinationCoverage = coverageFor(input.coverage, "coordinationWash", launchMs, cutoffMs);
  const narrativeCoverage = coverageFor(
    input.coverage,
    "narrativePaidAttention",
    launchMs,
    cutoffMs,
  );
  const regimeCoverage = coverageFor(input.coverage, "marketRegime", launchMs, cutoffMs);

  const currentMarket = latest(markets);
  const firstMarket = [...markets].sort(
    (left, right) => timestamp(left.eventAt) - timestamp(right.eventAt),
  )[0] ?? null;
  const totals = tradeTotals(trades, currentMarket, lifecycleCoverage.status);
  const totalVolume =
    totals.buyVolume === null || totals.sellVolume === null
      ? null
      : totals.buyVolume + totals.sellVolume;
  const netFlow =
    totals.buyVolume === null || totals.sellVolume === null
      ? null
      : totals.buyVolume - totals.sellVolume;
  const halfWindowMs = (cutoffSeconds * 1_000) / 2;
  const recentTrades = eventWindow(trades, cutoffMs - halfWindowMs, cutoffMs);
  const priorTrades = eventWindow(trades, cutoffMs - cutoffSeconds * 1_000, cutoffMs - halfWindowMs);
  const halfWindowMinutes = cutoffSeconds / 120;
  const recentVolume = completeUsdSum(recentTrades);
  const priorVolume = completeUsdSum(priorTrades);
  const recentBuyVolume = completeUsdSum(
    recentTrades.filter((trade) => trade.side === "buy"),
  );
  const priorBuyVolume = completeUsdSum(
    priorTrades.filter((trade) => trade.side === "buy"),
  );
  const recentVolumeRate = recentVolume === null ? null : recentVolume / halfWindowMinutes;
  const priorVolumeRate = priorVolume === null ? null : priorVolume / halfWindowMinutes;
  const recentBuyRate = recentBuyVolume === null ? null : recentBuyVolume / halfWindowMinutes;
  const priorBuyRate = priorBuyVolume === null ? null : priorBuyVolume / halfWindowMinutes;
  const elapsedMinutes = cutoffSeconds / 60;
  const lifecycleFlow = {
    tokenAgeSeconds: cutoffSeconds,
    secondsSinceGraduation:
      input.launch.graduationAt && timestamp(input.launch.graduationAt) <= cutoffMs
        ? round((cutoffMs - timestamp(input.launch.graduationAt)) / 1_000, 3)
        : null,
    priceUsd: currentMarket?.priceUsd ?? null,
    marketCapUsd: currentMarket?.marketCapUsd ?? null,
    priceReturnFromFirstObservationPct:
      currentMarket && firstMarket && firstMarket.priceUsd !== 0
        ? round(((currentMarket.priceUsd - firstMarket.priceUsd) / firstMarket.priceUsd) * 100)
        : null,
    bondingCurveProgressPct: currentMarket?.bondingCurveProgressPct ?? null,
    buyVolumeUsd: totals.buyVolume,
    sellVolumeUsd: totals.sellVolume,
    netFlowUsd: netFlow,
    buySellVolumeImbalance:
      netFlow === null || totalVolume === null ? null : divideOrNull(netFlow, totalVolume),
    buyCount: totals.buyCount,
    sellCount: totals.sellCount,
    uniqueBuyers:
      lifecycleCoverage.status === "unavailable" ||
      (!trades.length && lifecycleCoverage.status !== "complete")
        ? null
        : unique(trades.filter((trade) => trade.side === "buy").map((trade) => trade.wallet)).length,
    uniqueSellers:
      lifecycleCoverage.status === "unavailable" ||
      (!trades.length && lifecycleCoverage.status !== "complete")
        ? null
        : unique(trades.filter((trade) => trade.side === "sell").map((trade) => trade.wallet)).length,
    tradesPerMinute:
      lifecycleCoverage.status === "unavailable" ||
      (!trades.length && lifecycleCoverage.status !== "complete")
        ? null
        : round(trades.length / elapsedMinutes),
    uniqueBuyersPerMinute:
      lifecycleCoverage.status === "unavailable" ||
      (!trades.length && lifecycleCoverage.status !== "complete")
        ? null
        : round(
            unique(trades.filter((trade) => trade.side === "buy").map((trade) => trade.wallet)).length /
              elapsedMinutes,
          ),
    recentToPriorVolumeVelocityRatio:
      lifecycleCoverage.status === "unavailable" ||
      recentVolumeRate === null ||
      priorVolumeRate === null ||
      priorVolumeRate === 0
        ? null
        : round(recentVolumeRate / priorVolumeRate),
    buyVolumeAccelerationUsdPerMinuteSquared:
      lifecycleCoverage.status === "unavailable" ||
      recentBuyRate === null ||
      priorBuyRate === null
        ? null
        : round((recentBuyRate - priorBuyRate) / halfWindowMinutes),
  };

  const orderSizes = unique(quotes.map((quote) => quote.orderSizeUsd)).sort((a, b) => a - b);
  const probes = orderSizes.map((orderSizeUsd) => {
    const buy = latestQuote(quotes, "buy", orderSizeUsd);
    const sell = latestQuote(quotes, "sell", orderSizeUsd);
    const totalFees =
      buy?.networkAndPriorityFeeUsd !== null && buy?.networkAndPriorityFeeUsd !== undefined &&
      sell?.networkAndPriorityFeeUsd !== null && sell?.networkAndPriorityFeeUsd !== undefined
        ? buy.networkAndPriorityFeeUsd + sell.networkAndPriorityFeeUsd
        : null;
    const retention =
      buy?.routeAvailable &&
      sell?.routeAvailable &&
      buy.expectedValueUsd !== null &&
      sell.expectedValueUsd !== null &&
      totalFees !== null
        ? ((buy.expectedValueUsd / orderSizeUsd) * sell.expectedValueUsd - totalFees) /
          orderSizeUsd *
          100
        : null;
    const latencies = [buy?.latencyMs, sell?.latencyMs].filter(
      (value): value is number => value !== null && value !== undefined,
    );
    return {
      orderSizeUsd,
      buyRouteAvailable: buy?.routeAvailable ?? null,
      sellRouteAvailable: sell?.routeAvailable ?? null,
      buyPriceImpactPct: buy?.priceImpactPct ?? null,
      sellPriceImpactPct: sell?.priceImpactPct ?? null,
      roundTripRetentionPct: retention === null ? null : round(retention),
      totalFeesUsd: totalFees === null ? null : round(totalFees),
      quoteLatencyMs: latencies.length ? round(sum(latencies) / latencies.length, 2) : null,
    };
  });
  const liquidityExecution = {
    liquidityUsd: currentMarket?.liquidityUsd ?? null,
    quoteReserveUsd: currentMarket?.quoteReserveUsd ?? null,
    probes,
  };

  const holder = latest(holders);
  const creator = latest(creators);
  const resolvedShares = (holder?.balances ?? [])
    .filter((balance) => !balance.isKnownProgramAccount)
    .map((balance) => Math.max(0, balance.sharePct));
  const ownerHhi = resolvedShares.length
    ? sum(resolvedShares.map((share) => (share / 100) ** 2))
    : null;
  const priorLaunchCount = creator?.priorLaunchCount ?? null;
  const ownershipCreator = {
    holderCount: holder?.holderCount ?? null,
    topOneOwnerSharePct: resolvedShares.length ? round(topShare(resolvedShares, 1)) : null,
    topTenOwnerSharePct: resolvedShares.length ? round(topShare(resolvedShares, 10)) : null,
    topTwentyOwnerSharePct: resolvedShares.length ? round(topShare(resolvedShares, 20)) : null,
    ownerHhi: ownerHhi === null ? null : round(ownerHhi, 6),
    effectiveOwnerCount: ownerHhi === null || ownerHhi === 0 ? null : round(1 / ownerHhi, 3),
    ownerResolutionCoveragePct: holder?.ownerResolutionCoveragePct ?? null,
    creatorSharePct: creator?.currentSharePct ?? holder?.creatorSharePct ?? null,
    creatorNetSoldUsd: creator?.cumulativeNetSoldUsd ?? null,
    creatorFeeExtractionUsd: creator?.cumulativeFeeExtractionUsd ?? null,
    creatorPriorGraduationRatePct:
      priorLaunchCount && creator?.priorGraduationCount !== null && creator?.priorGraduationCount !== undefined
        ? round((creator.priorGraduationCount / priorLaunchCount) * 100)
        : null,
    creatorPriorSurvivalRatePct:
      priorLaunchCount &&
      creator?.priorTwentyFourHourSurvivorCount !== null &&
      creator?.priorTwentyFourHourSurvivorCount !== undefined
        ? round((creator.priorTwentyFourHourSurvivorCount / priorLaunchCount) * 100)
        : null,
    mintAuthorityRevoked: holder?.mintAuthorityRevoked ?? null,
    freezeAuthorityRevoked: holder?.freezeAuthorityRevoked ?? null,
    metadataMutable: holder?.metadataMutable ?? null,
  };

  const orderedBuys = [...trades]
    .filter((trade) => trade.side === "buy")
    .sort(
      (left, right) =>
        left.slot - right.slot ||
        (left.transactionOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.transactionOrder ?? Number.MAX_SAFE_INTEGER) ||
        timestamp(left.eventAt) - timestamp(right.eventAt),
    );
  const earlyBuyerWallets: string[] = [];
  const firstBuyByWallet = new Map<string, TradeObservation>();
  orderedBuys.forEach((trade) => {
    if (!firstBuyByWallet.has(trade.wallet) && earlyBuyerWallets.length < 20) {
      earlyBuyerWallets.push(trade.wallet);
      firstBuyByWallet.set(trade.wallet, trade);
    }
  });
  const earlyBuyerSet = new Set(earlyBuyerWallets);
  const earlyCount = earlyBuyerWallets.length;
  const pctOfEarly = (count: number): number | null =>
    earlyCount === 0 ? null : round((count / earlyCount) * 100);
  const fundingTransfers = transfers.filter(
    (transfer) => transfer.purpose === "funding" && earlyBuyerSet.has(transfer.toWallet),
  );
  const qualifiedFunding = fundingTransfers.filter(
    (transfer) => transfer.counterpartyClassification === "ordinary",
  );
  const ambiguousFunding = fundingTransfers.filter((transfer) =>
    ["exchange", "popular-bot", "unknown"].includes(transfer.counterpartyClassification),
  );
  const distinctFundingEdges = (
    rows: typeof fundingTransfers,
  ): Map<string, Set<string>> => {
    const edges = new Map<string, Set<string>>();
    rows.forEach((transfer) => {
      const recipients = edges.get(transfer.fromWallet) ?? new Set<string>();
      recipients.add(transfer.toWallet);
      edges.set(transfer.fromWallet, recipients);
    });
    return edges;
  };
  const qualifiedFunderCounts = distinctFundingEdges(qualifiedFunding);
  const qualifiedFunders = new Set(
    [...qualifiedFunderCounts].filter(([, recipients]) => recipients.size > 1).map(([wallet]) => wallet),
  );
  const qualifiedCommonWallets = new Set(
    qualifiedFunding
      .filter((transfer) => qualifiedFunders.has(transfer.fromWallet))
      .map((transfer) => transfer.toWallet),
  );
  const ambiguousFunderCounts = distinctFundingEdges(ambiguousFunding);
  const ambiguousFunders = new Set(
    [...ambiguousFunderCounts].filter(([, recipients]) => recipients.size > 1).map(([wallet]) => wallet),
  );
  const ambiguousCommonWallets = new Set(
    ambiguousFunding
      .filter((transfer) => ambiguousFunders.has(transfer.fromWallet))
      .map((transfer) => transfer.toWallet),
  );
  const earlyTrades = earlyBuyerWallets
    .map((wallet) => firstBuyByWallet.get(wallet))
    .filter((trade): trade is TradeObservation => Boolean(trade));
  const sameSlotCount = membersInRepeatedGroups(earlyTrades.map((trade) => trade.slot));
  const sharedFeePayerCount = membersInRepeatedGroups(earlyTrades.map((trade) => trade.feePayer));
  const exactBundleTrades = earlyTrades.filter((trade) => trade.exactBundleId);
  const exactBundleCount = membersInRepeatedGroups(
    exactBundleTrades.map((trade) => trade.exactBundleId as string),
  );
  const bundleClueCount = earlyTrades.filter((trade) => trade.bundleClue).length;
  const recurringCount = earlyTrades.filter((trade) => (trade.priorSharedLaunchCount ?? 0) > 0).length;
  const exitBuckets = countBy(
    trades
      .filter((trade) => trade.side === "sell" && earlyBuyerSet.has(trade.wallet))
      .map((trade) => Math.floor(timestamp(trade.eventAt) / 5_000)),
  );
  const largestSynchronizedExit = Math.max(0, ...exitBuckets.values());
  const washVolume = completeUsdSum(
    trades.filter((trade) => (trade.washEvidenceTags?.length ?? 0) > 0),
  );
  const circularFlowUsd = transfers.length || coordinationCoverage.status === "complete"
    ? nullableSum(
        transfers.filter((transfer) => transfer.circularFlowClue).map((transfer) => transfer.amountUsd),
        coordinationCoverage.status,
      )
    : null;
  const qualifiedCommonPct = pctOfEarly(qualifiedCommonWallets.size);
  const recurringPct = pctOfEarly(recurringCount);
  const sameSlotPct = pctOfEarly(sameSlotCount);
  const sharedFeePayerPct = pctOfEarly(sharedFeePayerCount);
  const exactBundlePct = pctOfEarly(exactBundleCount);
  const bundleCluePct = pctOfEarly(bundleClueCount);
  const washVolumePct =
    coordinationCoverage.status === "unavailable" ||
    washVolume === null ||
    totalVolume === null ||
    totalVolume === 0
      ? null
      : round((washVolume / totalVolume) * 100);
  const evidenceComponents: Array<[number | null, number]> = [
    [qualifiedCommonPct, 0.28],
    [recurringPct, 0.22],
    [sameSlotPct, 0.12],
    [sharedFeePayerPct, 0.13],
    [exactBundlePct, 0.2],
    [bundleCluePct, 0.05],
  ];
  const usableEvidenceComponents = evidenceComponents.filter(
    (component): component is [number, number] => component[0] !== null,
  );
  const evidenceWeight = sum(usableEvidenceComponents.map(([, weight]) => weight));
  const coordinationScore =
    coordinationCoverage.status === "unavailable" || evidenceWeight === 0
      ? null
      : round(
          clamp(
            sum(usableEvidenceComponents.map(([value, weight]) => value * weight)) /
              evidenceWeight,
          ),
          2,
        );
  const washScore =
    coordinationCoverage.status === "unavailable" || washVolumePct === null
      ? null
      : round(
          clamp(
            washVolumePct * 0.75 +
              Math.min(100, ((circularFlowUsd ?? 0) / Math.max(totalVolume ?? 1, 1)) * 500) * 0.25,
          ),
          2,
        );
  const latestProxyValue = <T>(selector: (record: (typeof coordinationProxies)[number]) => T | null): T | null => {
    const record = latest(coordinationProxies.filter((candidate) => selector(candidate) !== null));
    return record ? selector(record) : null;
  };
  const hasEnumeratedTrades = trades.length > 0 || coordinationCoverage.status === "complete";
  const hasFundingTransfers = transfers.length > 0 || coordinationCoverage.status === "complete";
  const coordinationWash = {
    earlyBuyerCount: hasEnumeratedTrades
      ? nullableCount(earlyBuyerWallets, coordinationCoverage.status)
      : null,
    qualifiedCommonFunderClusterCount:
      coordinationCoverage.status === "unavailable" || !hasFundingTransfers
        ? null
        : qualifiedFunders.size,
    qualifiedCommonFunderBuyerPct: qualifiedCommonPct,
    ambiguousCommonFunderBuyerPct: pctOfEarly(ambiguousCommonWallets.size),
    recurringEarlyBuyerCohortPct: recurringPct,
    sameSlotEarlyBuyerPct: sameSlotPct,
    sharedFeePayerEarlyBuyerPct: sharedFeePayerPct,
    exactBundleEarlyBuyerPct: exactBundlePct,
    bundleClueEarlyBuyerPct: bundleCluePct,
    synchronizedExitEarlyBuyerPct: pctOfEarly(largestSynchronizedExit),
    circularFlowClueUsd: circularFlowUsd,
    washEvidenceVolumePct: washVolumePct,
    coordinationEvidence0To100: coordinationScore,
    washEvidence0To100: washScore,
    indexedBundlerWalletCount: latestProxyValue((record) => record.bundlerWalletCount),
    indexedBundledSupplySharePct: latestProxyValue(
      (record) => record.bundledSupplySharePct,
    ),
    indexedInitialBundledSupplySharePct: latestProxyValue(
      (record) => record.initialBundledSupplySharePct,
    ),
    indexedRiskScore0To100: latestProxyValue((record) => record.riskScore0To100),
    indexedInsiderSupplySharePct: latestProxyValue(
      (record) => record.insiderSupplySharePct,
    ),
    indexedSniperSupplySharePct: latestProxyValue(
      (record) => record.sniperSupplySharePct,
    ),
    indexedRuggedFlag: latestProxyValue((record) => record.ruggedFlag),
  };

  const socialHalfWindow = (cutoffSeconds * 1_000) / 2;
  const recentPosts = eventWindow(socialPosts, cutoffMs - socialHalfWindow, cutoffMs);
  const priorPosts = eventWindow(socialPosts, cutoffMs - cutoffSeconds * 1_000, cutoffMs - socialHalfWindow);
  const recentPostRate = recentPosts.length / halfWindowMinutes;
  const priorPostRate = priorPosts.length / halfWindowMinutes;
  const authors = unique(socialPosts.map((post) => post.authorId));
  const automationRows = socialPosts.filter((post) => post.automatedLikelihood0To1 !== null);
  const sentimentRows = socialPosts.filter((post) => post.sentimentMinus1To1 !== null);
  const noveltyRows = socialPosts.filter((post) => post.narrativeNovelty0To100 !== null);
  const paidSpendRows = paidAttention.filter((item) => item.spendUsd !== null);
  const hasEnumeratedPosts = socialPosts.length > 0 || narrativeCoverage.status === "complete";
  const indexedPostCount = socialCounts.length
    ? sum(socialCounts.map((count) => count.postCount))
    : null;
  const recentIndexedCount = sum(
    socialCounts
      .filter((count) => timestamp(count.bucketStart) >= cutoffMs - socialHalfWindow)
      .map((count) => count.postCount),
  );
  const priorIndexedCount = sum(
    socialCounts
      .filter((count) =>
        timestamp(count.bucketStart) >= cutoffMs - cutoffSeconds * 1_000 &&
        timestamp(count.bucketEnd) <= cutoffMs - socialHalfWindow
      )
      .map((count) => count.postCount),
  );
  const narrativePaidAttention = {
    postCount: hasEnumeratedPosts
      ? nullableCount(socialPosts, narrativeCoverage.status)
      : null,
    postsPerMinute:
      narrativeCoverage.status === "unavailable" || !hasEnumeratedPosts
        ? null
        : round(socialPosts.length / elapsedMinutes),
    recentToPriorPostVelocityRatio:
      narrativeCoverage.status === "unavailable" || !hasEnumeratedPosts || priorPostRate === 0
        ? null
        : round(recentPostRate / priorPostRate),
    postAccelerationPerMinuteSquared:
      narrativeCoverage.status === "unavailable" || !hasEnumeratedPosts
        ? null
        : round((recentPostRate - priorPostRate) / halfWindowMinutes),
    uniqueAuthorCount:
      narrativeCoverage.status === "unavailable" || !hasEnumeratedPosts ? null : authors.length,
    uniqueAuthorRatioPct:
      narrativeCoverage.status === "unavailable" || socialPosts.length === 0
        ? null
        : round((authors.length / socialPosts.length) * 100),
    exactIdentityMentionRatioPct:
      narrativeCoverage.status === "unavailable" || socialPosts.length === 0
        ? null
        : round(
            (socialPosts.filter((post) =>
              ["exact-contract", "official-url"].includes(post.identityMatch),
            ).length /
              socialPosts.length) *
              100,
          ),
    likelyAutomatedPostRatioPct:
      automationRows.length === 0
        ? null
        : round(
            (sum(automationRows.map((post) => post.automatedLikelihood0To1 as number)) /
              automationRows.length) *
              100,
          ),
    sentimentMean:
      sentimentRows.length === 0
        ? null
        : round(
            sum(sentimentRows.map((post) => post.sentimentMinus1To1 as number)) /
              sentimentRows.length,
          ),
    sentimentCoveragePct:
      socialPosts.length === 0 ? null : round((sentimentRows.length / socialPosts.length) * 100),
    influentialAuthorMentionCount:
      narrativeCoverage.status === "unavailable" || !hasEnumeratedPosts
        ? null
        : socialPosts.filter((post) => (post.authorFollowers ?? 0) >= 10_000).length,
    narrativeClusterCount:
      narrativeCoverage.status === "unavailable" || !hasEnumeratedPosts
        ? null
        : unique(
            socialPosts
              .map((post) => post.narrativeClusterId)
              .filter((value): value is string => value !== null),
          ).length,
    meanNarrativeNovelty0To100:
      noveltyRows.length === 0
        ? null
        : round(
            sum(noveltyRows.map((post) => post.narrativeNovelty0To100 as number)) /
              noveltyRows.length,
          ),
    paidBoostCount:
      narrativeCoverage.status === "unavailable" ||
      (!paidAttention.length && narrativeCoverage.status !== "complete")
        ? null
        : sum(paidAttention.map((item) => item.boostCount)),
    knownPaidExposureUsd:
      narrativeCoverage.status === "unavailable" || paidSpendRows.length === 0
        ? null
        : round(sum(paidSpendRows.map((item) => item.spendUsd as number))),
    bestTrendingRank:
      paidAttention.map((item) => item.trendingRank).filter((rank): rank is number => rank !== null)
        .sort((a, b) => a - b)[0] ?? null,
    indexedExactIdentityPostCount: indexedPostCount,
    indexedExactIdentityPostsPerMinute:
      indexedPostCount === null ? null : round(indexedPostCount / elapsedMinutes),
    indexedExactIdentityRecentToPriorVelocityRatio:
      socialCounts.length === 0 || priorIndexedCount === 0
        ? null
        : round(recentIndexedCount / priorIndexedCount),
  };

  const regime = latest(regimes);
  const marketRegime = {
    solReturnOneHourPct: regime?.solReturnOneHourPct ?? null,
    solVolatilityOneHourPct: regime?.solVolatilityOneHourPct ?? null,
    medianPriorityFeeMicroLamports: regime?.medianPriorityFeeMicroLamports ?? null,
    blockCongestionPct: regime?.blockCongestionPct ?? null,
    launchesLastHour: regime?.launchesLastHour ?? null,
    medianLaunchVolumeFiveMinutesUsd: regime?.medianLaunchVolumeFiveMinutesUsd ?? null,
    riskAppetite0To100: regime?.riskAppetite0To100 ?? null,
    label: regime?.label ?? null,
  };

  const familyRecords: Record<FeatureFamily, TimestampedEvidence[]> = {
    lifecycleFlow: [...markets, ...trades],
    liquidityExecution: [...markets, ...quotes],
    ownershipCreator: [...holders, ...creators],
    coordinationWash: [...trades, ...transfers, ...coordinationProxies],
    narrativePaidAttention: [...socialPosts, ...socialCounts, ...paidAttention],
    marketRegime: regimes,
  };
  const missingByFamily: Record<FeatureFamily, string[]> = {
    lifecycleFlow: fieldNamesWithNull(lifecycleFlow),
    liquidityExecution: [
      ...fieldNamesWithNull({
        liquidityUsd: liquidityExecution.liquidityUsd,
        quoteReserveUsd: liquidityExecution.quoteReserveUsd,
      }),
      ...(probes.length ? [] : ["probes"]),
    ],
    ownershipCreator: fieldNamesWithNull(ownershipCreator),
    coordinationWash: fieldNamesWithNull(coordinationWash),
    narrativePaidAttention: fieldNamesWithNull(narrativePaidAttention),
    marketRegime: fieldNamesWithNull(marketRegime),
  };
  const possibleFields: Record<FeatureFamily, number> = {
    lifecycleFlow: Object.keys(lifecycleFlow).length,
    liquidityExecution: 3,
    ownershipCreator: Object.keys(ownershipCreator).length,
    coordinationWash: Object.keys(coordinationWash).length,
    narrativePaidAttention: Object.keys(narrativePaidAttention).length,
    marketRegime: Object.keys(marketRegime).length,
  };
  const coverageLookup: Record<FeatureFamily, FamilyCoverage> = {
    lifecycleFlow: lifecycleCoverage,
    liquidityExecution: liquidityCoverage,
    ownershipCreator: ownershipCoverage,
    coordinationWash: coordinationCoverage,
    narrativePaidAttention: narrativeCoverage,
    marketRegime: regimeCoverage,
  };
  const byFamily = Object.fromEntries(
    FAMILY_ORDER.map((family) => [
      family,
      familyQuality(
        coverageLookup[family],
        familyRecords[family],
        missingByFamily[family],
        possibleFields[family],
        cutoffMs,
      ),
    ]),
  ) as Record<FeatureFamily, FamilyEvidenceQuality>;
  const allRecords = [
    ...new Map(
      FAMILY_ORDER.flatMap((family) => familyRecords[family]).map((record) => [
        `${record.sourceId}:${record.id}`,
        record,
      ]),
    ).values(),
  ];
  const allCounts = fidelityCounts(allRecords);
  const totalRecords = allRecords.length;
  const evidenceQuality: EvidenceQualityFeatures = {
    overallCoveragePct: round(
      sum(FAMILY_ORDER.map((family) => byFamily[family].coveragePct)) / FAMILY_ORDER.length,
      2,
    ),
    exactRecordRatioPct:
      totalRecords === 0 ? null : round((allCounts.exact / totalRecords) * 100, 2),
    reconstructedRecordRatioPct:
      totalRecords === 0 ? null : round((allCounts.reconstructed / totalRecords) * 100, 2),
    proxyRecordRatioPct:
      totalRecords === 0 ? null : round((allCounts.proxy / totalRecords) * 100, 2),
    sourceCount: unique(allRecords.map((record) => record.sourceId)).length,
    missingFieldCount: sum(FAMILY_ORDER.map((family) => missingByFamily[family].length)),
    byFamily,
  };

  return {
    mint: input.launch.mint,
    cutoffSeconds,
    cutoffAt,
    lifecycleFlow,
    liquidityExecution,
    ownershipCreator,
    coordinationWash,
    narrativePaidAttention,
    marketRegime,
    evidenceQuality,
    sourceIds: unique(allRecords.map((record) => record.sourceId)).sort(),
    caveats: [
      "Only canonical records whose event and availability times are at or before the cutoff are included.",
      "Coordination and wash fields are multi-signal evidence, not proof of identity, intent, or wrongdoing.",
      "Null means unavailable or not estimable; it is not silently converted to zero.",
    ],
  };
}

/** Produce the five standard ML rows for one launch. */
export function deriveFeatureTimeline(input: PointInTimeInput): PointInTimeFeatureVector[] {
  return FEATURE_CUTOFF_SECONDS.map((cutoff) => derivePointInTimeFeatures(input, cutoff));
}

export type FlatFeatureValue = number | string | boolean | null;

/**
 * Flatten model inputs without flattening evidence metadata into predictors.
 * Quote probes use stable `execution.<order-size>.*` keys.
 */
export function flattenFeatureVector(
  vector: PointInTimeFeatureVector,
): Record<string, FlatFeatureValue> {
  const flat: Record<string, FlatFeatureValue> = {
    mint: vector.mint,
    cutoffSeconds: vector.cutoffSeconds,
  };
  const copy = (prefix: string, value: object) => {
    Object.entries(value).forEach(([key, fieldValue]) => {
      if (Array.isArray(fieldValue)) return;
      flat[`${prefix}.${key}`] = fieldValue as FlatFeatureValue;
    });
  };
  copy("lifecycle", vector.lifecycleFlow);
  copy("liquidity", {
    liquidityUsd: vector.liquidityExecution.liquidityUsd,
    quoteReserveUsd: vector.liquidityExecution.quoteReserveUsd,
  });
  vector.liquidityExecution.probes.forEach((probe) =>
    copy(`execution.${probe.orderSizeUsd}`, probe),
  );
  copy("ownership", vector.ownershipCreator);
  copy("coordination", vector.coordinationWash);
  copy("narrative", vector.narrativePaidAttention);
  copy("regime", vector.marketRegime);
  return flat;
}

export const FIDELITY_RANK: Record<EvidenceFidelity, number> = {
  exact: 3,
  reconstructed: 2,
  proxy: 1,
};

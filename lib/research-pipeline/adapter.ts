import {
  derivePointInTimeFeatures,
  flattenFeatureVector,
  type CollectionStatus,
  type CoordinationProxySnapshot,
  type CreatorObservation,
  type EvidenceFidelity,
  type FamilyCoverage,
  type FeatureFamily as EngineFeatureFamily,
  type HolderBalance,
  type HolderSnapshot,
  type MarketObservation,
  type MarketRegimeObservation,
  type MetadataNarrativeObservation,
  type PaidAttentionObservation,
  type PointInTimeInput,
  type QuoteObservation,
  type SocialPostObservation,
  type SocialCountObservation,
  type TimestampedEvidence,
  type TradeObservation,
  type TransferObservation,
} from "@/lib/features";
import { classifyMetadataNarrative } from "@/lib/narrative/metadata";
import type { CoinDetailResponse, CoinFidelity, CoinObservation } from "@/lib/coins/types";
import type {
  FeatureFamily as ModelFeatureFamily,
  InputTaxonomy,
  PointInTimeFeature,
} from "@/lib/model";
import {
  RESEARCH_FEATURE_SET_VERSION,
  type AdaptedPointInTimeInput,
  type BuildResearchOptions,
  type CoinResearchResponse,
  type EligibleObservation,
  type ObservationMappingAudit,
  type ResearchModelInput,
  type StoredOutcomeRecord,
} from "./types";
import { deterministicFeatureSnapshotId } from "./repository";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const timestamp = (value: string | null | undefined): number =>
  value ? Date.parse(value) : Number.NaN;

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

function evidenceFidelity(value: CoinFidelity): EvidenceFidelity {
  if (value === "canonical-finalized" || value === "canonical-confirmed") return "exact";
  if (value === "canonical-reconstructed" || value === "indexed") return "reconstructed";
  return "proxy";
}

function isCanonical(observation: CoinObservation): boolean {
  const status = observation.canonicalStatus.toLowerCase();
  return !["failed", "orphaned", "rejected", "invalid"].some((word) =>
    status.includes(word)
  ) && observation.fidelity !== "unavailable";
}

function withAvailability(observation: CoinObservation): EligibleObservation | null {
  const availableAt = observation.availableAt ?? observation.observedAt ?? observation.retrievedAt;
  return Number.isFinite(timestamp(availableAt)) ? { ...observation, availableAt } : null;
}

function evidence(observation: EligibleObservation): TimestampedEvidence {
  return {
    id: observation.id,
    eventAt: observation.eventAt,
    availableAt: observation.availableAt,
    sourceId: observation.sourceId,
    fidelity: evidenceFidelity(observation.fidelity),
    canonical: isCanonical(observation),
  };
}

function normalizedType(observation: CoinObservation): string {
  return observation.observationType.trim().toLowerCase().replaceAll("-", "_");
}

function eventBounds(records: readonly TimestampedEvidence[]): {
  eventFrom?: string;
  eventThrough?: string;
} {
  if (!records.length) return {};
  const times = records.map((record) => record.eventAt).sort();
  return { eventFrom: times[0], eventThrough: times.at(-1) };
}

function declaredCoverage(
  family: EngineFeatureFamily,
  records: readonly TimestampedEvidence[],
  detail: CoinDetailResponse,
  notes: string[],
): FamilyCoverage {
  const status: CollectionStatus = records.length ? "partial" : "unavailable";
  return {
    family,
    status,
    ...eventBounds(records),
    notes: unique([
      ...notes,
      ...(detail.historyCoverage.partial
        ? ["The transaction/history request is bounded or incomplete."]
        : []),
    ]),
  };
}

function parseMarket(
  observation: EligibleObservation,
  graduationAt: string | null,
): MarketObservation | null {
  if (normalizedType(observation) !== "market_snapshot") return null;
  const value = observation.normalized;
  const priceUsd = asFiniteNumber(value.priceUsd);
  const marketCapUsd = asFiniteNumber(value.marketCapUsd);
  if (priceUsd === null || marketCapUsd === null) return null;
  const graduationMs = timestamp(graduationAt);
  const explicitGraduated = asBoolean(value.graduated);
  return {
    ...evidence(observation),
    priceUsd,
    marketCapUsd,
    bondingCurveProgressPct: asFiniteNumber(value.bondingCurveProgressPct),
    graduated:
      explicitGraduated ??
      (Number.isFinite(graduationMs) && graduationMs <= timestamp(observation.eventAt)),
    ...(asFiniteNumber(value.liquidityUsd) !== null
      ? { liquidityUsd: asFiniteNumber(value.liquidityUsd) as number }
      : {}),
    ...(asFiniteNumber(value.quoteReserveUsd) !== null
      ? { quoteReserveUsd: asFiniteNumber(value.quoteReserveUsd) as number }
      : {}),
    // Rolling 24-hour aggregates are deliberately not treated as launch-window cumulative flow.
    ...(asFiniteNumber(value.cumulativeBuyVolumeUsd) !== null
      ? { cumulativeBuyVolumeUsd: asFiniteNumber(value.cumulativeBuyVolumeUsd) as number }
      : {}),
    ...(asFiniteNumber(value.cumulativeSellVolumeUsd) !== null
      ? { cumulativeSellVolumeUsd: asFiniteNumber(value.cumulativeSellVolumeUsd) as number }
      : {}),
    ...(asFiniteNumber(value.cumulativeBuyCount) !== null
      ? { cumulativeBuyCount: asFiniteNumber(value.cumulativeBuyCount) as number }
      : {}),
    ...(asFiniteNumber(value.cumulativeSellCount) !== null
      ? { cumulativeSellCount: asFiniteNumber(value.cumulativeSellCount) as number }
      : {}),
  };
}

function parseTrade(observation: EligibleObservation): TradeObservation | null {
  const type = normalizedType(observation);
  if (type !== "trade" && type !== "chain_transaction") return null;
  const value = observation.normalized;
  const side = value.side ?? value.kind;
  if (side !== "buy" && side !== "sell") return null;
  const wallet = asString(value.wallet);
  const directTokenAmount = asFiniteNumber(value.tokenAmount);
  const walletTokenDelta = Array.isArray(value.tokenOwnerDeltas) && wallet
    ? value.tokenOwnerDeltas.reduce((total, raw) => {
        if (!isRecord(raw) || raw.owner !== wallet) return total;
        return total + (asFiniteNumber(raw.uiDelta) ?? 0);
      }, 0)
    : 0;
  const tokenAmount = directTokenAmount ??
    (walletTokenDelta === 0 ? null : Math.abs(walletTokenDelta));
  const priceUsd = asFiniteNumber(value.priceUsd);
  const volumeUsd = asFiniteNumber(value.volumeUsd);
  const networkAndPriorityFeeUsd = asFiniteNumber(value.networkAndPriorityFeeUsd);
  if (
    !wallet ||
    observation.slot === null
  ) {
    return null;
  }
  const feePayer = asString(value.feePayer);
  if (!feePayer) return null;
  return {
    ...evidence(observation),
    signature: observation.signature ?? observation.id,
    wallet,
    side,
    tokenAmount,
    priceUsd,
    volumeUsd,
    slot: observation.slot,
    ...(observation.transactionIndex !== null
      ? { transactionOrder: observation.transactionIndex }
      : {}),
    feePayer,
    networkAndPriorityFeeUsd,
    ...(asString(value.exactBundleId) ? { exactBundleId: asString(value.exactBundleId)! } : {}),
    ...(asBoolean(value.bundleClue) !== null ? { bundleClue: asBoolean(value.bundleClue)! } : {}),
    ...(asFiniteNumber(value.priorSharedLaunchCount) !== null
      ? { priorSharedLaunchCount: asFiniteNumber(value.priorSharedLaunchCount)! }
      : {}),
    ...(asStringArray(value.washEvidenceTags).length
      ? {
          washEvidenceTags: asStringArray(value.washEvidenceTags).filter(
            (tag): tag is TradeObservation["washEvidenceTags"] extends (infer T)[] | undefined
              ? T
              : never =>
              [
                "same-beneficial-owner",
                "repeated-back-and-forth",
                "circular-funding",
                "self-match",
              ].includes(tag),
          ),
        }
      : {}),
  };
}

function parseTransfer(observation: EligibleObservation): TransferObservation | null {
  if (normalizedType(observation) !== "transfer") return null;
  const value = observation.normalized;
  const fromWallet = asString(value.fromWallet);
  const toWallet = asString(value.toWallet);
  const amountUsd = asFiniteNumber(value.amountUsd);
  const purpose = value.purpose;
  const classification = value.counterpartyClassification;
  if (
    !fromWallet ||
    !toWallet ||
    amountUsd === null ||
    observation.slot === null ||
    !["funding", "token-transfer", "other"].includes(String(purpose)) ||
    !["ordinary", "exchange", "popular-bot", "unknown"].includes(String(classification))
  ) {
    return null;
  }
  return {
    ...evidence(observation),
    signature: observation.signature ?? observation.id,
    fromWallet,
    toWallet,
    amountUsd,
    slot: observation.slot,
    purpose: purpose as TransferObservation["purpose"],
    counterpartyClassification:
      classification as TransferObservation["counterpartyClassification"],
    ...(asBoolean(value.circularFlowClue) !== null
      ? { circularFlowClue: asBoolean(value.circularFlowClue)! }
      : {}),
  };
}

function parseCoordinationProxy(
  observation: EligibleObservation,
): CoordinationProxySnapshot | null {
  const type = normalizedType(observation);
  if (type !== "coordination_snapshot" && type !== "risk_snapshot") return null;
  const value = observation.normalized;
  const proxy: CoordinationProxySnapshot = {
    ...evidence(observation),
    provider: observation.sourceId,
    bundlerWalletCount: asFiniteNumber(value.bundlerCount),
    bundledSupplySharePct:
      asFiniteNumber(value.totalPercentage) ?? asFiniteNumber(value.bundlerPercentage),
    initialBundledSupplySharePct: asFiniteNumber(value.totalInitialPercentage),
    riskScore0To100: asFiniteNumber(value.score),
    insiderSupplySharePct: asFiniteNumber(value.insiderPercentage),
    sniperSupplySharePct: asFiniteNumber(value.sniperPercentage),
    ruggedFlag: asBoolean(value.rugged),
    classificationCaveat:
      asString(value.classificationCaveat) ??
      "Provider classification is probabilistic evidence, not proof of identity or intent.",
  };
  return [
    proxy.bundlerWalletCount,
    proxy.bundledSupplySharePct,
    proxy.initialBundledSupplySharePct,
    proxy.riskScore0To100,
    proxy.insiderSupplySharePct,
    proxy.sniperSupplySharePct,
    proxy.ruggedFlag,
  ].some((item) => item !== null) ? proxy : null;
}

function parseHolder(observation: EligibleObservation): HolderSnapshot | null {
  if (normalizedType(observation) !== "holder_snapshot") return null;
  const value = observation.normalized;
  if (!Array.isArray(value.balances)) return null;
  const balances = value.balances.flatMap((raw): HolderBalance[] => {
    if (!isRecord(raw)) return [];
    const ownerWallet = asString(raw.ownerWallet);
    const sharePct = asFiniteNumber(raw.sharePct);
    if (!ownerWallet || sharePct === null) return [];
    return [{
      ownerWallet,
      sharePct,
      ...(asBoolean(raw.isCreator) !== null ? { isCreator: asBoolean(raw.isCreator)! } : {}),
      ...(asBoolean(raw.isKnownProgramAccount) !== null
        ? { isKnownProgramAccount: asBoolean(raw.isKnownProgramAccount)! }
        : {}),
    }];
  });
  const holderCount = asFiniteNumber(value.holderCount);
  const ownerResolutionCoveragePct = asFiniteNumber(value.ownerResolutionCoveragePct);
  if (holderCount === null || ownerResolutionCoveragePct === null) return null;
  return {
    ...evidence(observation),
    holderCount,
    balances,
    creatorSharePct: asFiniteNumber(value.creatorSharePct),
    ownerResolutionCoveragePct,
    mintAuthorityRevoked: asBoolean(value.mintAuthorityRevoked),
    freezeAuthorityRevoked: asBoolean(value.freezeAuthorityRevoked),
    metadataMutable: asBoolean(value.metadataMutable),
  };
}

function parseCreator(observation: EligibleObservation): CreatorObservation | null {
  if (normalizedType(observation) !== "creator_snapshot") return null;
  const value = observation.normalized;
  return {
    ...evidence(observation),
    currentSharePct: asFiniteNumber(value.currentSharePct),
    cumulativeNetSoldUsd: asFiniteNumber(value.cumulativeNetSoldUsd),
    cumulativeFeeExtractionUsd: asFiniteNumber(value.cumulativeFeeExtractionUsd),
    priorLaunchCount: asFiniteNumber(value.priorLaunchCount),
    priorGraduationCount: asFiniteNumber(value.priorGraduationCount),
    priorTwentyFourHourSurvivorCount: asFiniteNumber(value.priorTwentyFourHourSurvivorCount),
  };
}

function parseQuote(observation: EligibleObservation): QuoteObservation | null {
  if (normalizedType(observation) !== "execution_quote") return null;
  const value = observation.normalized;
  const side = value.side;
  const orderSizeUsd = asFiniteNumber(value.orderSizeUsd);
  const routeAvailable = asBoolean(value.routeAvailable);
  const failureCode = asString(value.failureCode);
  if ((side !== "buy" && side !== "sell") || orderSizeUsd === null || routeAvailable === null) {
    return null;
  }
  // A provider transport/response failure is missing evidence, not proof that
  // the market had no route. Preserve explicit `no_route` as a real negative
  // observation and exclude infrastructure failures from route features.
  if (!routeAvailable && failureCode && failureCode !== "no_route") return null;
  return {
    ...evidence(observation),
    side,
    orderSizeUsd,
    routeAvailable,
    priceImpactPct: asFiniteNumber(value.priceImpactPct),
    networkAndPriorityFeeUsd: asFiniteNumber(value.networkAndPriorityFeeUsd),
    expectedValueUsd: asFiniteNumber(value.expectedValueUsd),
    latencyMs: asFiniteNumber(value.latencyMs),
  };
}

function parseSocial(observation: EligibleObservation): SocialPostObservation | null {
  if (normalizedType(observation) !== "social_post") return null;
  const value = observation.normalized;
  const platformPostId = asString(value.platformPostId);
  const authorId = asString(value.authorId);
  const identityMatch = value.identityMatch;
  if (
    !platformPostId ||
    !authorId ||
    !["exact-contract", "official-url", "full-name", "ticker-only"].includes(
      String(identityMatch),
    )
  ) return null;
  return {
    ...evidence(observation),
    platformPostId,
    authorId,
    identityMatch: identityMatch as SocialPostObservation["identityMatch"],
    automatedLikelihood0To1: asFiniteNumber(value.automatedLikelihood0To1),
    sentimentMinus1To1: asFiniteNumber(value.sentimentMinus1To1),
    authorFollowers: asFiniteNumber(value.authorFollowers),
    authorVerified: asBoolean(value.authorVerified),
    engagementCount: asFiniteNumber(value.engagementCount),
    narrativeClusterId: asString(value.narrativeClusterId),
    narrativeNovelty0To100: asFiniteNumber(value.narrativeNovelty0To100),
  };
}

function parseMetadataNarrative(
  observation: EligibleObservation,
): MetadataNarrativeObservation | null {
  if (normalizedType(observation) !== "pump_launch") return null;
  const name = asString(observation.normalized.name);
  const symbol = asString(observation.normalized.symbol);
  if (!name && !symbol) return null;
  const classified = classifyMetadataNarrative({
    name,
    symbol,
    descriptionLength: 0,
    hasX: false,
    hasWebsite: false,
    hasTelegram: false,
  });
  return {
    ...evidence(observation),
    theme: classified.narrativeTheme,
    matchedTokens: classified.narrativeTokens,
    themeConfidence0To100: classified.themeConfidence0To100,
    metadataCompleteness0To100: classified.metadataCompleteness0To100,
    socialLinkCount: null,
  };
}

function parseSocialCount(observation: EligibleObservation): SocialCountObservation | null {
  if (normalizedType(observation) !== "social_count") return null;
  const value = observation.normalized;
  const bucketStart = asString(value.bucketStart);
  const bucketEnd = asString(value.bucketEnd);
  const postCount = asFiniteNumber(value.postCount);
  const acceptedClasses = asStringArray(value.identityClasses).filter(
    (item): item is SocialCountObservation["identityClasses"][number] =>
      item === "exact-contract" || item === "official-url" || item === "full-name",
  );
  if (
    !bucketStart ||
    !bucketEnd ||
    bucketEnd !== observation.eventAt ||
    postCount === null ||
    postCount < 0 ||
    acceptedClasses.length === 0
  ) return null;
  return {
    ...evidence(observation),
    bucketStart,
    bucketEnd,
    postCount,
    identityClasses: acceptedClasses,
    manipulationCaveat:
      asString(value.manipulationCaveat) ??
      "Aggregate post volume can be manufactured and is not a credibility score.",
  };
}

function parsePaidAttention(
  observation: EligibleObservation,
): PaidAttentionObservation | null {
  if (normalizedType(observation) !== "paid_attention") return null;
  const value = observation.normalized;
  const channel = asString(value.channel);
  const boostCount = asFiniteNumber(value.boostCount);
  if (!channel || boostCount === null) return null;
  return {
    ...evidence(observation),
    channel,
    spendUsd: asFiniteNumber(value.spendUsd),
    boostCount,
    trendingRank: asFiniteNumber(value.trendingRank),
  };
}

function parseRegime(observation: EligibleObservation): MarketRegimeObservation | null {
  if (normalizedType(observation) !== "market_regime") return null;
  const value = observation.normalized;
  const numbers = [
    "solReturnOneHourPct",
    "solVolatilityOneHourPct",
    "medianPriorityFeeMicroLamports",
    "blockCongestionPct",
    "launchesLastHour",
    "medianLaunchVolumeFiveMinutesUsd",
    "riskAppetite0To100",
  ] as const;
  const parsed = Object.fromEntries(numbers.map((key) => [key, asFiniteNumber(value[key])]));
  if (Object.values(parsed).some((entry) => entry === null)) return null;
  if (!["risk-on", "neutral", "congested", "risk-off"].includes(String(value.label))) {
    return null;
  }
  return {
    ...evidence(observation),
    ...(parsed as unknown as Pick<
      MarketRegimeObservation,
      (typeof numbers)[number]
    >),
    label: value.label as MarketRegimeObservation["label"],
  };
}

function mappedRecordCount(input: PointInTimeInput): number {
  return input.market.length + input.trades.length + input.transfers.length +
    (input.coordinationProxies?.length ?? 0) + input.holders.length +
    input.creators.length + input.quotes.length + input.socialPosts.length +
    (input.socialCounts?.length ?? 0) + (input.metadataNarrative?.length ?? 0) +
    input.paidAttention.length + input.regimes.length;
}

export function adaptCoinDetailToPointInTime(
  detail: CoinDetailResponse,
  options: BuildResearchOptions,
): AdaptedPointInTimeInput {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const referenceAt = options.referenceClock === "graduation"
    ? detail.coin.lifecycle.graduatedAt
    : detail.coin.createdAt;
  if (!referenceAt || !Number.isFinite(timestamp(referenceAt))) {
    throw new Error(
      options.referenceClock === "graduation"
        ? "A timestamped graduation event is unavailable for this coin."
        : "A timestamped launch event is unavailable for this coin.",
    );
  }
  const decisionAt = new Date(
    timestamp(referenceAt) + options.cutoffSeconds * 1_000,
  ).toISOString();
  const decisionMs = timestamp(decisionAt);
  const evaluatedMs = timestamp(evaluatedAt);
  if (!Number.isFinite(evaluatedMs)) throw new Error("evaluatedAt must be a valid timestamp.");

  const audit: ObservationMappingAudit = {
    inputObservationCount: detail.observations.length,
    eligibleObservationCount: 0,
    excludedFutureEventCount: 0,
    excludedFutureAvailabilityCount: 0,
    excludedInvalidTimestampCount: 0,
    excludedNonCanonicalCount: 0,
    mappedCounts: {
      market: 0,
      trades: 0,
      transfers: 0,
      coordinationProxies: 0,
      holders: 0,
      creators: 0,
      quotes: 0,
      socialPosts: 0,
      socialCounts: 0,
      metadataNarrative: 0,
      paidAttention: 0,
      regimes: 0,
    },
    unmappedByType: {},
    notes: [
      "Current provider responses retain their real observation/availability time and are never backdated.",
      "DEX rolling 24-hour volume/count fields are not treated as launch-window cumulative flow.",
    ],
  };

  const eligible: EligibleObservation[] = [];
  for (const raw of detail.observations) {
    const observation = withAvailability(raw);
    if (!observation || !Number.isFinite(timestamp(observation.eventAt))) {
      audit.excludedInvalidTimestampCount += 1;
      continue;
    }
    if (!isCanonical(observation)) {
      audit.excludedNonCanonicalCount += 1;
      continue;
    }
    if (timestamp(observation.eventAt) > decisionMs) {
      audit.excludedFutureEventCount += 1;
      continue;
    }
    if (timestamp(observation.availableAt) > decisionMs) {
      audit.excludedFutureAvailabilityCount += 1;
      continue;
    }
    eligible.push(observation);
  }
  audit.eligibleObservationCount = eligible.length;

  const expectedReferenceRole = options.referenceClock === "graduation"
    ? "canonical-graduation"
    : "canonical-launch";
  const referenceCandidates = detail.coin.provenance
    .filter((item) => item.eventAt === referenceAt)
    .sort((left, right) => left.availableAt.localeCompare(right.availableAt));
  const referenceProvenance = referenceCandidates.find(
    (item) => item.role === expectedReferenceRole,
  ) ?? referenceCandidates[0];
  const referenceCanonical =
    referenceProvenance?.role === expectedReferenceRole &&
    (referenceProvenance.fidelity === "canonical-finalized" ||
      referenceProvenance.fidelity === "canonical-confirmed" ||
      referenceProvenance.fidelity === "canonical-reconstructed");
  const referenceAvailableAt = referenceProvenance?.availableAt ?? referenceAt;
  const input: PointInTimeInput = {
    launch: {
      id: `${detail.coin.mint}:${options.referenceClock}`,
      mint: detail.coin.mint,
      creatorWallet: detail.coin.creator ?? "unavailable",
      launchedAt: referenceAt,
      ...(options.referenceClock === "graduation" ? { graduationAt: referenceAt } : {}),
      eventAt: referenceAt,
      availableAt: referenceAvailableAt,
      sourceId: referenceProvenance?.sourceId ?? "pump-onchain",
      fidelity: referenceProvenance
        ? evidenceFidelity(referenceProvenance.fidelity)
        : "proxy",
      canonical: referenceCanonical,
    },
    coverage: [],
    market: [],
    trades: [],
    transfers: [],
    coordinationProxies: [],
    holders: [],
    creators: [],
    quotes: [],
    socialPosts: [],
    socialCounts: [],
    metadataNarrative: [],
    paidAttention: [],
    regimes: [],
  };

  for (const observation of eligible) {
    const market = parseMarket(observation, detail.coin.lifecycle.graduatedAt);
    const trade = parseTrade(observation);
    const transfer = parseTransfer(observation);
    const coordinationProxy = parseCoordinationProxy(observation);
    const holder = parseHolder(observation);
    const creator = parseCreator(observation);
    const quote = parseQuote(observation);
    const social = parseSocial(observation);
    const socialCount = parseSocialCount(observation);
    const metadataNarrative = parseMetadataNarrative(observation);
    const paid = parsePaidAttention(observation);
    const regime = parseRegime(observation);
    if (market) input.market.push(market);
    if (trade) input.trades.push(trade);
    if (transfer) input.transfers.push(transfer);
    if (coordinationProxy) input.coordinationProxies!.push(coordinationProxy);
    if (holder) input.holders.push(holder);
    if (creator) input.creators.push(creator);
    if (quote) input.quotes.push(quote);
    if (social) input.socialPosts.push(social);
    if (socialCount) input.socialCounts!.push(socialCount);
    if (metadataNarrative) input.metadataNarrative!.push(metadataNarrative);
    if (paid) input.paidAttention.push(paid);
    if (regime) input.regimes.push(regime);
    if (![
      market,
      trade,
      transfer,
      coordinationProxy,
      holder,
      creator,
      quote,
      social,
      socialCount,
      metadataNarrative,
      paid,
      regime,
    ].some(Boolean)) {
      const type = normalizedType(observation);
      audit.unmappedByType[type] = (audit.unmappedByType[type] ?? 0) + 1;
    }
  }

  audit.mappedCounts = {
    market: input.market.length,
    trades: input.trades.length,
    transfers: input.transfers.length,
    coordinationProxies: input.coordinationProxies!.length,
    holders: input.holders.length,
    creators: input.creators.length,
    quotes: input.quotes.length,
    socialPosts: input.socialPosts.length,
    socialCounts: input.socialCounts!.length,
    metadataNarrative: input.metadataNarrative!.length,
    paidAttention: input.paidAttention.length,
    regimes: input.regimes.length,
  };

  input.coverage = [
    declaredCoverage(
      "lifecycleFlow",
      [...input.market, ...input.trades],
      detail,
      ["Market snapshots are point observations; decoded USD-normalized trades are required for flow."],
    ),
    declaredCoverage(
      "liquidityExecution",
      [...input.market, ...input.quotes],
      detail,
      ["A market liquidity snapshot is not an executable round-trip quote."],
    ),
    declaredCoverage(
      "ownershipCreator",
      [...input.holders, ...input.creators],
      detail,
      ["Raw largest token accounts are excluded until token accounts are resolved to owners."],
    ),
    declaredCoverage(
      "coordinationWash",
      [...input.trades, ...input.transfers, ...input.coordinationProxies!],
      detail,
      ["Coordination requires wallet-resolved trades and classified funding edges."],
    ),
    declaredCoverage(
      "narrativePaidAttention",
      [...input.metadataNarrative!, ...input.socialPosts, ...input.socialCounts!, ...input.paidAttention],
      detail,
      ["Ticker-only posts are not accepted as coin identity evidence."],
    ),
    declaredCoverage(
      "marketRegime",
      input.regimes,
      detail,
      ["Priority-fee samples alone are not a complete market-regime observation."],
    ),
  ];

  const missingPrerequisites: string[] = [];
  if (timestamp(referenceAvailableAt) > decisionMs) {
    missingPrerequisites.push(
      `The ${options.referenceClock} reference event was not available to the collector by the decision cutoff.`,
    );
  }
  if (!referenceCanonical) {
    missingPrerequisites.push(
      `The ${options.referenceClock} reference event is not canonically confirmed in the stored evidence.`,
    );
  }
  if (evaluatedMs < decisionMs) {
    missingPrerequisites.push(`The ${options.cutoffSeconds}s cutoff has not elapsed.`);
  }
  if (detail.historyCoverage.partial) {
    missingPrerequisites.push(
      "Complete observation coverage from the reference event through the decision cutoff is unavailable.",
    );
  } else if (
    !detail.historyCoverage.newestEventAt ||
    timestamp(detail.historyCoverage.newestEventAt) < decisionMs
  ) {
    missingPrerequisites.push("Stored history does not extend through the decision cutoff.");
  }
  if (!input.market.length) {
    missingPrerequisites.push("No price-and-market-cap observation was available by the cutoff.");
  }
  if (!input.trades.length) {
    missingPrerequisites.push(
      "No wallet-resolved buy/sell transaction was available by the cutoff.",
    );
  } else if (
    input.trades.some((trade) =>
      trade.volumeUsd === null || trade.priceUsd === null ||
      trade.networkAndPriorityFeeUsd === null
    )
  ) {
    missingPrerequisites.push(
      "At least one decoded trade lacks point-in-time USD price, volume, or fee normalization; counts remain usable but USD flow stays null.",
    );
  }
  const requestedOrderSizeUsd = options.orderSizeUsd ?? 100;
  const requestedQuoteSides = new Set(
    input.quotes
      .filter((quote) => quote.orderSizeUsd === requestedOrderSizeUsd)
      .map((quote) => quote.side),
  );
  if (!requestedQuoteSides.has("buy") || !requestedQuoteSides.has("sell")) {
    missingPrerequisites.push(
      `No complete timestamped buy/sell quote pair for the $${requestedOrderSizeUsd} order size was available by the cutoff.`,
    );
  }
  if (!input.holders.some((holder) =>
    holder.ownerResolutionCoveragePct > 0 && holder.balances.length > 0
  )) {
    missingPrerequisites.push(
      "No owner-resolved holder snapshot was available by the cutoff; holder-count-only rows remain partial evidence.",
    );
  }
  if (!input.transfers.length) {
    missingPrerequisites.push("No USD-normalized, classified wallet funding graph was available by the cutoff.");
  }
  if (!input.socialPosts.length && !input.socialCounts!.length) {
    missingPrerequisites.push("No exact-contract, official-URL, or full-name social post history was available by the cutoff.");
  }
  if (!input.regimes.length) {
    missingPrerequisites.push("No complete timestamped market-regime observation was available by the cutoff.");
  }
  if (mappedRecordCount(input) === 0) {
    missingPrerequisites.push("None of the stored observations met a supported research feature schema.");
  }

  return {
    input,
    decision: {
      referenceClock: options.referenceClock,
      referenceAt,
      referenceAvailableAt,
      referenceCanonical,
      cutoffSeconds: options.cutoffSeconds,
      decisionAt,
      evaluatedAt,
      cutoffElapsed: evaluatedMs >= decisionMs,
      leakageRule:
        "Include a record only when eventAt <= decisionAt and availableAt <= decisionAt; never replace those times with retrieval time from a later request.",
    },
    audit,
    missingPrerequisites: unique(missingPrerequisites),
  };
}

function familyTimestamps(
  input: PointInTimeInput,
  decisionAt: string,
): Record<EngineFeatureFamily, TimestampedEvidence[]> {
  const decisionMs = timestamp(decisionAt);
  const safe = <T extends TimestampedEvidence>(rows: readonly T[]) => rows.filter(
    (row) => timestamp(row.eventAt) <= decisionMs && timestamp(row.availableAt) <= decisionMs,
  );
  return {
    lifecycleFlow: safe([input.launch, ...input.market, ...input.trades]),
    liquidityExecution: safe([...input.market, ...input.quotes]),
    ownershipCreator: safe([...input.holders, ...input.creators]),
    coordinationWash: safe([
      ...input.trades,
      ...input.transfers,
      ...(input.coordinationProxies ?? []),
    ]),
    narrativePaidAttention: safe([
      ...input.socialPosts,
      ...(input.socialCounts ?? []),
      ...input.paidAttention,
    ]),
    marketRegime: safe(input.regimes),
  };
}

function modelFamily(name: string): ModelFeatureFamily {
  if (name.startsWith("execution.") || name.startsWith("liquidity.")) return "execution";
  if (name.startsWith("ownership.")) return "ownership";
  if (name.startsWith("coordination.")) return "coordination";
  if (name.startsWith("narrative.")) return "narrative";
  if (name.startsWith("regime.")) return "market-regime";
  if (
    /volume|flow|buyer|seller|tradesPer|acceleration|velocity|imbalance/i.test(name)
  ) return "demand";
  if (name.startsWith("lifecycle.")) return "lifecycle";
  return "other";
}

function engineFamily(name: string): EngineFeatureFamily {
  if (name.startsWith("execution.") || name.startsWith("liquidity.")) {
    return "liquidityExecution";
  }
  if (name.startsWith("ownership.")) return "ownershipCreator";
  if (name.startsWith("coordination.")) return "coordinationWash";
  if (name.startsWith("narrative.")) return "narrativePaidAttention";
  if (name.startsWith("regime.")) return "marketRegime";
  return "lifecycleFlow";
}

function conservativeFidelity(records: readonly TimestampedEvidence[]): EvidenceFidelity | undefined {
  if (!records.length) return undefined;
  if (records.some((record) => record.fidelity === "proxy")) return "proxy";
  if (records.some((record) => record.fidelity === "reconstructed")) return "reconstructed";
  return "exact";
}

export function toResearchModelInput(
  adapted: AdaptedPointInTimeInput,
  vector: ReturnType<typeof derivePointInTimeFeatures>,
): ResearchModelInput {
  const flat = flattenFeatureVector(vector);
  const byFamily = familyTimestamps(adapted.input, adapted.decision.decisionAt);
  const values: Record<string, PointInTimeFeature> = {};
  for (const [name, rawValue] of Object.entries(flat)) {
    if (name === "mint" || name === "cutoffSeconds") continue;
    const computedValue = typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "boolean"
        ? Number(rawValue)
        : null;
    const records = byFamily[engineFamily(name)];
    const value = records.length ? computedValue : null;
    const eventAt = records.map((record) => record.eventAt).sort().at(-1) ??
      adapted.decision.decisionAt;
    const availableAt = records.map((record) => record.availableAt).sort().at(-1) ??
      adapted.decision.decisionAt;
    const taxonomy: InputTaxonomy = "engineered";
    values[name] = {
      value,
      taxonomy,
      family: modelFamily(name),
      eventAt,
      availableAt,
      ...(conservativeFidelity(records)
        ? { fidelity: conservativeFidelity(records)! }
        : {}),
      ...(value === null
        ? { missingReason: "The required timestamped source inputs were unavailable at this cutoff." }
        : {}),
    };
  }
  const example = {
    rowId: `${adapted.input.launch.mint}:${adapted.decision.referenceClock}:${adapted.decision.cutoffSeconds}`,
    tokenId: adapted.input.launch.mint,
    referenceClock: adapted.decision.referenceClock,
    referenceAt: adapted.decision.referenceAt,
    cutoffSeconds: adapted.decision.cutoffSeconds,
    decisionAt: adapted.decision.decisionAt,
    featureSetVersion: `${RESEARCH_FEATURE_SET_VERSION}:${adapted.decision.referenceClock}`,
    features: values,
  };
  return {
    featureSetVersion: example.featureSetVersion,
    example,
    values,
  };
}

function selectStoredOutcome(
  outcomes: readonly StoredOutcomeRecord[],
  adapted: AdaptedPointInTimeInput,
  horizonSeconds: number,
  orderSizeUsd: number,
): StoredOutcomeRecord | null {
  return outcomes.find((outcome) => {
    const evidence = outcome.evidence;
    const expectedSnapshotId = deterministicFeatureSnapshotId(
      adapted.input.launch.mint,
      adapted.decision.referenceClock,
      adapted.decision.cutoffSeconds,
    );
    const firstClassAlignment =
      outcome.featureSnapshotId !== null &&
      outcome.featureSnapshotId === expectedSnapshotId &&
      outcome.referenceClock === adapted.decision.referenceClock &&
      outcome.cutoffSeconds === adapted.decision.cutoffSeconds &&
      outcome.decisionAt === adapted.decision.decisionAt;
    const legacyClock = evidence.referenceClock;
    const legacyCutoff = evidence.cutoffSeconds;
    const legacyDecisionAt = evidence.decisionAt;
    const legacyHasIdentity =
      legacyDecisionAt === adapted.decision.decisionAt ||
      (legacyClock === adapted.decision.referenceClock &&
        legacyCutoff === adapted.decision.cutoffSeconds);
    const legacyEvidenceAlignment = outcome.featureSnapshotId === null &&
      legacyHasIdentity &&
      (legacyClock === undefined || legacyClock === adapted.decision.referenceClock) &&
      (legacyCutoff === undefined || legacyCutoff === adapted.decision.cutoffSeconds) &&
      (legacyDecisionAt === undefined || legacyDecisionAt === adapted.decision.decisionAt);
    return outcome.horizonSeconds === horizonSeconds &&
      outcome.orderSizeUsd === orderSizeUsd &&
      outcome.labelName === "net-executable-2x-before-minus-50" &&
      outcome.labelVersion === "v1" &&
      (firstClassAlignment || legacyEvidenceAlignment);
  }) ?? null;
}

export function buildCoinResearchResponse(
  detail: CoinDetailResponse,
  options: BuildResearchOptions,
): CoinResearchResponse {
  const adapted = adaptCoinDetailToPointInTime(detail, options);
  const features = derivePointInTimeFeatures(adapted.input, options.cutoffSeconds);
  const modelInput = toResearchModelInput(adapted, features);
  const horizonSeconds = options.horizonSeconds ?? 86_400;
  const orderSizeUsd = options.orderSizeUsd ?? 100;
  const storedOutcome = selectStoredOutcome(
    options.storedOutcomes ?? [],
    adapted,
    horizonSeconds,
    orderSizeUsd,
  );
  const horizonAt = new Date(
    timestamp(adapted.decision.decisionAt) + horizonSeconds * 1_000,
  ).toISOString();
  const evaluatedMs = timestamp(adapted.decision.evaluatedAt);
  const outcome = storedOutcome &&
    (storedOutcome.value === 0 || storedOutcome.value === 1) &&
    timestamp(storedOutcome.labelAvailableAt) <= evaluatedMs &&
    ["matured", "complete", "observed", "available"].includes(storedOutcome.status)
    ? {
        status: "available" as const,
        labelAvailableAt: storedOutcome.labelAvailableAt,
        target: {
          name: storedOutcome.labelName,
          version: storedOutcome.labelVersion,
          horizonSeconds,
          orderSizeUsd,
        },
        value: storedOutcome.value as 0 | 1,
        maximumNetReturnPct: asFiniteNumber(storedOutcome.evidence.maximumNetReturnPct),
        maximumDrawdownPct: asFiniteNumber(storedOutcome.evidence.maximumDrawdownPct),
        reason: "A cutoff-aligned matured outcome was loaded from persistent research storage.",
        source: "persisted-outcome" as const,
      }
    : {
        status: evaluatedMs < timestamp(horizonAt) ? "pending" as const : "unavailable" as const,
        labelAvailableAt: horizonAt,
        target: {
          name: "net-executable-2x-before-minus-50",
          version: "v1",
          horizonSeconds,
          orderSizeUsd,
        },
        value: null,
        maximumNetReturnPct: null,
        maximumDrawdownPct: null,
        reason: evaluatedMs < timestamp(horizonAt)
          ? "The outcome horizon has not elapsed; no label exists yet."
          : "No cutoff-aligned matured executable path/outcome is stored; chart-price peaks are not substituted.",
        source: "not-observed" as const,
      };
  const missingPrerequisites = unique([
    ...adapted.missingPrerequisites,
    ...(outcome.status === "unavailable"
      ? ["A complete executable entry/exit path is required for the requested outcome label."]
      : []),
  ]);
  const status: CoinResearchResponse["status"] = !adapted.decision.cutoffElapsed
    ? "pending"
    : missingPrerequisites.length
      ? "insufficient_data"
      : "ready";

  return {
    schemaVersion: "memetrace-coin-research/v1",
    generatedAt: adapted.decision.evaluatedAt,
    status,
    coin: detail.coin,
    decision: adapted.decision,
    features,
    modelInput,
    evidence: {
      historyCoverage: detail.historyCoverage,
      storage: detail.storage,
      collection: {
        mode: "not-run",
        attempted: false,
        meteredProvidersAllowed: false,
        providers: {},
        persistence: {
          state: "read-only",
          reason: "The pure research adapter does not invoke collection providers.",
        },
        warnings: [],
      },
      featureStorage: {
        state: "read-only",
        reason: "Feature-snapshot persistence has not run for this response.",
        snapshotWritten: false,
      },
      mapping: adapted.audit,
      sourceIds: features.sourceIds,
      overallCoveragePct: features.evidenceQuality.overallCoveragePct,
      missingFieldCount: features.evidenceQuality.missingFieldCount,
    },
    outcome,
    prediction: {
      status: "untrained",
      reason: "No validated model artifact has been trained from matured point-in-time examples.",
      prerequisites: [
        "Persist enough timestamped feature snapshots and cutoff-aligned matured outcomes.",
        "Pass chronological token-grouped walk-forward validation and probability calibration.",
        "Persist the exact validated artifact version before serving predictions.",
      ],
    },
    missingPrerequisites,
    caveats: unique([
      ...features.caveats,
      "The response is research evidence, not a recommendation or authorization to trade.",
      "A missing feature is null and explicit; it is never silently converted to an observed zero.",
    ]),
  };
}

/** Return the same truthful envelope when the requested lifecycle clock is absent. */
export function buildMissingReferenceResponse(
  detail: CoinDetailResponse,
  options: BuildResearchOptions,
  reason: string,
): CoinResearchResponse {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const horizonSeconds = options.horizonSeconds ?? 86_400;
  const orderSizeUsd = options.orderSizeUsd ?? 100;
  const mapping: ObservationMappingAudit = {
    inputObservationCount: detail.observations.length,
    eligibleObservationCount: 0,
    excludedFutureEventCount: 0,
    excludedFutureAvailabilityCount: 0,
    excludedInvalidTimestampCount: 0,
    excludedNonCanonicalCount: 0,
    mappedCounts: {
      market: 0,
      trades: 0,
      transfers: 0,
      coordinationProxies: 0,
      holders: 0,
      creators: 0,
      quotes: 0,
      socialPosts: 0,
      socialCounts: 0,
      metadataNarrative: 0,
      paidAttention: 0,
      regimes: 0,
    },
    unmappedByType: {},
    notes: ["No feature window was opened because the requested reference timestamp is absent."],
  };
  return {
    schemaVersion: "memetrace-coin-research/v1",
    generatedAt: evaluatedAt,
    status: "insufficient_data",
    coin: detail.coin,
    decision: {
      referenceClock: options.referenceClock,
      referenceAt: null,
      referenceAvailableAt: null,
      referenceCanonical: false,
      cutoffSeconds: options.cutoffSeconds,
      decisionAt: null,
      evaluatedAt,
      cutoffElapsed: false,
      leakageRule:
        "No historical cutoff is inferred without a timestamped reference event; current provider data is not backdated.",
    },
    features: null,
    modelInput: null,
    evidence: {
      historyCoverage: detail.historyCoverage,
      storage: detail.storage,
      collection: {
        mode: "not-run",
        attempted: false,
        meteredProvidersAllowed: false,
        providers: {},
        persistence: {
          state: "read-only",
          reason: "The pure research adapter does not invoke collection providers.",
        },
        warnings: [],
      },
      featureStorage: {
        state: "read-only",
        reason: "No feature snapshot exists without a timestamped reference event.",
        snapshotWritten: false,
      },
      mapping,
      sourceIds: [],
      overallCoveragePct: 0,
      missingFieldCount: 0,
    },
    outcome: {
      status: "unavailable",
      labelAvailableAt: evaluatedAt,
      target: {
        name: "net-executable-2x-before-minus-50",
        version: "v1",
        horizonSeconds,
        orderSizeUsd,
      },
      value: null,
      maximumNetReturnPct: null,
      maximumDrawdownPct: null,
      reason: "An outcome cannot be aligned without the requested reference timestamp.",
      source: "not-observed",
    },
    prediction: {
      status: "insufficient_data",
      reason: "A point-in-time model row cannot be built without the requested reference timestamp.",
      missingPrerequisites: [reason],
    },
    missingPrerequisites: [reason],
    caveats: [
      "No score, outcome, or historical feature was inferred from current data.",
      "The response is research evidence, not a recommendation or authorization to trade.",
    ],
  };
}

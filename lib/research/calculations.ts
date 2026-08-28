import {
  RESEARCH_CUTOFFS,
  type CutoffLabel,
  type EvidenceFidelity,
  type IllustrativeAssessment,
  type NarrativePaidAttentionObservation,
  type ObservationContext,
  type ResearchCutoff,
  type ResearchCutoffSnapshot,
  type ResearchReplay,
  type ResearchSummary,
  type ScoreComponent,
  type SourceFidelitySummary,
} from "./types";

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const clamp = (value: number, minimum = 0, maximum = 100): number =>
  Math.min(maximum, Math.max(minimum, value));

const safeDivide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

const normalize = (value: number, low: number, high: number): number =>
  high === low ? 0 : clamp(((value - low) / (high - low)) * 100);

const cutoffByLabel = (label: CutoffLabel): ResearchCutoff => {
  const cutoff = RESEARCH_CUTOFFS.find((candidate) => candidate.label === label);
  if (!cutoff) {
    throw new Error(`Unknown research cutoff: ${label}`);
  }
  return cutoff;
};

const cutoffTime = (replay: ResearchReplay, elapsedSeconds: number): number =>
  Date.parse(replay.identity.createdAt) + elapsedSeconds * 1_000;

/**
 * Returns only canonical evidence that was available by the requested cutoff.
 * The availability-time filter is the guard against future-data leakage.
 */
export function findObservationAtOrBefore<T extends ObservationContext>(
  series: readonly T[],
  replay: ResearchReplay,
  cutoff: ResearchCutoff,
): T {
  const availableBy = cutoffTime(replay, cutoff.elapsedSeconds);
  const selected = [...series]
    .filter(
      (observation) =>
        observation.canonical &&
        observation.elapsedSeconds <= cutoff.elapsedSeconds &&
        Date.parse(observation.availableAt) <= availableBy,
    )
    .sort((left, right) => right.elapsedSeconds - left.elapsedSeconds)[0];

  if (!selected) {
    throw new Error(
      `No canonical observation was available for ${cutoff.label} in the requested pillar.`,
    );
  }
  return selected;
}

const previousObservation = <T extends ObservationContext>(
  series: readonly T[],
  current: T,
): T | undefined =>
  [...series]
    .filter(
      (observation) =>
        observation.canonical &&
        observation.elapsedSeconds < current.elapsedSeconds &&
        Date.parse(observation.availableAt) <= Date.parse(current.availableAt),
    )
    .sort((left, right) => right.elapsedSeconds - left.elapsedSeconds)[0];

const bandForScore = (score: number): IllustrativeAssessment["band"] => {
  if (score < 35) return "low";
  if (score < 60) return "moderate";
  if (score < 80) return "high";
  return "very-high";
};

type ComponentInput = Omit<ScoreComponent, "contribution">;

const buildAssessment = (
  inputs: ComponentInput[],
  interpretation: string,
): IllustrativeAssessment => {
  const positiveWeight = inputs.reduce(
    (total, component) => total + Math.max(0, component.weight),
    0,
  );
  const denominator = positiveWeight || 1;
  const components = inputs.map((component) => ({
    ...component,
    normalized0To100: round(clamp(component.normalized0To100), 1),
    contribution: round(
      (clamp(component.normalized0To100) * Math.max(0, component.weight)) /
        denominator,
      1,
    ),
  }));
  const score = round(
    components.reduce((total, component) => total + component.contribution, 0),
    1,
  );

  return {
    score0To100: score,
    band: bandForScore(score),
    status: "illustrative-heuristic-not-validated",
    components,
    interpretation,
  };
};

const sumTop = (shares: readonly number[], count: number): number =>
  [...shares]
    .sort((left, right) => right - left)
    .slice(0, count)
    .reduce((total, share) => total + share, 0);

const calculateHhi = (sharesPct: readonly number[]): number =>
  sharesPct.reduce((total, share) => total + (share / 100) ** 2, 0);

const fidelityValue: Record<EvidenceFidelity, number> = {
  exact: 100,
  reconstructed: 78,
  proxy: 45,
  unavailable: 0,
};

const deriveSourceFidelity = (
  replay: ResearchReplay,
  sourceIds: readonly string[],
): SourceFidelitySummary => {
  const uniqueSources = [...new Set(sourceIds)]
    .map((id) => replay.sources.find((source) => source.id === id))
    .filter((source): source is ResearchReplay["sources"][number] => Boolean(source));
  const counts: Record<EvidenceFidelity, number> = {
    exact: 0,
    reconstructed: 0,
    proxy: 0,
    unavailable: 0,
  };
  uniqueSources.forEach((source) => {
    counts[source.fidelity] += 1;
  });
  const baseScore = safeDivide(
    uniqueSources.reduce(
      (total, source) => total + fidelityValue[source.fidelity],
      0,
    ),
    uniqueSources.length,
  );
  const degradedSourceCount = uniqueSources.filter(
    (source) => source.status !== "healthy",
  ).length;
  const statusPenalty = safeDivide(degradedSourceCount, uniqueSources.length) * 20;

  return {
    score0To100: round(clamp(baseScore - statusPenalty), 1),
    exactCount: counts.exact,
    reconstructedCount: counts.reconstructed,
    proxyCount: counts.proxy,
    unavailableCount: counts.unavailable,
    degradedSourceCount,
    limitations: uniqueSources.flatMap((source) =>
      source.limitation ? [`${source.label}: ${source.limitation}`] : [],
    ),
  };
};

const deriveNarrative = (
  current: NarrativePaidAttentionObservation,
  previous: NarrativePaidAttentionObservation | undefined,
) => {
  const elapsedMinutes = Math.max(current.elapsedSeconds / 60, 0.5);
  const postsPerMinute = current.cumulativePostCount / elapsedMinutes;
  let postVelocityChangePerMinute = 0;

  if (previous) {
    const previousMinutes = Math.max(previous.elapsedSeconds / 60, 0.5);
    const previousVelocity = previous.cumulativePostCount / previousMinutes;
    const timeDeltaMinutes = Math.max(
      (current.elapsedSeconds - previous.elapsedSeconds) / 60,
      0.5,
    );
    postVelocityChangePerMinute =
      (postsPerMinute - previousVelocity) / timeDeltaMinutes;
  }

  return {
    postsPerMinute: round(postsPerMinute),
    postVelocityChangePerMinute: round(postVelocityChangePerMinute),
    uniqueAuthorRatioPct: round(
      safeDivide(current.cumulativeUniqueAuthors, current.cumulativePostCount) *
        100,
    ),
    exactIdentityMentionRatioPct: round(
      safeDivide(
        current.cumulativeExactContractMentions +
          current.cumulativeOfficialUrlMentions,
        current.cumulativePostCount,
      ) * 100,
    ),
    likelyAutomatedPostRatioPct: round(
      safeDivide(
        current.cumulativeLikelyAutomatedPosts,
        current.cumulativePostCount,
      ) * 100,
    ),
    paidExposureUsd: current.paidExposureUsd,
    trendingRank: current.trendingRank,
    topNarratives: [...current.clusters].sort(
      (left, right) => right.postCount - left.postCount,
    ),
  };
};

export function deriveCutoffSnapshot(
  replay: ResearchReplay,
  cutoffLabel: CutoffLabel,
): ResearchCutoffSnapshot {
  const cutoff = cutoffByLabel(cutoffLabel);
  const lifecycle = findObservationAtOrBefore(
    replay.lifecycleFlow,
    replay,
    cutoff,
  );
  const previousLifecycle = previousObservation(replay.lifecycleFlow, lifecycle);
  const liquidity = findObservationAtOrBefore(
    replay.liquidityExecution,
    replay,
    cutoff,
  );
  const ownership = findObservationAtOrBefore(
    replay.ownershipCreator,
    replay,
    cutoff,
  );
  const coordination = findObservationAtOrBefore(
    replay.coordinationWash,
    replay,
    cutoff,
  );
  const narrative = findObservationAtOrBefore(
    replay.narrativePaidAttention,
    replay,
    cutoff,
  );
  const previousNarrative = previousObservation(
    replay.narrativePaidAttention,
    narrative,
  );
  const regime = findObservationAtOrBefore(
    replay.marketRegime,
    replay,
    cutoff,
  );

  const elapsedMinutes = Math.max(lifecycle.elapsedSeconds / 60, 0.5);
  const lifecycleDeltaMinutes = previousLifecycle
    ? Math.max(
        (lifecycle.elapsedSeconds - previousLifecycle.elapsedSeconds) / 60,
        0.5,
      )
    : elapsedMinutes;
  const curveDelta = previousLifecycle
    ? lifecycle.bondingCurveProgressPct -
      previousLifecycle.bondingCurveProgressPct
    : lifecycle.bondingCurveProgressPct;
  const transactionCount =
    lifecycle.cumulativeBuyCount + lifecycle.cumulativeSellCount;
  const netFlowUsd =
    lifecycle.cumulativeBuyVolumeUsd - lifecycle.cumulativeSellVolumeUsd;
  const totalFlowUsd =
    lifecycle.cumulativeBuyVolumeUsd + lifecycle.cumulativeSellVolumeUsd;
  const lifecycleSummary = {
    priceReturnFromLaunchPct: round(
      safeDivide(
        lifecycle.priceUsd - lifecycle.launchPriceUsd,
        lifecycle.launchPriceUsd,
      ) * 100,
    ),
    curveVelocityPctPointsPerMinute: round(
      curveDelta / lifecycleDeltaMinutes,
    ),
    netFlowUsd: round(netFlowUsd),
    buySellImbalance: round(safeDivide(netFlowUsd, totalFlowUsd), 3),
    transactionsPerMinute: round(transactionCount / elapsedMinutes),
    uniqueBuyersPerMinute: round(
      lifecycle.cumulativeUniqueBuyers / elapsedMinutes,
    ),
    holderGrowthPerMinute: round(lifecycle.holderCount / elapsedMinutes),
    graduated: lifecycle.graduated,
  };

  const executionProbes = liquidity.executableQuoteProbes.map((probe) => {
    const economicLoss = probe.notionalUsd - probe.expectedValueUsd;
    const totalCostUsd = Math.max(0, economicLoss) + probe.networkAndPriorityFeeUsd;
    return {
      ...probe,
      retentionPct: round(
        probe.routeAvailable
          ? safeDivide(
              probe.direction === "sell"
                ? probe.expectedValueUsd - probe.networkAndPriorityFeeUsd
                : probe.notionalUsd - totalCostUsd,
              probe.notionalUsd,
            ) * 100
          : 0,
      ),
      totalCostPct: round(safeDivide(totalCostUsd, probe.notionalUsd) * 100),
    };
  });
  const executableProbes = executionProbes.filter(
    (probe) => probe.routeAvailable,
  );
  const meanRetention = safeDivide(
    executableProbes.reduce((total, probe) => total + probe.retentionPct, 0),
    executionProbes.length,
  );
  const routeAvailabilityPct =
    safeDivide(executableProbes.length, executionProbes.length) * 100;
  const impactQuality =
    100 -
    safeDivide(
      executableProbes.reduce(
        (total, probe) => total + Math.min(probe.priceImpactPct, 25) * 4,
        0,
      ),
      executionProbes.length,
    );
  const executionAssessment = buildAssessment(
    [
      {
        key: "route-availability",
        label: "Route availability",
        rawValue: routeAvailabilityPct,
        normalized0To100: routeAvailabilityPct,
        weight: 0.35,
        explanation: "Share of standard probes with a contemporaneous route.",
      },
      {
        key: "value-retention",
        label: "Value retention",
        rawValue: meanRetention,
        normalized0To100: meanRetention,
        weight: 0.4,
        explanation: "Quoted value retained after impact and network costs.",
      },
      {
        key: "impact-quality",
        label: "Price-impact quality",
        rawValue: impactQuality,
        normalized0To100: impactQuality,
        weight: 0.25,
        explanation: "Lower quoted impact scores higher across probe sizes.",
      },
    ],
    "Illustrative liquidity and execution quality at the selected cutoff.",
  );
  const liquiditySummary = {
    quoteReserveUsd: liquidity.quoteReserveUsd,
    poolTvlUsd: liquidity.poolTvlUsd,
    reserveCoverageByNotional: executionProbes.map((probe) => ({
      notionalUsd: probe.notionalUsd,
      reserveCoverageMultiple: round(
        safeDivide(liquidity.quoteReserveUsd, probe.notionalUsd),
        1,
      ),
    })),
    probes: executionProbes,
    executionScore: executionAssessment,
  };

  const ownerWalletHhi = calculateHhi(ownership.ownerWalletSharesPct);
  const ownershipSummary = {
    topOwnerWalletSharePct: round(sumTop(ownership.ownerWalletSharesPct, 1)),
    topTenOwnerWalletSharePct: round(
      sumTop(ownership.ownerWalletSharesPct, 10),
    ),
    topTenTokenAccountSharePct: round(
      sumTop(ownership.tokenAccountSharesPct, 10),
    ),
    ownerWalletHhi: round(ownerWalletHhi, 4),
    ownerWalletEffectiveCount: round(
      ownerWalletHhi === 0 ? 0 : 1 / ownerWalletHhi,
      1,
    ),
    creatorPriorGraduationRatePct:
      ownership.creatorHistory.priorLaunchCount === 0
        ? null
        : round(
            safeDivide(
              ownership.creatorHistory.priorGraduationCount,
              ownership.creatorHistory.priorLaunchCount,
            ) * 100,
          ),
    creatorPriorSurvivalRatePct:
      ownership.creatorHistory.priorLaunchCount === 0
        ? null
        : round(
            safeDivide(
              ownership.creatorHistory.priorTwentyFourHourSurvivorCount,
              ownership.creatorHistory.priorLaunchCount,
            ) * 100,
          ),
    creatorCurrentSharePct: ownership.creatorCurrentSharePct,
    creatorNetSoldUsd: ownership.creatorNetSoldUsd,
    authorities: ownership.authorities,
  };

  const coordinationAssessment = buildAssessment(
    [
      {
        key: "common-funder",
        label: "Common-funder edges",
        rawValue: coordination.earlyBuyersWithCommonFunderPct,
        normalized0To100: coordination.earlyBuyersWithCommonFunderPct,
        weight: 0.28,
        explanation: "A clue only; exchange and bot funders can create false links.",
      },
      {
        key: "recurring-cohort",
        label: "Recurring early-buyer cohort",
        rawValue: coordination.recurringCohortBuyerPct,
        normalized0To100: coordination.recurringCohortBuyerPct,
        weight: 0.27,
        explanation: "Early buyers also observed together in prior launches.",
      },
      {
        key: "same-slot",
        label: "Same-slot entry",
        rawValue: coordination.sameSlotEarlyBuyerPct,
        normalized0To100: coordination.sameSlotEarlyBuyerPct,
        weight: 0.2,
        explanation: "Synchronized timing is evidence, not proof of common control.",
      },
      {
        key: "synchronized-exit",
        label: "Synchronized exits",
        rawValue: coordination.synchronizedExitPct,
        normalized0To100: coordination.synchronizedExitPct,
        weight: 0.2,
        explanation: "Share of observed early cohort exiting in the same window.",
      },
      {
        key: "bundle-clues",
        label: "Bundle clues",
        rawValue: coordination.bundledTransactionClueCount,
        normalized0To100: normalize(
          coordination.bundledTransactionClueCount,
          0,
          8,
        ),
        weight: 0.05,
        explanation: "Historical tips and ordering are incomplete bundle proxies.",
      },
    ],
    "Multi-edge coordination evidence; this does not identify or prove a cabal.",
  );
  const washAssessment = buildAssessment(
    [
      {
        key: "suspected-wash-share",
        label: "Suspected wash-volume share",
        rawValue: coordination.suspectedWashVolumePct,
        normalized0To100: coordination.suspectedWashVolumePct,
        weight: 0.55,
        explanation: "Volume matching the replay's wash-activity heuristics.",
      },
      {
        key: "circular-flow",
        label: "Circular value flow",
        rawValue: coordination.circularFlowUsd,
        normalized0To100: normalize(
          safeDivide(coordination.circularFlowUsd, totalFlowUsd) * 100,
          0,
          30,
        ),
        weight: 0.3,
        explanation: "Circular transfers relative to observed trading flow.",
      },
      {
        key: "self-funding-loops",
        label: "Self-funding loops",
        rawValue: coordination.selfFundingLoopCount,
        normalized0To100: normalize(coordination.selfFundingLoopCount, 0, 5),
        weight: 0.15,
        explanation: "Repeated funding paths returning to an upstream wallet.",
      },
    ],
    "Heuristic evidence of manufactured activity, with false positives possible.",
  );
  const coordinationSummary = {
    coordinationEvidenceScore: coordinationAssessment,
    washEvidenceScore: washAssessment,
    commonFunderEvidencePct: coordination.earlyBuyersWithCommonFunderPct,
    recurringCohortEvidencePct: coordination.recurringCohortBuyerPct,
    sameSlotEarlyBuyerPct: coordination.sameSlotEarlyBuyerPct,
    synchronizedExitPct: coordination.synchronizedExitPct,
  };

  const narrativeSummary = deriveNarrative(narrative, previousNarrative);
  const allSourceIds = [
    ...lifecycle.sourceIds,
    ...liquidity.sourceIds,
    ...ownership.sourceIds,
    ...coordination.sourceIds,
    ...narrative.sourceIds,
    ...regime.sourceIds,
  ];
  const sourceIds = [...new Set(allSourceIds)];
  const sourceFidelity = deriveSourceFidelity(replay, sourceIds);

  const opportunity = buildAssessment(
    [
      {
        key: "net-demand",
        label: "Net demand",
        rawValue: lifecycleSummary.buySellImbalance,
        normalized0To100: (lifecycleSummary.buySellImbalance + 1) * 50,
        weight: 0.25,
        explanation: "Buy-minus-sell volume divided by total observed flow.",
      },
      {
        key: "buyer-breadth",
        label: "Buyer breadth",
        rawValue: lifecycleSummary.uniqueBuyersPerMinute,
        normalized0To100: normalize(
          lifecycleSummary.uniqueBuyersPerMinute,
          0,
          40,
        ),
        weight: 0.2,
        explanation: "Unique buyers per minute, not raw transaction count.",
      },
      {
        key: "curve-velocity",
        label: "Curve velocity",
        rawValue: lifecycleSummary.curveVelocityPctPointsPerMinute,
        normalized0To100: normalize(
          lifecycleSummary.curveVelocityPctPointsPerMinute,
          0,
          20,
        ),
        weight: 0.2,
        explanation: "Recent percentage-point progress per minute.",
      },
      {
        key: "organic-narrative",
        label: "Organic narrative breadth",
        rawValue: narrativeSummary.uniqueAuthorRatioPct,
        normalized0To100:
          narrativeSummary.uniqueAuthorRatioPct *
          (1 - narrativeSummary.likelyAutomatedPostRatioPct / 100),
        weight: 0.2,
        explanation: "Unique-author breadth discounted for likely automation.",
      },
      {
        key: "market-regime",
        label: "Market regime",
        rawValue: regime.riskAppetiteScore0To100,
        normalized0To100: regime.riskAppetiteScore0To100,
        weight: 0.15,
        explanation: "Contemporaneous Solana risk-appetite context.",
      },
    ],
    "Illustrative opportunity evidence before integrity and execution constraints.",
  );
  const integrityRisk = buildAssessment(
    [
      {
        key: "coordination",
        label: "Coordination evidence",
        rawValue: coordinationAssessment.score0To100,
        normalized0To100: coordinationAssessment.score0To100,
        weight: 0.38,
        explanation: "Composite of several non-conclusive coordination clues.",
      },
      {
        key: "wash",
        label: "Wash-activity evidence",
        rawValue: washAssessment.score0To100,
        normalized0To100: washAssessment.score0To100,
        weight: 0.27,
        explanation: "Manufactured-activity heuristics.",
      },
      {
        key: "owner-concentration",
        label: "Owner-wallet concentration",
        rawValue: ownershipSummary.topTenOwnerWalletSharePct,
        normalized0To100: normalize(
          ownershipSummary.topTenOwnerWalletSharePct,
          20,
          85,
        ),
        weight: 0.2,
        explanation: "Controlling-owner concentration, not raw token accounts.",
      },
      {
        key: "creator-selling",
        label: "Creator net selling",
        rawValue: ownership.creatorNetSoldUsd,
        normalized0To100: normalize(
          safeDivide(ownership.creatorNetSoldUsd, totalFlowUsd) * 100,
          0,
          20,
        ),
        weight: 0.15,
        explanation: "Creator net sales as a share of total observed flow.",
      },
    ],
    "Integrity risk is separate from opportunity and is not an accusation.",
  );
  const evidenceConfidence = buildAssessment(
    [
      {
        key: "source-fidelity",
        label: "Source fidelity",
        rawValue: sourceFidelity.score0To100,
        normalized0To100: sourceFidelity.score0To100,
        weight: 0.55,
        explanation: "Exact records score above reconstructed and proxy data.",
      },
      {
        key: "pillar-coverage",
        label: "Pillar coverage",
        rawValue: 7,
        normalized0To100: 100,
        weight: 0.3,
        explanation: "Every required evidence pillar is represented at cutoff.",
      },
      {
        key: "canonical-finality",
        label: "Canonical finality",
        rawValue: [
          lifecycle,
          liquidity,
          ownership,
          coordination,
          narrative,
          regime,
        ].filter((item) => item.commitment === "finalized").length,
        normalized0To100:
          ([
            lifecycle,
            liquidity,
            ownership,
            coordination,
            narrative,
            regime,
          ].filter((item) => item.commitment === "finalized").length /
            6) *
          100,
        weight: 0.15,
        explanation: "Share of selected observations backed by finalized state.",
      },
    ],
    "Confidence describes evidence quality, not the probability of profit.",
  );

  return {
    identity: replay.identity,
    cutoff,
    asOf: new Date(cutoffTime(replay, cutoff.elapsedSeconds)).toISOString(),
    lifecycleFlow: lifecycleSummary,
    liquidityExecution: liquiditySummary,
    ownershipCreator: ownershipSummary,
    coordinationWash: coordinationSummary,
    narrativePaidAttention: narrativeSummary,
    marketRegime: regime,
    sourceFidelity,
    outputs: {
      opportunity,
      integrityRisk,
      executability: executionAssessment,
      evidenceConfidence,
    },
    sourceIds,
    caveats: [
      "Illustrative historical-replay fixture; no score is a trained or validated forecast.",
      "Coordination and wash metrics are probabilistic evidence, not proof of identity or intent.",
      ...sourceFidelity.limitations,
    ],
  };
}

export function deriveResearchTimeline(
  replay: ResearchReplay,
): ResearchCutoffSnapshot[] {
  return RESEARCH_CUTOFFS.map((cutoff) =>
    deriveCutoffSnapshot(replay, cutoff.label),
  );
}

export function deriveResearchSummary(
  replay: ResearchReplay,
  selectedCutoff: CutoffLabel = "5m",
): ResearchSummary {
  const timeline = deriveResearchTimeline(replay);
  const selected = timeline.find(
    (snapshot) => snapshot.cutoff.label === selectedCutoff,
  );
  if (!selected) {
    throw new Error(`No derived snapshot exists for ${selectedCutoff}.`);
  }

  return {
    mode: replay.mode,
    fixtureLabel: replay.fixtureLabel,
    disclaimer: replay.disclaimer,
    identity: replay.identity,
    selectedCutoff: selected,
    timeline,
    historicalOutcome: replay.historicalOutcome,
  };
}

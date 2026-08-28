import assert from "node:assert/strict";
import test from "node:test";

import type { CoinDetailResponse, CoinObservation } from "../lib/coins/types";
import type { ModelArtifact } from "../lib/model";
import {
  adaptCoinDetailToPointInTime,
  buildCoinResearchResponse,
  buildMissingReferenceResponse,
  persistFeatureSnapshot,
  planFeatureSnapshotPersistence,
  modelArtifactPassesServingGates,
  persistModelArtifact,
  serveValidatedPrediction,
  assessOutcomeForSnapshot,
  type ExecutionPathObservation,
  type MaterializerSnapshot,
} from "../lib/research-pipeline";

const mint = "11111111111111111111111111111111";
const launchAt = "2026-01-01T00:00:00.000Z";
const at = (seconds: number) =>
  new Date(Date.parse(launchAt) + seconds * 1_000).toISOString();

function observation(
  id: string,
  observationType: string,
  eventSeconds: number,
  availableSeconds: number,
  normalized: Record<string, unknown>,
  overrides: Partial<CoinObservation> = {},
): CoinObservation {
  return {
    id,
    mint,
    sourceId: "solana-rpc",
    observationType,
    eventAt: at(eventSeconds),
    observedAt: at(availableSeconds),
    availableAt: at(availableSeconds),
    retrievedAt: at(7_200),
    slot: 100 + eventSeconds,
    transactionIndex: null,
    instructionIndex: 0,
    commitment: "confirmed",
    canonicalStatus: "confirmed-success",
    fidelity: "canonical-reconstructed",
    signature: `signature-${id}`,
    normalized,
    nullReason: null,
    ...overrides,
  };
}

function detail(): CoinDetailResponse {
  return {
    generatedAt: at(7_200),
    coin: {
      mint,
      name: "Research Coin",
      symbol: "RSC",
      imageUri: null,
      metadataUri: null,
      creator: "creator-wallet",
      createdAt: launchAt,
      createdSlot: 100,
      creationSignature: "launch-signature",
      canonicalConfirmed: true,
      lifecycle: {
        venue: "pump",
        stage: "bonding",
        graduatedAt: null,
        poolAddress: null,
      },
      market: {
        priceUsd: 99,
        marketCapUsd: 99_000,
        liquidityUsd: 9_000,
        volume24hUsd: 10_000,
        buys24h: 50,
        sells24h: 30,
        priceChange24hPct: 100,
        pairAddress: "pair",
        dexId: "pumpfun",
        pairCreatedAt: null,
        observedAt: at(7_200),
      },
      provenance: [{
        sourceId: "pump-onchain",
        role: "canonical-launch",
        fidelity: "canonical-confirmed",
        eventAt: launchAt,
        observedAt: at(2),
        availableAt: at(2),
        retrievedAt: at(7_200),
        signature: "launch-signature",
        slot: 100,
      }],
      missing: [],
    },
    observations: [
      observation("buy-known", "chain_transaction", 10, 12, {
        kind: "buy",
        wallet: "buyer-one",
        feePayer: "fee-payer-one",
        tokenOwnerDeltas: [{
          owner: "buyer-one",
          account: "token-account",
          rawDelta: "1000000",
          uiDelta: 1,
          decimals: 6,
        }],
        feeLamports: 5_000,
      }),
      observation("market-known", "market_snapshot", 30, 40, {
        priceUsd: 2,
        marketCapUsd: 2_000,
        liquidityUsd: 500,
        volume24hUsd: 100_000,
        buys24h: 999,
      }, { sourceId: "dex-screener", fidelity: "market-derived" }),
      observation("late-trade", "chain_transaction", 20, 80, {
        kind: "buy",
        wallet: "buyer-two",
        feePayer: "fee-payer-two",
        tokenOwnerDeltas: [{ owner: "buyer-two", uiDelta: 2 }],
      }),
      observation("current-market", "market_snapshot", 7_200, 7_200, {
        priceUsd: 99,
        marketCapUsd: 99_000,
        liquidityUsd: 9_000,
      }, { sourceId: "dex-screener", fidelity: "market-derived" }),
      observation("failed-sell", "chain_transaction", 25, 26, {
        kind: "sell",
        wallet: "seller",
        feePayer: "seller",
        tokenOwnerDeltas: [{ owner: "seller", uiDelta: -1 }],
      }, { canonicalStatus: "confirmed-failed" }),
    ],
    historyCoverage: {
      signaturesScanned: 5,
      transactionsDecoded: 4,
      oldestEventAt: launchAt,
      newestEventAt: at(7_200),
      partial: true,
      missingReasons: ["Bounded recent history."],
    },
    storage: { state: "read-only", reason: null },
    warning: "Real observations only.",
  };
}

function validatedArtifact(featureSetVersion: string): ModelArtifact {
  const metrics = {
    exampleCount: 4,
    tokenCount: 4,
    positiveRate: 0.5,
    brierScore: 0.2,
    prAuc: 0.6,
    precisionAtK: 0.5,
    selectedCount: 1,
    meanNetReturnPctAtK: 10,
    netExpectedValuePctAtK: 5,
    maximumStrategyDrawdownPct: 20,
  };
  const policy = {
    folds: 1,
    calibrationFraction: 0.2,
    minimumExamples: 1,
    minimumTokens: 1,
    minimumPositiveExamples: 1,
    minimumNegativeExamples: 1,
    minimumTrainTokens: 1,
    minimumTestTokens: 1,
    topFraction: 0.1,
    l2Penalty: 0.01,
    learningRate: 0.04,
    iterations: 10,
  };
  return {
    schemaVersion: "memetrace-model-artifact/v1",
    modelVersion: "test-validated-v1",
    createdAt: at(90_000),
    target: {
      name: "net-executable-2x-before-minus-50",
      version: "v1",
      horizonSeconds: 86_400,
      orderSizeUsd: 100,
    },
    featureSetVersion,
    featureDefinitions: {
      "lifecycle.tokenAgeSeconds": { family: "lifecycle", taxonomy: "engineered" },
    },
    trainingThrough: at(80_000),
    datasetFingerprint: "test-fingerprint",
    policy,
    members: [{
      memberId: "test-member",
      trainedThrough: at(80_000),
      trainingTokenCount: 4,
      standardizer: {
        featureNames: ["lifecycle.tokenAgeSeconds"],
        means: [60],
        standardDeviations: [1],
      },
      coefficients: [0.1],
      missingnessCoefficients: [0],
      intercept: 0,
      calibrator: { slope: 1, intercept: 0, fitted: true },
    }],
    outOfFoldMetrics: metrics,
    folds: [{
      fold: 1,
      trainTokenCount: 2,
      testTokenCount: 2,
      trainThrough: at(40_000),
      testFrom: at(50_000),
      testThrough: at(80_000),
      metrics,
    }],
    relationships: [],
    familyAblations: [],
    trainingAudit: {
      acceptedCount: 4,
      rejectedRowIds: [],
      issues: [],
      datasetAsOf: at(90_000),
    },
  };
}

function materializerSnapshot(): MaterializerSnapshot {
  return {
    id: `feature:${mint}:launch:60:v2`,
    assetId: `solana:${mint}`,
    mint,
    cutoffSeconds: 60,
    decisionAt: at(60),
    referenceClock: "launch",
    referenceAt: launchAt,
  };
}

function executionPath(
  coverageStatus: "complete" | "partial" | "unavailable" = "complete",
): ExecutionPathObservation {
  const snapshot = materializerSnapshot();
  return {
    id: "execution-path-1",
    assetId: snapshot.assetId,
    sourceId: "jupiter",
    eventAt: at(86_460),
    availableAt: at(86_462),
    fidelity: "exact",
    canonical: true,
    normalized: {
      featureSnapshotId: snapshot.id,
      referenceClock: "launch",
      cutoffSeconds: 60,
      decisionAt: snapshot.decisionAt,
      orderSizeUsd: 100,
      entryAt: snapshot.decisionAt,
      entryAvailableAt: snapshot.decisionAt,
      entryRouteAvailable: true,
      totalEntryCostUsd: 100,
      exits: [
        {
          id: "exit-target",
          eventAt: at(160),
          availableAt: at(161),
          sourceId: "jupiter",
          fidelity: "exact",
          canonical: true,
          netExitValueUsd: 210,
          exitRouteAvailable: true,
          priceImpactPct: 1,
        },
        {
          id: "exit-later-downside",
          eventAt: at(260),
          availableAt: at(261),
          sourceId: "jupiter",
          fidelity: "exact",
          canonical: true,
          netExitValueUsd: 40,
          exitRouteAvailable: true,
          priceImpactPct: 5,
        },
      ],
      coverage: {
        status: coverageStatus,
        eventThrough: at(86_460),
        availableAt: at(86_462),
        fidelity: "exact",
        sourceIds: ["jupiter"],
      },
    },
  };
}

test("adapter preserves chain counts but does not invent historical USD flow", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });

  assert.equal(result.status, "insufficient_data");
  assert.equal(result.features?.lifecycleFlow.buyCount, 1);
  assert.equal(result.features?.lifecycleFlow.uniqueBuyers, 1);
  assert.equal(result.features?.lifecycleFlow.buyVolumeUsd, null);
  assert.equal(result.features?.lifecycleFlow.netFlowUsd, null);
  assert.equal(result.features?.lifecycleFlow.priceUsd, 2);
  assert.equal(result.features?.lifecycleFlow.buyCount, 1);
  assert.equal(result.evidence.mapping.excludedFutureEventCount, 1);
  assert.equal(result.evidence.mapping.excludedFutureAvailabilityCount, 1);
  assert.equal(result.evidence.mapping.excludedNonCanonicalCount, 1);
  assert.equal(result.prediction.status, "untrained");
  assert.match(result.missingPrerequisites.join(" "), /USD price, volume, or fee/i);
});

test("every model feature retains timestamps no later than the decision cutoff", () => {
  const adapted = adaptCoinDetailToPointInTime(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  assert.ok(result.modelInput);
  for (const feature of Object.values(result.modelInput!.values)) {
    assert.ok(Date.parse(feature.eventAt) <= Date.parse(adapted.decision.decisionAt));
    assert.ok(Date.parse(feature.availableAt) <= Date.parse(adapted.decision.decisionAt));
  }
});

test("a current provider snapshot is not backdated into an old cutoff", () => {
  const currentOnly = detail();
  currentOnly.observations = currentOnly.observations.filter(
    (row) => row.id === "current-market",
  );
  const result = buildCoinResearchResponse(currentOnly, {
    referenceClock: "launch",
    cutoffSeconds: 300,
    evaluatedAt: at(7_200),
  });
  assert.equal(result.features?.lifecycleFlow.priceUsd, null);
  assert.equal(result.evidence.mapping.excludedFutureEventCount, 1);
  assert.equal(result.status, "insufficient_data");
});

test("stored vendor proxies map to separate coordination and narrative features", () => {
  const source = detail();
  const baseline = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  source.observations.push(
    observation("coordination-proxy", "coordination_snapshot", 20, 20, {
      bundlerCount: 4,
      totalPercentage: 16,
      totalInitialPercentage: 22,
      probabilisticEvidenceOnly: true,
      classificationCaveat: "Vendor classification only.",
    }, { sourceId: "solana-tracker", fidelity: "indexed" }),
    observation("risk-proxy", "risk_snapshot", 25, 25, {
      score: 68,
      rugged: false,
      insiderPercentage: 11,
      sniperPercentage: 7,
      bundlerCount: 4,
      bundlerPercentage: 16,
      classificationCaveat: "Vendor risk estimate.",
    }, { sourceId: "solana-tracker", fidelity: "indexed" }),
    observation("x-count", "social_count", 60, 60, {
      bucketStart: at(30),
      bucketEnd: at(60),
      postCount: 9,
      identityClasses: ["exact-contract", "official-url", "full-name"],
      manipulationCaveat: "Counts can be manufactured.",
    }, { sourceId: "x-api", fidelity: "indexed" }),
  );
  const result = buildCoinResearchResponse(source, {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  assert.equal(result.evidence.mapping.mappedCounts.coordinationProxies, 2);
  assert.equal(result.evidence.mapping.mappedCounts.socialCounts, 1);
  assert.equal(result.features?.coordinationWash.indexedBundlerWalletCount, 4);
  assert.equal(result.features?.coordinationWash.indexedRiskScore0To100, 68);
  assert.equal(result.features?.coordinationWash.indexedInsiderSupplySharePct, 11);
  assert.equal(result.features?.narrativePaidAttention.postCount, null);
  assert.equal(
    result.features?.narrativePaidAttention.indexedExactIdentityPostCount,
    9,
  );
  assert.equal(
    result.features?.coordinationWash.coordinationEvidence0To100,
    baseline.features?.coordinationWash.coordinationEvidence0To100,
  );
});

test("partial holder counts and one-sided quotes remain explicit prerequisites", () => {
  const source = detail();
  source.observations.push(
    observation("holder-count-only", "holder_snapshot", 45, 45, {
      holderCount: 123,
      balances: [],
      creatorSharePct: null,
      ownerResolutionCoveragePct: 0,
      mintAuthorityRevoked: null,
      freezeAuthorityRevoked: null,
      metadataMutable: null,
    }, { sourceId: "solana-tracker", fidelity: "indexed" }),
    observation("buy-quote-only", "execution_quote", 50, 50, {
      side: "buy",
      orderSizeUsd: 100,
      routeAvailable: true,
      priceImpactPct: 2,
      networkAndPriorityFeeUsd: null,
      expectedValueUsd: 100,
      latencyMs: 40,
    }, { sourceId: "jupiter", fidelity: "market-derived" }),
  );
  const result = buildCoinResearchResponse(source, {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
    orderSizeUsd: 100,
  });
  assert.match(result.missingPrerequisites.join(" "), /complete timestamped buy\/sell quote pair/i);
  assert.match(result.missingPrerequisites.join(" "), /holder-count-only rows remain partial/i);
  assert.equal(result.features?.ownershipCreator.holderCount, 123);
});

test("a later provider transport failure does not erase an earlier usable quote pair", () => {
  const source = detail();
  source.observations.push(
    observation("buy-quote", "execution_quote", 50, 50, {
      side: "buy",
      orderSizeUsd: 100,
      routeAvailable: true,
      priceImpactPct: 1,
      networkAndPriorityFeeUsd: null,
      expectedValueUsd: 100,
      latencyMs: 40,
      failureCode: null,
    }, { sourceId: "jupiter", fidelity: "market-derived" }),
    observation("sell-quote", "execution_quote", 51, 51, {
      side: "sell",
      orderSizeUsd: 100,
      routeAvailable: true,
      priceImpactPct: 2,
      networkAndPriorityFeeUsd: null,
      expectedValueUsd: 92,
      latencyMs: 45,
      failureCode: null,
    }, { sourceId: "jupiter", fidelity: "market-derived" }),
    observation("network-failure", "execution_quote", 55, 55, {
      side: "buy",
      orderSizeUsd: 100,
      routeAvailable: false,
      priceImpactPct: null,
      networkAndPriorityFeeUsd: null,
      expectedValueUsd: null,
      latencyMs: 0,
      failureCode: "network_error",
    }, { sourceId: "jupiter", fidelity: "market-derived" }),
  );
  const result = buildCoinResearchResponse(source, {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
    orderSizeUsd: 100,
  });
  assert.equal(result.features?.liquidityExecution.probes[0]?.buyRouteAvailable, true);
  assert.equal(result.features?.liquidityExecution.probes[0]?.sellRouteAvailable, true);
  assert.equal(result.features?.liquidityExecution.probes[0]?.grossRoundTripRetentionPct, 92);
  assert.equal(result.features?.liquidityExecution.probes[0]?.roundTripRetentionPct, null);
});

test("missing graduation returns an explicit HTTP-ready insufficient-data envelope", () => {
  const source = detail();
  assert.throws(
    () => buildCoinResearchResponse(source, {
      referenceClock: "graduation",
      cutoffSeconds: 300,
      evaluatedAt: at(7_200),
    }),
    /graduation event is unavailable/i,
  );
  const result = buildMissingReferenceResponse(source, {
    referenceClock: "graduation",
    cutoffSeconds: 300,
    evaluatedAt: at(7_200),
  }, "A timestamped graduation event is unavailable for this coin.");
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.features, null);
  assert.equal(result.modelInput, null);
  assert.equal(result.prediction.status, "insufficient_data");
});

test("only a cutoff-aligned matured stored outcome becomes an available label", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(100_000),
    horizonSeconds: 86_400,
    orderSizeUsd: 100,
    storedOutcomes: [{
      featureSnapshotId: `feature:${mint}:launch:60:v2`,
      referenceClock: "launch",
      cutoffSeconds: 60,
      decisionAt: at(60),
      labelName: "net-executable-2x-before-minus-50",
      labelVersion: "v1",
      horizonSeconds: 86_400,
      orderSizeUsd: 100,
      value: 1,
      status: "matured",
      labelAvailableAt: at(86_500),
      evidence: {
        referenceClock: "launch",
        cutoffSeconds: 60,
        decisionAt: at(60),
        maximumNetReturnPct: 130,
        maximumDrawdownPct: 20,
      },
    }],
  });
  assert.equal(result.outcome.status, "available");
  assert.ok("value" in result.outcome);
  assert.equal("value" in result.outcome ? result.outcome.value : null, 1);
});

test("a first-class snapshot mismatch cannot fall back to matching legacy evidence", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(100_000),
    storedOutcomes: [{
      featureSnapshotId: `feature:${mint}:launch:300:v2`,
      referenceClock: "launch",
      cutoffSeconds: 300,
      decisionAt: at(300),
      labelName: "net-executable-2x-before-minus-50",
      labelVersion: "v1",
      horizonSeconds: 86_400,
      orderSizeUsd: 100,
      value: 1,
      status: "matured",
      labelAvailableAt: at(86_500),
      evidence: {
        referenceClock: "launch",
        cutoffSeconds: 60,
        decisionAt: at(60),
      },
    }],
  });
  assert.equal(result.outcome.status, "unavailable");
});

test("a different target or not-yet-available label is never selected", () => {
  const common = {
    featureSnapshotId: `feature:${mint}:launch:60:v2`,
    referenceClock: "launch" as const,
    cutoffSeconds: 60,
    decisionAt: at(60),
    labelVersion: "v1",
    horizonSeconds: 86_400,
    orderSizeUsd: 100,
    value: 1,
    status: "matured",
    evidence: {},
  };
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(100_000),
    storedOutcomes: [
      {
        ...common,
        labelName: "different-target",
        labelAvailableAt: at(90_000),
      },
      {
        ...common,
        labelName: "net-executable-2x-before-minus-50",
        labelAvailableAt: at(110_000),
      },
    ],
  });
  assert.equal(result.outcome.status, "unavailable");
});

test("pending cutoffs are never planned for persistence", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(30),
  });
  assert.equal(result.status, "pending");
  const plan = planFeatureSnapshotPersistence(result);
  assert.equal(plan.record, null);
  assert.match(plan.reason ?? "", /only elapsed/i);
});

test("a reference first observed after the cutoff is never persisted", () => {
  const source = detail();
  source.coin.provenance[0].availableAt = at(120);
  const result = buildCoinResearchResponse(source, {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.decision.referenceAvailableAt, at(120));
  assert.equal(planFeatureSnapshotPersistence(result).record, null);
});

test("elapsed leakage-audited snapshots use a deterministic persisted envelope", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  const first = planFeatureSnapshotPersistence(result);
  const second = planFeatureSnapshotPersistence(result);
  assert.ok(first.record);
  assert.equal(first.record?.id, second.record?.id);
  assert.equal(first.record?.decisionAvailableAt, at(60));
  const featureJson = JSON.parse(first.record!.featureJson) as Record<string, unknown>;
  assert.equal(featureJson.referenceClock, "launch");
  assert.equal(featureJson.referenceAt, launchAt);
  assert.ok(featureJson.values);
});

test("snapshot storage failure is nonfatal and explicit", async () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  const storage = await persistFeatureSnapshot(result, async () => {
    throw new Error("test storage failure");
  });
  assert.equal(storage.state, "failed");
  assert.equal(storage.snapshotWritten, false);
  assert.match(storage.reason ?? "", /test storage failure/i);
});

test("snapshot persistence rejects reversed feature provenance timestamps", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  assert.ok(result.modelInput);
  const first = Object.values(result.modelInput!.values)[0];
  first.eventAt = at(50);
  first.availableAt = at(40);
  const plan = planFeatureSnapshotPersistence(result);
  assert.equal(plan.record, null);
  assert.match(plan.reason ?? "", /invalid, reversed, or post-decision/i);
});

test("only calibrated walk-forward artifacts pass validated serving gates", async () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  const artifact = validatedArtifact(result.modelInput!.featureSetVersion);
  assert.equal(modelArtifactPassesServingGates(artifact), true);
  artifact.members[0].calibrator.fitted = false;
  assert.equal(modelArtifactPassesServingGates(artifact), false);
  let writerCalled = false;
  const persistence = await persistModelArtifact(artifact, "validated", async () => {
    writerCalled = true;
  });
  assert.equal(writerCalled, false);
  assert.equal(persistence.state, "failed");
});

test("validated serving gates reject artifacts with unobserved evaluation metrics", () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  const artifact = validatedArtifact(result.modelInput!.featureSetVersion);
  Object.assign(artifact.outOfFoldMetrics as unknown as Record<string, unknown>, {
    brierScore: null,
    prAuc: null,
    precisionAtK: null,
  });
  assert.equal(modelArtifactPassesServingGates(artifact), false);
});

test("validated predictions remain available when shadow persistence fails", async () => {
  const result = buildCoinResearchResponse(detail(), {
    referenceClock: "launch",
    cutoffSeconds: 60,
    evaluatedAt: at(7_200),
  });
  const artifact = validatedArtifact(result.modelInput!.featureSetVersion);
  const served = await serveValidatedPrediction(result, {
    targetName: artifact.target.name,
    targetVersion: artifact.target.version,
    horizonSeconds: artifact.target.horizonSeconds,
    orderSizeUsd: artifact.target.orderSizeUsd,
  }, {
    load: async () => ({ artifact, warning: null }),
    writePrediction: async () => {
      throw new Error("prediction store offline");
    },
  });
  assert.equal(served.prediction.status, "predicted");
  if (served.prediction.status !== "predicted") return;
  assert.equal(served.prediction.artifactStatus, "validated");
  assert.equal(served.prediction.persistence.mode, "shadow");
  assert.equal(served.prediction.persistence.state, "failed");
  assert.match(served.prediction.persistence.reason ?? "", /store offline/i);
});

test("outcome materialization writes only a mature complete aligned path", () => {
  const assessment = assessOutcomeForSnapshot(
    materializerSnapshot(),
    [executionPath("complete")],
    { horizonSeconds: 86_400, targetMultiple: 2, downsideMultiple: 0.5 },
    100,
    at(90_000),
  );
  assert.equal(assessment.status, "available");
  assert.equal(assessment.record?.value, 1);
  assert.equal(assessment.record?.featureSnapshotId, materializerSnapshot().id);
  assert.equal(assessment.record?.referenceClock, "launch");
  assert.equal(assessment.record?.cutoffSeconds, 60);
  assert.equal(assessment.record?.decisionAt, at(60));
});

test("partial execution coverage remains pending and never becomes false zero", () => {
  const assessment = assessOutcomeForSnapshot(
    materializerSnapshot(),
    [executionPath("partial")],
    { horizonSeconds: 86_400, targetMultiple: 2, downsideMultiple: 0.5 },
    100,
    at(90_000),
  );
  assert.equal(assessment.status, "pending");
  assert.equal(assessment.record, null);
  assert.equal(assessment.label?.reachedTargetBeforeDownside, null);
});

test("missing execution paths remain missing rather than inferred as losses", () => {
  const assessment = assessOutcomeForSnapshot(
    materializerSnapshot(),
    [],
    { horizonSeconds: 86_400, targetMultiple: 2, downsideMultiple: 0.5 },
    100,
    at(90_000),
  );
  assert.equal(assessment.status, "missing-path");
  assert.equal(assessment.record, null);
  assert.equal(assessment.label, null);
});

import assert from "node:assert/strict";
import test from "node:test";

import { POST as runPipelineRoute } from "../app/api/pipeline/run/route";
import type { CoinDetailResponse, CoinListItem } from "../lib/coins/types";
import type { ModelArtifact, PointInTimeExample } from "../lib/model";
import {
  normalizeResearchPipelineOptions,
  runResearchPipeline,
} from "../lib/pipeline";

const MINT = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN";
const LAUNCH_AT = "2026-01-01T00:00:00.000Z";
const GRADUATION_AT = "2026-01-01T00:30:00.000Z";
const EVALUATED_AT = "2026-01-01T02:00:00.000Z";

function coin(): CoinListItem {
  return {
    mint: MINT,
    name: "Research Coin",
    symbol: "RSC",
    imageUri: null,
    metadataUri: null,
    creator: "creator-wallet",
    createdAt: LAUNCH_AT,
    createdSlot: 100,
    creationSignature: "launch-signature",
    canonicalConfirmed: true,
    lifecycle: {
      venue: "pump",
      stage: "graduated",
      graduatedAt: GRADUATION_AT,
      poolAddress: "pool-address",
    },
    market: {
      priceUsd: 0.01,
      marketCapUsd: 10_000,
      liquidityUsd: 2_000,
      volume24hUsd: 5_000,
      buys24h: 20,
      sells24h: 10,
      priceChange24hPct: 10,
      pairAddress: "pair-address",
      dexId: "pumpfun",
      pairCreatedAt: LAUNCH_AT,
      observedAt: EVALUATED_AT,
    },
    provenance: [{
      sourceId: "pump-onchain",
      role: "canonical-launch",
      fidelity: "canonical-confirmed",
      eventAt: LAUNCH_AT,
      observedAt: "2026-01-01T00:00:02.000Z",
      availableAt: "2026-01-01T00:00:02.000Z",
      retrievedAt: EVALUATED_AT,
      signature: "launch-signature",
      slot: 100,
    }, {
      sourceId: "pump-onchain",
      role: "canonical-graduation",
      fidelity: "canonical-confirmed",
      eventAt: GRADUATION_AT,
      observedAt: "2026-01-01T00:30:02.000Z",
      availableAt: "2026-01-01T00:30:02.000Z",
      retrievedAt: EVALUATED_AT,
      signature: "graduation-signature",
      slot: 500,
    }],
    missing: [],
  };
}

function detail(): CoinDetailResponse {
  return {
    generatedAt: EVALUATED_AT,
    coin: coin(),
    observations: [],
    historyCoverage: {
      signaturesScanned: 10,
      transactionsDecoded: 10,
      oldestEventAt: LAUNCH_AT,
      newestEventAt: GRADUATION_AT,
      partial: false,
      missingReasons: [],
    },
    storage: { state: "written", reason: null, assetsWritten: 1, observationsWritten: 2 },
    warning: "Real observations only.",
  };
}

function example(referenceClock: "launch" | "graduation"): PointInTimeExample {
  const referenceAt = referenceClock === "launch" ? LAUNCH_AT : GRADUATION_AT;
  return {
    rowId: `feature:${referenceClock}`,
    tokenId: `solana:${MINT}`,
    referenceClock,
    referenceAt,
    cutoffSeconds: 30,
    decisionAt: new Date(Date.parse(referenceAt) + 30_000).toISOString(),
    featureSetVersion: `memetrace-point-in-time/v2:${referenceClock}`,
    features: {},
    outcome: {
      name: "net-executable-2x-before-minus-50",
      version: "v1",
      value: 1,
      horizonSeconds: 86_400,
      orderSizeUsd: 100,
      labelAvailableAt: EVALUATED_AT,
      status: "matured",
    },
  };
}

test("one bounded pipeline run covers both clocks, keeps one detail load, and writes candidates only", async () => {
  let detailLoads = 0;
  let collectionCalls = 0;
  let featureWrites = 0;
  let predictionCalls = 0;
  let outcomeCalls = 0;
  let alertCalls = 0;
  const artifactStatuses: string[] = [];
  const collectionAuthorizations: boolean[] = [];

  const result = await runResearchPipeline({
    maxCoins: 1,
    maxDiscoveryPages: 1,
    collectAdvanced: true,
    allowMetered: true,
    runTelegramAlerts: true,
    telegramDryRun: true,
    evaluatedAt: EVALUATED_AT,
  }, {
    now: () => new Date(EVALUATED_AT),
    listCoins: async () => ({
      generatedAt: EVALUATED_AT,
      coins: [coin()],
      pagination: { limit: 1, nextCursor: null, hasMore: false },
      ingestion: {
        requestedSource: "auto",
        discoverySources: ["pump-onchain"],
        coverage: [],
        storage: { state: "written", reason: null, assetsWritten: 1 },
        warnings: [],
      },
    }),
    getCoinDetail: async () => {
      detailLoads += 1;
      return detail();
    },
    collectTokenResearchInputs: async (_mint, options) => {
      collectionCalls += 1;
      collectionAuthorizations.push(options.allowMetered === true);
      return {
        schemaVersion: "memetrace-token-collection/v1",
        mint: MINT,
        generatedAt: EVALUATED_AT,
        window: { from: LAUNCH_AT, to: EVALUATED_AT, endExclusive: true, maxPagesPerProvider: 1 },
        policy: {
          scraping: "disabled",
          trading: "disabled",
          transactionSubmission: "disabled",
          meteredProvidersEnabled: true,
          note: "test",
        },
        providers: Object.fromEntries(["helius", "solanaTracker", "x", "jupiter", "jito"].map(
          (providerId) => [providerId, {
            providerId,
            state: "collected",
            metered: providerId !== "jupiter" && providerId !== "jito",
            configured: true,
            startedAt: EVALUATED_AT,
            completedAt: EVALUATED_AT,
            data: null,
            itemsCollected: 0,
            pagesFetched: 1,
            truncated: false,
            errorCode: null,
            caveats: [],
          }],
        )),
        coinObservations: [],
        persistence: { state: "written", reason: null, observationsWritten: 4 },
        warnings: [],
      } as never;
    },
    loadStoredOutcomesForMint: async () => ({ outcomes: [], storageWarning: null }),
    buildCoinResearchResponse: (_coinDetail, options) => ({
      coin: coin(),
      status: "ready",
      decision: {
        referenceClock: options.referenceClock,
        cutoffSeconds: options.cutoffSeconds,
      },
    }) as never,
    persistFeatureSnapshot: async () => {
      featureWrites += 1;
      return {
        state: "written",
        reason: null,
        snapshotWritten: true,
        snapshotId: `snapshot-${featureWrites}`,
      };
    },
    serveValidatedPrediction: async () => {
      predictionCalls += 1;
      return {
        prediction: {
          status: "predicted",
          persistence: { state: "written" },
        },
        caveats: [],
      } as never;
    },
    materializeMaturedOutcomes: async (options) => {
      outcomeCalls += 1;
      assert.equal(options?.dryRun, false);
      assert.equal(options?.labelAsOf, EVALUATED_AT);
      return {
        scannedSnapshots: 10,
        available: 1,
        outcomesWritten: 1,
        pending: 0,
        unavailable: 0,
        invalid: 0,
        missingPath: 9,
        storage: { state: "written", reason: null },
        caveats: [],
      } as never;
    },
    loadPersistedResearchDataset: async () => ({
      examples: [example("launch"), example("graduation")],
      repository: {
        featureSnapshotCount: 2,
        outcomeCount: 2,
        assetCount: 1,
        rejectedSnapshotCount: 0,
        rejectionReasons: {},
      },
    }),
    trainResearchModel: (examples) => ({
      status: "trained",
      artifact: {
        modelVersion: `candidate-${examples[0]?.referenceClock}`,
      } as ModelArtifact,
    }),
    persistModelArtifact: async (artifact, status) => {
      artifactStatuses.push(status);
      return {
        state: "written",
        status,
        modelVersion: artifact.modelVersion,
        reason: null,
      };
    },
    runTelegramShadowAlerts: async (options) => {
      alertCalls += 1;
      assert.equal(options?.dryRun, true);
      return {
        status: "dry-run",
        considered: 1,
        eligible: 1,
        delivered: 0,
        failed: 0,
        skippedPreviouslyDelivered: 0,
        details: [],
        reason: null,
      };
    },
  });

  assert.equal(detailLoads, 1);
  assert.equal(collectionCalls, 1);
  assert.deepEqual(collectionAuthorizations, [true]);
  assert.equal(featureWrites, 10);
  assert.equal(predictionCalls, 10);
  assert.equal(outcomeCalls, 1);
  assert.equal(alertCalls, 1);
  assert.deepEqual(artifactStatuses, ["candidate", "candidate"]);
  assert.deepEqual(result.snapshots.byClock, { launch: 5, graduation: 5 });
  assert.equal(result.snapshots.written, 10);
  assert.equal(result.predictions.validatedServed, 10);
  assert.equal(result.predictions.shadowWritten, 10);
  assert.equal(result.outcomes.written, 1);
  assert.equal(result.training[0].examples, 1);
  assert.equal(result.training[1].examples, 1);
  assert.equal(result.safety.automaticTrading, false);
  assert.equal(result.safety.candidateAutoPromotion, false);
});

test("pipeline defaults keep metered collection and Telegram delivery off", () => {
  const normalized = normalizeResearchPipelineOptions({}, new Date(EVALUATED_AT));
  assert.equal(normalized.allowMetered, false);
  assert.equal(normalized.runTelegramAlerts, false);
  assert.equal(normalized.telegramDryRun, true);
  assert.ok(normalized.maxCoins <= 10);
  assert.ok(normalized.maxDiscoveryPages <= 3);
  assert.ok(normalized.collectionMaxPages <= 2);
  assert.ok(normalized.orderSizesUsd.length <= 3);
  const future = normalizeResearchPipelineOptions(
    { evaluatedAt: "2027-01-01T00:00:00.000Z" },
    new Date(EVALUATED_AT),
  );
  assert.equal(future.evaluatedAt, EVALUATED_AT);
});

test("advanced provider collection is skipped for a coin without a canonical timestamp", async () => {
  const noncanonicalDetail = detail();
  noncanonicalDetail.coin = { ...noncanonicalDetail.coin, canonicalConfirmed: false };
  let collectionCalls = 0;
  const result = await runResearchPipeline({
    maxCoins: 1,
    collectAdvanced: true,
    allowMetered: true,
    evaluatedAt: EVALUATED_AT,
  }, {
    now: () => new Date(EVALUATED_AT),
    listCoins: async () => ({
      generatedAt: EVALUATED_AT,
      coins: [noncanonicalDetail.coin],
      pagination: { limit: 1, nextCursor: null, hasMore: false },
      ingestion: {
        requestedSource: "auto",
        discoverySources: ["dex-screener"],
        coverage: [],
        storage: { state: "written", reason: null },
        warnings: [],
      },
    }),
    getCoinDetail: async () => noncanonicalDetail,
    collectTokenResearchInputs: async () => {
      collectionCalls += 1;
      throw new Error("should not run");
    },
    loadStoredOutcomesForMint: async () => ({ outcomes: [], storageWarning: null }),
    buildCoinResearchResponse: () => ({ status: "insufficient_data" }) as never,
    persistFeatureSnapshot: async () => ({
      state: "read-only",
      reason: "Reference is not canonical.",
      snapshotWritten: false,
    }),
    serveValidatedPrediction: async () => ({
      prediction: {
        status: "insufficient_data",
        reason: "Reference is not canonical.",
        missingPrerequisites: ["Canonical reference required."],
      },
      caveats: [],
    }),
    materializeMaturedOutcomes: async () => ({
      scannedSnapshots: 0,
      available: 0,
      outcomesWritten: 0,
      pending: 0,
      unavailable: 0,
      invalid: 0,
      missingPath: 0,
      storage: { state: "written", reason: null },
      caveats: [],
    }) as never,
    loadPersistedResearchDataset: async () => ({
      examples: [],
      repository: {
        featureSnapshotCount: 0,
        outcomeCount: 0,
        assetCount: 1,
        rejectedSnapshotCount: 0,
        rejectionReasons: {},
      },
    }),
  });
  assert.equal(collectionCalls, 0);
  assert.equal(result.collection.attemptedCoins, 0);
  assert.equal(result.collection.skippedCoins, 1);
  assert.equal(result.coins.canonicalTimestamped, 0);
});

test("pipeline route rejects unauthorized and over-budget requests before any upstream call", async () => {
  const previousToken = process.env.BACKFILL_ADMIN_TOKEN;
  const originalFetch = globalThis.fetch;
  process.env.BACKFILL_ADMIN_TOKEN = "pipeline-secret";
  globalThis.fetch = async () => {
    throw new Error("network must not be reached");
  };
  try {
    const unauthorized = await runPipelineRoute(new Request("http://localhost/api/pipeline/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-backfill-token": "wrong" },
      body: JSON.stringify({}),
    }));
    assert.equal(unauthorized.status, 401);

    const invalid = await runPipelineRoute(new Request("http://localhost/api/pipeline/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-backfill-token": "pipeline-secret" },
      body: JSON.stringify({ maxCoins: 11, allowMetered: true }),
    }));
    assert.equal(invalid.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.BACKFILL_ADMIN_TOKEN;
    else process.env.BACKFILL_ADMIN_TOKEN = previousToken;
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveExecutableOutcomeLabel,
  deriveFeatureTimeline,
  derivePointInTimeFeatures,
  flattenFeatureVector,
  type ExecutablePositionPath,
  type FeatureFamily,
  type PointInTimeInput,
  type TimestampedEvidence,
} from "../lib/features/index";

const launchAt = "2026-08-01T00:00:00.000Z";
const at = (seconds: number) =>
  new Date(Date.parse(launchAt) + seconds * 1_000).toISOString();

const evidence = (
  id: string,
  eventSeconds: number,
  availableSeconds = eventSeconds,
): TimestampedEvidence => ({
  id,
  eventAt: at(eventSeconds),
  availableAt: at(availableSeconds),
  sourceId: "test-source",
  fidelity: "exact",
});

const families: FeatureFamily[] = [
  "lifecycleFlow",
  "liquidityExecution",
  "ownershipCreator",
  "coordinationWash",
  "narrativePaidAttention",
  "marketRegime",
];

const baseInput = (): PointInTimeInput => ({
  launch: {
    ...evidence("launch", 0),
    mint: "Mint111111111111111111111111111111111111",
    creatorWallet: "creator",
    launchedAt: launchAt,
  },
  coverage: families.map((family) => ({ family, status: "unavailable" })),
  market: [],
  trades: [],
  transfers: [],
  holders: [],
  creators: [],
  quotes: [],
  socialPosts: [],
  paidAttention: [],
  regimes: [],
});

test("feature timeline exposes exactly the five standard cutoffs", () => {
  assert.deepEqual(
    deriveFeatureTimeline(baseInput()).map((row) => row.cutoffSeconds),
    [30, 60, 300, 900, 3_600],
  );
});

test("cutoffs exclude future events and records observed after the cutoff", () => {
  const input = baseInput();
  input.coverage[0] = { family: "lifecycleFlow", status: "complete" };
  input.market = [
    {
      ...evidence("known-30", 30),
      priceUsd: 2,
      marketCapUsd: 2_000,
      bondingCurveProgressPct: 10,
      graduated: false,
    },
    {
      ...evidence("late-arriving-60", 60, 90),
      priceUsd: 50,
      marketCapUsd: 50_000,
      bondingCurveProgressPct: 90,
      graduated: false,
    },
    {
      ...evidence("future-61", 61),
      priceUsd: 100,
      marketCapUsd: 100_000,
      bondingCurveProgressPct: 100,
      graduated: true,
    },
  ];
  input.trades = [
    {
      ...evidence("buy-known", 20),
      signature: "sig-1",
      wallet: "buyer-1",
      side: "buy",
      volumeUsd: 100,
      tokenAmount: 10,
      priceUsd: 1,
      slot: 1,
      feePayer: "buyer-1",
      networkAndPriorityFeeUsd: 0.1,
    },
    {
      ...evidence("buy-late", 40, 70),
      signature: "sig-2",
      wallet: "buyer-2",
      side: "buy",
      volumeUsd: 900,
      tokenAmount: 20,
      priceUsd: 4,
      slot: 2,
      feePayer: "buyer-2",
      networkAndPriorityFeeUsd: 0.1,
    },
  ];

  const row = derivePointInTimeFeatures(input, 60);
  assert.equal(row.lifecycleFlow.priceUsd, 2);
  assert.equal(row.lifecycleFlow.buyVolumeUsd, 100);
  assert.equal(row.lifecycleFlow.uniqueBuyers, 1);
  assert.deepEqual(row.sourceIds, ["test-source"]);
});

test("declared complete zero activity is zero while unavailable activity is null", () => {
  const complete = baseInput();
  complete.coverage[0] = { family: "lifecycleFlow", status: "complete" };
  const completeRow = derivePointInTimeFeatures(complete, 30);
  const unavailableRow = derivePointInTimeFeatures(baseInput(), 30);

  assert.equal(completeRow.lifecycleFlow.buyCount, 0);
  assert.equal(completeRow.lifecycleFlow.buyVolumeUsd, 0);
  assert.equal(unavailableRow.lifecycleFlow.buyCount, null);
  assert.equal(unavailableRow.lifecycleFlow.buyVolumeUsd, null);
  assert.ok(unavailableRow.evidenceQuality.byFamily.lifecycleFlow.missingFields.length > 0);
});

test("canonical trades preserve counts while incomplete USD normalization stays null", () => {
  const input = baseInput();
  input.coverage[0] = {
    family: "lifecycleFlow",
    status: "partial",
    eventFrom: at(5),
    eventThrough: at(20),
  };
  input.trades = [
    {
      ...evidence("raw-buy-one", 5),
      signature: "raw-buy-one",
      wallet: "buyer-one",
      side: "buy",
      volumeUsd: null,
      tokenAmount: 10,
      priceUsd: null,
      slot: 1,
      feePayer: "payer-one",
      networkAndPriorityFeeUsd: null,
    },
    {
      ...evidence("raw-buy-two", 10),
      signature: "raw-buy-two",
      wallet: "buyer-two",
      side: "buy",
      volumeUsd: null,
      tokenAmount: 20,
      priceUsd: null,
      slot: 2,
      feePayer: "payer-two",
      networkAndPriorityFeeUsd: null,
    },
    {
      ...evidence("raw-sell", 20),
      signature: "raw-sell",
      wallet: "buyer-one",
      side: "sell",
      volumeUsd: null,
      tokenAmount: 2,
      priceUsd: null,
      slot: 3,
      feePayer: "payer-one",
      networkAndPriorityFeeUsd: null,
    },
  ];

  const flow = derivePointInTimeFeatures(input, 30).lifecycleFlow;
  assert.equal(flow.buyCount, 2);
  assert.equal(flow.sellCount, 1);
  assert.equal(flow.uniqueBuyers, 2);
  assert.equal(flow.uniqueSellers, 1);
  assert.equal(flow.buyVolumeUsd, null);
  assert.equal(flow.sellVolumeUsd, null);
  assert.equal(flow.netFlowUsd, null);
  assert.equal(flow.recentToPriorVolumeVelocityRatio, null);
});

test("complete coverage is downgraded when its declared event range stops before cutoff", () => {
  const input = baseInput();
  input.coverage[0] = {
    family: "lifecycleFlow",
    status: "complete",
    eventFrom: at(0),
    eventThrough: at(30),
  };
  const quality = derivePointInTimeFeatures(input, 60).evidenceQuality.byFamily.lifecycleFlow;
  assert.equal(quality.status, "partial");
  assert.match(quality.notes.join(" "), /downgraded/i);
});

test("coordination features separate qualified funders, ambiguous funders, and bundle clues", () => {
  const input = baseInput();
  input.coverage[0] = { family: "lifecycleFlow", status: "complete" };
  input.coverage[3] = { family: "coordinationWash", status: "complete" };
  input.trades = ["a", "b", "c", "d"].map((wallet, index) => ({
    ...evidence(`buy-${wallet}`, 5 + index),
    signature: `sig-${wallet}`,
    wallet,
    side: "buy" as const,
    volumeUsd: 100,
    tokenAmount: 100,
    priceUsd: 1,
    slot: index < 2 ? 10 : 11 + index,
    transactionOrder: index,
    feePayer: index < 2 ? "shared-payer" : wallet,
    networkAndPriorityFeeUsd: 0.1,
    exactBundleId: index < 2 ? "exact-bundle" : undefined,
    bundleClue: index === 2,
    priorSharedLaunchCount: index === 3 ? 2 : 0,
    washEvidenceTags: index === 3 ? ["repeated-back-and-forth" as const] : [],
  }));
  input.transfers = [
    {
      ...evidence("fund-a", 1),
      signature: "fund-a",
      fromWallet: "ordinary-funder",
      toWallet: "a",
      amountUsd: 100,
      slot: 1,
      purpose: "funding",
      counterpartyClassification: "ordinary",
    },
    {
      ...evidence("fund-b", 1),
      signature: "fund-b",
      fromWallet: "ordinary-funder",
      toWallet: "b",
      amountUsd: 100,
      slot: 1,
      purpose: "funding",
      counterpartyClassification: "ordinary",
    },
    {
      ...evidence("fund-b-again", 2),
      signature: "fund-b-again",
      fromWallet: "ordinary-funder",
      toWallet: "b",
      amountUsd: 50,
      slot: 2,
      purpose: "funding",
      counterpartyClassification: "ordinary",
    },
    {
      ...evidence("fund-c", 1),
      signature: "fund-c",
      fromWallet: "exchange-hot-wallet",
      toWallet: "c",
      amountUsd: 100,
      slot: 1,
      purpose: "funding",
      counterpartyClassification: "exchange",
    },
    {
      ...evidence("fund-d", 1),
      signature: "fund-d",
      fromWallet: "exchange-hot-wallet",
      toWallet: "d",
      amountUsd: 100,
      slot: 1,
      purpose: "funding",
      counterpartyClassification: "exchange",
      circularFlowClue: true,
    },
    {
      ...evidence("future-common-funder", 20, 40),
      signature: "fund-future",
      fromWallet: "ordinary-funder",
      toWallet: "c",
      amountUsd: 100,
      slot: 2,
      purpose: "funding",
      counterpartyClassification: "ordinary",
    },
  ];

  const features = derivePointInTimeFeatures(input, 30).coordinationWash;
  assert.equal(features.qualifiedCommonFunderClusterCount, 1);
  assert.equal(features.qualifiedCommonFunderBuyerPct, 50);
  assert.equal(features.ambiguousCommonFunderBuyerPct, 50);
  assert.equal(features.sameSlotEarlyBuyerPct, 50);
  assert.equal(features.sharedFeePayerEarlyBuyerPct, 50);
  assert.equal(features.exactBundleEarlyBuyerPct, 50);
  assert.equal(features.bundleClueEarlyBuyerPct, 25);
  assert.equal(features.recurringEarlyBuyerCohortPct, 25);
  assert.match(
    derivePointInTimeFeatures(input, 30).caveats.join(" "),
    /not proof/i,
  );
});

test("ticker-only social matches are excluded and partial sentiment stays explicit", () => {
  const input = baseInput();
  input.coverage[4] = { family: "narrativePaidAttention", status: "partial" };
  input.socialPosts = [
    {
      ...evidence("contract", 10),
      platformPostId: "p1",
      authorId: "author-1",
      identityMatch: "exact-contract",
      automatedLikelihood0To1: 0.2,
      sentimentMinus1To1: 0.5,
      authorFollowers: 20_000,
      authorVerified: true,
      engagementCount: 10,
      narrativeClusterId: "animal",
      narrativeNovelty0To100: 80,
    },
    {
      ...evidence("ticker", 11),
      platformPostId: "p2",
      authorId: "author-2",
      identityMatch: "ticker-only",
      automatedLikelihood0To1: 0.9,
      sentimentMinus1To1: -1,
      authorFollowers: 1_000_000,
      authorVerified: true,
      engagementCount: 20,
      narrativeClusterId: "unrelated",
      narrativeNovelty0To100: 10,
    },
    {
      ...evidence("name", 20),
      platformPostId: "p3",
      authorId: "author-1",
      identityMatch: "full-name",
      automatedLikelihood0To1: null,
      sentimentMinus1To1: null,
      authorFollowers: 20_000,
      authorVerified: true,
      engagementCount: null,
      narrativeClusterId: "animal",
      narrativeNovelty0To100: null,
    },
  ];

  const narrative = derivePointInTimeFeatures(input, 30).narrativePaidAttention;
  assert.equal(narrative.postCount, 2);
  assert.equal(narrative.uniqueAuthorCount, 1);
  assert.equal(narrative.exactIdentityMentionRatioPct, 50);
  assert.equal(narrative.sentimentMean, 0.5);
  assert.equal(narrative.sentimentCoveragePct, 50);
  assert.equal(narrative.influentialAuthorMentionCount, 2);
});

test("launch metadata narrative is calculated without pretending social sentiment exists", () => {
  const input = baseInput();
  input.coverage[4] = { family: "narrativePaidAttention", status: "partial" };
  input.metadataNarrative = [{
    ...evidence("metadata", 0),
    theme: "animal",
    matchedTokens: ["cat"],
    themeConfidence0To100: 100,
    metadataCompleteness0To100: 65,
    socialLinkCount: null,
  }];
  const narrative = derivePointInTimeFeatures(input, 30).narrativePaidAttention;
  assert.equal(narrative.metadataTheme, "animal");
  assert.equal(narrative.metadataCompleteness0To100, 65);
  assert.equal(narrative.metadataSocialLinkCount, null);
  assert.equal(narrative.postCount, null);
  assert.equal(narrative.sentimentMean, null);
});

test("indexed coordination and exact-identity count proxies stay separate from raw evidence", () => {
  const input = baseInput();
  input.coverage[3] = { family: "coordinationWash", status: "partial" };
  input.coverage[4] = { family: "narrativePaidAttention", status: "partial" };
  input.coordinationProxies = [{
    ...evidence("tracker-proxy", 20),
    fidelity: "reconstructed",
    provider: "solana-tracker",
    bundlerWalletCount: 5,
    bundledSupplySharePct: 18,
    initialBundledSupplySharePct: 25,
    riskScore0To100: 72,
    insiderSupplySharePct: 12,
    sniperSupplySharePct: 8,
    ruggedFlag: false,
    classificationCaveat: "Vendor classification only.",
  }, {
    ...evidence("future-proxy", 50, 70),
    fidelity: "reconstructed",
    provider: "solana-tracker",
    bundlerWalletCount: 99,
    bundledSupplySharePct: 99,
    initialBundledSupplySharePct: 99,
    riskScore0To100: 99,
    insiderSupplySharePct: 99,
    sniperSupplySharePct: 99,
    ruggedFlag: true,
    classificationCaveat: "Arrived after cutoff.",
  }];
  input.socialCounts = [{
    ...evidence("count-prior", 30),
    fidelity: "reconstructed",
    bucketStart: at(0),
    bucketEnd: at(30),
    postCount: 2,
    identityClasses: ["exact-contract"],
    manipulationCaveat: "Counts can be manufactured.",
  }, {
    ...evidence("count-recent", 60),
    fidelity: "reconstructed",
    bucketStart: at(30),
    bucketEnd: at(60),
    postCount: 8,
    identityClasses: ["exact-contract", "official-url"],
    manipulationCaveat: "Counts can be manufactured.",
  }];

  const row = derivePointInTimeFeatures(input, 60);
  assert.equal(row.coordinationWash.indexedBundlerWalletCount, 5);
  assert.equal(row.coordinationWash.indexedBundledSupplySharePct, 18);
  assert.equal(row.coordinationWash.indexedRiskScore0To100, 72);
  assert.equal(row.coordinationWash.indexedRuggedFlag, false);
  assert.equal(row.coordinationWash.coordinationEvidence0To100, null);
  assert.equal(row.narrativePaidAttention.postCount, null);
  assert.equal(row.narrativePaidAttention.indexedExactIdentityPostCount, 10);
  assert.equal(row.narrativePaidAttention.indexedExactIdentityPostsPerMinute, 10);
  assert.equal(
    row.narrativePaidAttention.indexedExactIdentityRecentToPriorVelocityRatio,
    4,
  );
  assert.ok(row.evidenceQuality.reconstructedRecordRatioPct! > 0);
});

const positionPath = (): ExecutablePositionPath => ({
  id: "position-1",
  mint: "Mint111111111111111111111111111111111111",
  cutoffSeconds: 60,
  orderSizeUsd: 100,
  entryAt: at(60),
  entryAvailableAt: at(60),
  entryRouteAvailable: true,
  totalEntryCostUsd: 100,
  exits: [
    {
      ...evidence("exit-1", 120),
      netExitValueUsd: 150,
      exitRouteAvailable: true,
      priceImpactPct: 2,
    },
    {
      ...evidence("exit-2", 180),
      netExitValueUsd: 210,
      exitRouteAvailable: true,
      priceImpactPct: 3,
    },
    {
      ...evidence("exit-3", 240),
      netExitValueUsd: 40,
      exitRouteAvailable: true,
      priceImpactPct: 10,
    },
    {
      ...evidence("outside-horizon", 500),
      netExitValueUsd: 1_000,
      exitRouteAvailable: true,
      priceImpactPct: 1,
    },
  ],
  coverage: {
    status: "complete",
    eventThrough: at(360),
    availableAt: at(365),
    fidelity: "reconstructed",
    sourceIds: ["execution-simulator"],
  },
});

test("executable labels use chronological target-before-downside and exclude post-horizon exits", () => {
  const label = deriveExecutableOutcomeLabel(
    positionPath(),
    { horizonSeconds: 300, targetMultiple: 2, downsideMultiple: 0.5 },
    at(400),
  );
  assert.equal(label.status, "available");
  assert.equal(label.reachedTargetBeforeDownside, true);
  assert.equal(label.maximumNetReturnPct, 110);
  assert.equal(label.maximumDrawdownPct, 80.9524);
  assert.equal(label.exitabilityPct, 100);
  assert.equal(label.observedExitSampleCount, 3);
});

test("a downside hit before the target makes the binary label false", () => {
  const path = positionPath();
  path.exits[0].netExitValueUsd = 45;
  const label = deriveExecutableOutcomeLabel(
    path,
    { horizonSeconds: 300, targetMultiple: 2, downsideMultiple: 0.5 },
    at(400),
  );
  assert.equal(label.reachedTargetBeforeDownside, false);
});

test("incomplete horizons stay pending and late entry quotes stay unavailable", () => {
  const pendingPath = positionPath();
  pendingPath.coverage.status = "partial";
  const pending = deriveExecutableOutcomeLabel(
    pendingPath,
    { horizonSeconds: 300, targetMultiple: 2, downsideMultiple: 0.5 },
    at(400),
  );
  assert.equal(pending.status, "pending");
  assert.equal(pending.reachedTargetBeforeDownside, null);

  const lateEntry = positionPath();
  lateEntry.entryAvailableAt = at(61);
  const unavailable = deriveExecutableOutcomeLabel(
    lateEntry,
    { horizonSeconds: 300, targetMultiple: 2, downsideMultiple: 0.5 },
    at(400),
  );
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.caveats[0], /not available at the entry cutoff/i);
});

test("flattening exposes stable model keys and omits evidence metadata", () => {
  const flat = flattenFeatureVector(derivePointInTimeFeatures(baseInput(), 30));
  assert.equal(flat.cutoffSeconds, 30);
  assert.equal(flat["lifecycle.tokenAgeSeconds"], 30);
  assert.equal("evidenceQuality" in flat, false);
});

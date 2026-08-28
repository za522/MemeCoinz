import assert from "node:assert/strict";
import test from "node:test";
import {
  auditPointInTimeDataset,
  createWalkForwardSplits,
  deserializeModelArtifact,
  predictResearchModel,
  serializeModelArtifact,
  trainResearchModel,
  type PointInTimeExample,
  type PredictionExample,
  type WalkForwardPolicy,
} from "../lib/model/index";
import { persistedOutcomeAlignsSnapshot } from "../lib/model/repository";

const DAY = 86_400_000;
const HOUR = 3_600_000;

function makeRows(tokenCount = 28): PointInTimeExample[] {
  const rows: PointInTimeExample[] = [];
  const origin = Date.parse("2025-01-01T00:00:00.000Z");
  for (let token = 0; token < tokenCount; token += 1) {
    const reference = origin + token * DAY;
    for (const cutoffSeconds of [60, 300]) {
      const decision = reference + cutoffSeconds * 1_000;
      const positive = token % 3 === 0 ? 1 : 0;
      rows.push({
        rowId: `token-${token}-launch-${cutoffSeconds}`,
        tokenId: `token-${token}`,
        referenceClock: "launch",
        referenceAt: new Date(reference).toISOString(),
        cutoffSeconds,
        decisionAt: new Date(decision).toISOString(),
        featureSetVersion: "test-features/v1",
        features: {
          net_flow_usd: {
            value: positive ? 1_000 + cutoffSeconds : 50 + cutoffSeconds,
            taxonomy: "raw",
            family: "demand",
            eventAt: new Date(decision - 2_000).toISOString(),
            availableAt: new Date(decision - 500).toISOString(),
          },
          narrative_velocity: {
            value: token % 5 === 0 ? null : positive ? 12 : 1,
            taxonomy: "engineered",
            family: "narrative",
            eventAt: new Date(decision - 1_000).toISOString(),
            availableAt: new Date(decision).toISOString(),
            missingReason: token % 5 === 0 ? "provider-unavailable" : undefined,
          },
        },
        outcome: {
          name: "net-2x-before-minus-50",
          version: "test-label/v1",
          value: positive,
          horizonSeconds: 3_600,
          orderSizeUsd: 1_000,
          labelAvailableAt: new Date(decision + HOUR).toISOString(),
          status: "matured",
          netReturnPct: positive ? 115 : -42,
          maximumDrawdownPct: positive ? 20 : 55,
        },
      });
    }
  }
  return rows;
}

const testPolicy: WalkForwardPolicy = {
  folds: 3,
  calibrationFraction: 0.2,
  minimumExamples: 24,
  minimumTokens: 16,
  minimumPositiveExamples: 6,
  minimumNegativeExamples: 10,
  minimumTrainTokens: 8,
  minimumTestTokens: 4,
  topFraction: 0.2,
  l2Penalty: 0.01,
  learningRate: 0.05,
  iterations: 300,
};

function predictionOnly(row: PointInTimeExample): PredictionExample {
  const candidate: Partial<PointInTimeExample> = { ...row };
  delete candidate.outcome;
  return candidate as PredictionExample;
}

test("point-in-time audit rejects future data and immature labels", () => {
  const rows = makeRows(2);
  rows[0].features.net_flow_usd.availableAt = new Date(
    Date.parse(rows[0].decisionAt) + 1,
  ).toISOString();
  rows[1].outcome.labelAvailableAt = rows[1].decisionAt;
  const audit = auditPointInTimeDataset(rows, "2026-01-01T00:00:00.000Z");
  assert.equal(audit.accepted.length, rows.length - 2);
  assert.ok(audit.issues.some((issue) => issue.code === "future-availability"));
  assert.ok(audit.issues.some((issue) => issue.code === "label-window-not-mature"));
});

test("walk-forward splits keep tokens disjoint and purge unavailable labels", () => {
  const rows = makeRows();
  const splits = createWalkForwardSplits(rows, testPolicy);
  assert.ok(splits.length >= 2);
  for (const split of splits) {
    const train = new Set(split.trainTokenIds);
    assert.ok(split.testTokenIds.every((tokenId) => !train.has(tokenId)));
    const testFrom = Math.min(...split.test.map((row) => Date.parse(row.referenceAt)));
    assert.ok(
      split.train.every((row) => Date.parse(row.outcome.labelAvailableAt) < testFrom),
    );
  }
});

test("training refuses an undersized real dataset instead of inventing metrics", () => {
  const result = trainResearchModel(makeRows(3), {
    datasetAsOf: "2026-01-01T00:00:00.000Z",
    policy: testPolicy,
  });
  assert.equal(result.status, "insufficient-data");
  if (result.status === "insufficient-data") {
    assert.equal(result.acceptedExamples, 6);
    assert.ok(result.reason.includes("Not enough"));
  }
});

test("regularized baseline serializes, predicts, and reports out-of-fold evidence", () => {
  const rows = makeRows();
  const result = trainResearchModel(rows, {
    datasetAsOf: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    policy: testPolicy,
  });
  assert.equal(result.status, "trained");
  if (result.status !== "trained") return;
  const artifact = deserializeModelArtifact(serializeModelArtifact(result.artifact));
  assert.ok(artifact.folds.length >= 2);
  assert.ok(artifact.outOfFoldMetrics.brierScore >= 0);
  assert.ok(artifact.outOfFoldMetrics.prAuc >= 0);
  assert.ok(artifact.relationships.some((item) => item.feature === "net_flow_usd"));
  assert.ok(artifact.familyAblations.length >= 2);
  assert.ok(artifact.members.some((member) => member.calibrator.fitted));

  const predictionRow = predictionOnly(rows.at(-1)!);
  const prediction = predictResearchModel(artifact, predictionRow);
  assert.equal(prediction.status, "predicted");
  assert.ok(prediction.probability > 0 && prediction.probability < 1);
  assert.ok(prediction.interval.lower <= prediction.probability);
  assert.ok(prediction.interval.upper >= prediction.probability);
  assert.equal(prediction.featureCount, 2);
});

test("prediction refuses a future-available feature", () => {
  const rows = makeRows();
  const result = trainResearchModel(rows, {
    datasetAsOf: "2026-01-01T00:00:00.000Z",
    policy: testPolicy,
  });
  assert.equal(result.status, "trained");
  if (result.status !== "trained") return;
  const predictionRow = predictionOnly(rows[0]);
  predictionRow.features.net_flow_usd.availableAt = new Date(
    Date.parse(predictionRow.decisionAt) + 1_000,
  ).toISOString();
  assert.throws(
    () => predictResearchModel(result.artifact, predictionRow),
    /unavailable at decision time/,
  );
});

test("a first-class outcome id cannot hide a clock or cutoff mismatch", () => {
  const snapshot = {
    id: "feature:mint:launch:300:v1",
    cutoffSeconds: 300,
    decisionAvailableAt: "2025-01-01T00:05:00.000Z",
  };
  assert.equal(persistedOutcomeAlignsSnapshot({
    featureSnapshotId: snapshot.id,
    referenceClock: "graduation",
    cutoffSeconds: 300,
    decisionAt: snapshot.decisionAvailableAt,
  }, {}, snapshot, "launch"), false);
  assert.equal(persistedOutcomeAlignsSnapshot({
    featureSnapshotId: snapshot.id,
    referenceClock: "launch",
    cutoffSeconds: 60,
    decisionAt: snapshot.decisionAvailableAt,
  }, {}, snapshot, "launch"), false);
  assert.equal(persistedOutcomeAlignsSnapshot({
    featureSnapshotId: snapshot.id,
    referenceClock: "launch",
    cutoffSeconds: 300,
    decisionAt: snapshot.decisionAvailableAt,
  }, {}, snapshot, "launch"), true);
});

import {
  evaluatePredictions,
  fitLogisticMember,
  predictMember,
} from "./math";
import type {
  DatasetAudit,
  FeatureFamilyAblation,
  FeatureRelationship,
  FoldEvaluation,
  LogisticMember,
  ModelArtifact,
  ModelPrediction,
  PointInTimeExample,
  PredictionExample,
  ResearchMetrics,
  TrainingResult,
  WalkForwardPolicy,
} from "./types";
import { auditPointInTimeDataset } from "./validation";

export const DEFAULT_WALK_FORWARD_POLICY: WalkForwardPolicy = {
  folds: 4,
  calibrationFraction: 0.2,
  minimumExamples: 200,
  minimumTokens: 120,
  minimumPositiveExamples: 25,
  minimumNegativeExamples: 50,
  minimumTrainTokens: 60,
  minimumTestTokens: 15,
  topFraction: 0.1,
  l2Penalty: 0.01,
  learningRate: 0.04,
  iterations: 700,
};

interface TokenGroup {
  tokenId: string;
  referenceAt: string;
  rows: PointInTimeExample[];
}

export interface WalkForwardSplit {
  fold: number;
  train: PointInTimeExample[];
  test: PointInTimeExample[];
  trainTokenIds: string[];
  testTokenIds: string[];
}

interface Evaluation {
  members: LogisticMember[];
  folds: FoldEvaluation[];
  metrics: ResearchMetrics;
  rows: PointInTimeExample[];
  probabilities: number[];
}

const round = (value: number, digits = 8): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function tokenGroups(rows: readonly PointInTimeExample[]): TokenGroup[] {
  const byToken = new Map<string, PointInTimeExample[]>();
  rows.forEach((row) => {
    const current = byToken.get(row.tokenId) ?? [];
    current.push(row);
    byToken.set(row.tokenId, current);
  });
  return [...byToken.entries()]
    .map(([tokenId, tokenRows]) => ({
      tokenId,
      referenceAt: tokenRows.map((row) => row.referenceAt).sort()[0],
      rows: [...tokenRows].sort((left, right) =>
        left.decisionAt.localeCompare(right.decisionAt),
      ),
    }))
    .sort(
      (left, right) =>
        left.referenceAt.localeCompare(right.referenceAt) ||
        left.tokenId.localeCompare(right.tokenId),
    );
}

/**
 * Expanding-window splits are token-grouped and label-purged. A token never
 * straddles train and test, and a training token is excluded unless every one
 * of its included labels had matured before the test period began.
 */
export function createWalkForwardSplits(
  rows: readonly PointInTimeExample[],
  policy: WalkForwardPolicy,
): WalkForwardSplit[] {
  const groups = tokenGroups(rows);
  const remainingTokens = groups.length - policy.minimumTrainTokens;
  const foldCount = Math.min(
    policy.folds,
    Math.floor(remainingTokens / policy.minimumTestTokens),
  );
  if (foldCount < 1) return [];
  const testSize = Math.floor(remainingTokens / foldCount);
  const splits: WalkForwardSplit[] = [];

  for (let fold = 0; fold < foldCount; fold += 1) {
    const testStart = policy.minimumTrainTokens + fold * testSize;
    const testEnd = fold === foldCount - 1 ? groups.length : testStart + testSize;
    const testGroups = groups.slice(testStart, testEnd);
    const testFrom = testGroups[0]?.referenceAt;
    if (!testFrom) continue;
    const trainGroups = groups
      .slice(0, testStart)
      .filter((group) =>
        group.rows.every((row) => row.outcome.labelAvailableAt < testFrom),
      );
    if (
      trainGroups.length < policy.minimumTrainTokens ||
      testGroups.length < policy.minimumTestTokens
    ) {
      continue;
    }
    splits.push({
      fold: fold + 1,
      train: trainGroups.flatMap((group) => group.rows),
      test: testGroups.flatMap((group) => group.rows),
      trainTokenIds: trainGroups.map((group) => group.tokenId),
      testTokenIds: testGroups.map((group) => group.tokenId),
    });
  }
  return splits;
}

function splitCalibration(
  rows: readonly PointInTimeExample[],
  fraction: number,
): { fit: PointInTimeExample[]; calibration: PointInTimeExample[] } {
  const groups = tokenGroups(rows);
  if (groups.length < 4) return { fit: [...rows], calibration: [] };
  const calibrationCount = Math.max(2, Math.floor(groups.length * fraction));
  const boundary = Math.max(2, groups.length - calibrationCount);
  return {
    fit: groups.slice(0, boundary).flatMap((group) => group.rows),
    calibration: groups.slice(boundary).flatMap((group) => group.rows),
  };
}

function evaluateWalkForward(
  rows: readonly PointInTimeExample[],
  featureNames: readonly string[],
  policy: WalkForwardPolicy,
): Evaluation | null {
  const splits = createWalkForwardSplits(rows, policy);
  if (!splits.length) return null;
  const members: LogisticMember[] = [];
  const foldEvaluations: FoldEvaluation[] = [];
  const evaluatedRows: PointInTimeExample[] = [];
  const probabilities: number[] = [];

  for (const split of splits) {
    const calibrationSplit = splitCalibration(
      split.train,
      policy.calibrationFraction,
    );
    const member = fitLogisticMember(
      `walk-forward-${split.fold}`,
      calibrationSplit.fit,
      calibrationSplit.calibration,
      featureNames,
      policy,
    );
    // A one-class calibration window cannot support a calibrated probability.
    // Skip that fold instead of reporting an uncalibrated score as probability.
    if (!member.calibrator.fitted) continue;
    const foldProbabilities = split.test.map((row) => predictMember(member, row));
    const metrics = evaluatePredictions(
      split.test,
      foldProbabilities,
      policy.topFraction,
    );
    members.push(member);
    evaluatedRows.push(...split.test);
    probabilities.push(...foldProbabilities);
    foldEvaluations.push({
      fold: split.fold,
      trainTokenCount: split.trainTokenIds.length,
      testTokenCount: split.testTokenIds.length,
      trainThrough: split.train.map((row) => row.referenceAt).sort().at(-1)!,
      testFrom: split.test.map((row) => row.referenceAt).sort()[0],
      testThrough: split.test.map((row) => row.referenceAt).sort().at(-1)!,
      metrics,
    });
  }
  if (!evaluatedRows.length) return null;
  return {
    members,
    folds: foldEvaluations,
    metrics: evaluatePredictions(evaluatedRows, probabilities, policy.topFraction),
    rows: evaluatedRows,
    probabilities,
  };
}

function pearson(values: readonly number[], labels: readonly number[]): number | null {
  if (values.length < 3 || values.length !== labels.length) return null;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanLabel = labels.reduce((sum, value) => sum + value, 0) / labels.length;
  let numerator = 0;
  let valueVariance = 0;
  let labelVariance = 0;
  values.forEach((value, index) => {
    const valueDelta = value - meanValue;
    const labelDelta = labels[index] - meanLabel;
    numerator += valueDelta * labelDelta;
    valueVariance += valueDelta ** 2;
    labelVariance += labelDelta ** 2;
  });
  const denominator = Math.sqrt(valueVariance * labelVariance);
  return denominator > 0 ? numerator / denominator : null;
}

function buildRelationships(
  rows: readonly PointInTimeExample[],
  members: readonly LogisticMember[],
  definitions: ModelArtifact["featureDefinitions"],
): FeatureRelationship[] {
  return Object.entries(definitions).map(([feature, definition]) => {
    const pairs = rows
      .map((row) => ({ value: row.features[feature]?.value, label: row.outcome.value }))
      .filter(
        (pair): pair is { value: number; label: 0 | 1 } =>
          pair.value !== null && pair.value !== undefined && Number.isFinite(pair.value),
      );
    const coefficients = members.map((member) => {
      const index = member.standardizer.featureNames.indexOf(feature);
      return index >= 0 ? Math.abs(member.coefficients[index]) : 0;
    });
    return {
      feature,
      family: definition.family,
      taxonomy: definition.taxonomy,
      availablePairs: pairs.length,
      pearsonCorrelationWithLabel: pearson(
        pairs.map((pair) => pair.value),
        pairs.map((pair) => pair.label),
      ),
      meanAbsoluteStandardizedCoefficient:
        coefficients.reduce((sum, value) => sum + value, 0) /
        Math.max(1, coefficients.length),
    };
  });
}

function buildAblations(
  rows: readonly PointInTimeExample[],
  definitions: ModelArtifact["featureDefinitions"],
  baseline: ResearchMetrics,
  policy: WalkForwardPolicy,
): FeatureFamilyAblation[] {
  const families = [...new Set(Object.values(definitions).map(({ family }) => family))];
  return families.map((omittedFamily) => {
    const retained = Object.entries(definitions)
      .filter(([, definition]) => definition.family !== omittedFamily)
      .map(([name]) => name);
    if (!retained.length) {
      return {
        omittedFamily,
        status: "insufficient-data",
        reason: "No input features remain after removing this family.",
      };
    }
    const evaluation = evaluateWalkForward(rows, retained, policy);
    if (!evaluation) {
      return {
        omittedFamily,
        status: "insufficient-data",
        reason: "The grouped chronological split cannot be formed.",
      };
    }
    return {
      omittedFamily,
      status: "evaluated",
      brierScoreDelta: evaluation.metrics.brierScore - baseline.brierScore,
      prAucDelta: evaluation.metrics.prAuc - baseline.prAuc,
    };
  });
}

function fingerprint(rows: readonly PointInTimeExample[]): string {
  const material = rows
    .map(
      (row) =>
        `${row.rowId}|${row.tokenId}|${row.decisionAt}|${row.outcome.value}|${row.outcome.labelAvailableAt}`,
    )
    .sort()
    .join("\n");
  let hash = 0x811c9dc5;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const auditSummary = (audit: DatasetAudit) => ({
  acceptedCount: audit.accepted.length,
  rejectedRowIds: audit.rejectedRowIds,
  issues: audit.issues,
  datasetAsOf: audit.datasetAsOf,
});

export function trainResearchModel(
  rows: readonly PointInTimeExample[],
  options: {
    datasetAsOf?: string;
    createdAt?: string;
    policy?: Partial<WalkForwardPolicy>;
  } = {},
): TrainingResult {
  const policy = { ...DEFAULT_WALK_FORWARD_POLICY, ...options.policy };
  const datasetAsOf = options.datasetAsOf ?? new Date().toISOString();
  const audit = auditPointInTimeDataset(rows, datasetAsOf);
  const accepted = audit.accepted;
  const tokenCount = new Set(accepted.map((row) => row.tokenId)).size;
  const positiveExamples = accepted.filter((row) => row.outcome.value === 1).length;
  const negativeExamples = accepted.length - positiveExamples;
  const insufficient =
    accepted.length < policy.minimumExamples ||
    tokenCount < policy.minimumTokens ||
    positiveExamples < policy.minimumPositiveExamples ||
    negativeExamples < policy.minimumNegativeExamples;
  const requirements = {
    minimumExamples: policy.minimumExamples,
    minimumTokens: policy.minimumTokens,
    minimumPositiveExamples: policy.minimumPositiveExamples,
    minimumNegativeExamples: policy.minimumNegativeExamples,
    minimumTrainTokens: policy.minimumTrainTokens,
    minimumTestTokens: policy.minimumTestTokens,
  };
  if (insufficient) {
    return {
      status: "insufficient-data",
      reason: "Not enough leakage-safe, matured, class-diverse examples for chronological validation.",
      acceptedExamples: accepted.length,
      tokenCount,
      positiveExamples,
      negativeExamples,
      requirements,
      audit: auditSummary(audit),
    };
  }

  const first = accepted[0];
  const definitions: ModelArtifact["featureDefinitions"] = {};
  for (const row of accepted) {
    for (const [name, feature] of Object.entries(row.features)) {
      if (feature.taxonomy === "model-output") continue;
      const existing = definitions[name];
      if (
        existing &&
        (existing.family !== feature.family || existing.taxonomy !== feature.taxonomy)
      ) {
        return {
          status: "insufficient-data",
          reason: `Feature ${name} has inconsistent taxonomy or family metadata.`,
          acceptedExamples: accepted.length,
          tokenCount,
          positiveExamples,
          negativeExamples,
          requirements,
          audit: auditSummary(audit),
        };
      }
      definitions[name] = { family: feature.family, taxonomy: feature.taxonomy };
    }
  }
  const featureNames = Object.keys(definitions).sort();
  if (!featureNames.length) {
    return {
      status: "insufficient-data",
      reason: "No eligible raw or engineered input features are present.",
      acceptedExamples: accepted.length,
      tokenCount,
      positiveExamples,
      negativeExamples,
      requirements,
      audit: auditSummary(audit),
    };
  }
  const evaluation = evaluateWalkForward(accepted, featureNames, policy);
  if (!evaluation) {
    return {
      status: "insufficient-data",
      reason: "No leakage-safe grouped walk-forward fold could be formed after label purging.",
      acceptedExamples: accepted.length,
      tokenCount,
      positiveExamples,
      negativeExamples,
      requirements,
      audit: auditSummary(audit),
    };
  }

  const finalSplit = splitCalibration(accepted, policy.calibrationFraction);
  const finalMember = fitLogisticMember(
    "final-chronological",
    finalSplit.fit,
    finalSplit.calibration,
    featureNames,
    policy,
  );
  if (!finalMember.calibrator.fitted) {
    return {
      status: "insufficient-data",
      reason: "The chronological calibration window does not contain both outcome classes.",
      acceptedExamples: accepted.length,
      tokenCount,
      positiveExamples,
      negativeExamples,
      requirements,
      audit: auditSummary(audit),
    };
  }
  const dataFingerprint = fingerprint(accepted);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const members = [finalMember, ...evaluation.members];
  const artifact: ModelArtifact = {
    schemaVersion: "memetrace-model-artifact/v1",
    modelVersion: `regularized-logistic-v1-${dataFingerprint}`,
    createdAt,
    target: {
      name: first.outcome.name,
      version: first.outcome.version,
      horizonSeconds: first.outcome.horizonSeconds,
      orderSizeUsd: first.outcome.orderSizeUsd,
    },
    featureSetVersion: first.featureSetVersion,
    featureDefinitions: definitions,
    trainingThrough: accepted.map((row) => row.decisionAt).sort().at(-1)!,
    datasetFingerprint: dataFingerprint,
    policy,
    members,
    outOfFoldMetrics: Object.fromEntries(
      Object.entries(evaluation.metrics).map(([key, value]) => [
        key,
        typeof value === "number" ? round(value) : value,
      ]),
    ) as unknown as ResearchMetrics,
    folds: evaluation.folds,
    relationships: buildRelationships(accepted, members, definitions),
    familyAblations: buildAblations(
      accepted,
      definitions,
      evaluation.metrics,
      policy,
    ),
    trainingAudit: auditSummary(audit),
  };
  return { status: "trained", artifact };
}

function quantile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function predictResearchModel(
  artifact: ModelArtifact,
  row: PredictionExample,
): ModelPrediction {
  if (artifact.schemaVersion !== "memetrace-model-artifact/v1") {
    throw new Error("Unsupported model artifact schema.");
  }
  if (!artifact.members.length || artifact.members.some((member) => !member.calibrator.fitted)) {
    throw new Error("Model artifact does not contain a fully calibrated ensemble.");
  }
  if (row.featureSetVersion !== artifact.featureSetVersion) {
    throw new Error("Prediction feature-set version does not match the model artifact.");
  }
  const decisionAt = Date.parse(row.decisionAt);
  const referenceAt = Date.parse(row.referenceAt);
  if (
    !Number.isFinite(decisionAt) ||
    !Number.isFinite(referenceAt) ||
    Math.abs(decisionAt - (referenceAt + row.cutoffSeconds * 1_000)) > 1_000
  ) {
    throw new Error("Prediction row has an invalid decision clock.");
  }
  for (const [name, feature] of Object.entries(row.features)) {
    if (feature.taxonomy === "model-output") {
      throw new Error(`Prediction feature ${name} is a model output.`);
    }
    const eventAt = Date.parse(feature.eventAt);
    const availableAt = Date.parse(feature.availableAt);
    if (!Number.isFinite(eventAt) || !Number.isFinite(availableAt)) {
      throw new Error(`Prediction feature ${name} has invalid provenance time.`);
    }
    if (availableAt < eventAt) {
      throw new Error(`Prediction feature ${name} is available before its event.`);
    }
    if (eventAt > decisionAt || availableAt > decisionAt) {
      throw new Error(`Prediction feature ${name} was unavailable at decision time.`);
    }
    const expectedDefinition = artifact.featureDefinitions[name];
    if (
      expectedDefinition &&
      (expectedDefinition.family !== feature.family ||
        expectedDefinition.taxonomy !== feature.taxonomy)
    ) {
      throw new Error(`Prediction feature ${name} does not match the trained definition.`);
    }
  }
  for (const member of artifact.members) {
    const featureCount = member.standardizer.featureNames.length;
    if (
      member.coefficients.length !== featureCount ||
      member.missingnessCoefficients.length !== featureCount ||
      member.standardizer.means.length !== featureCount ||
      member.standardizer.standardDeviations.length !== featureCount
    ) {
      throw new Error(`Model member ${member.memberId} has inconsistent dimensions.`);
    }
  }
  const memberProbabilities = artifact.members.map((member) =>
    predictMember(member, row),
  );
  const probability =
    memberProbabilities.reduce((sum, value) => sum + value, 0) /
    memberProbabilities.length;
  const lower = quantile(memberProbabilities, 0.1);
  const upper = quantile(memberProbabilities, 0.9);
  const featureNames = Object.keys(artifact.featureDefinitions);
  const missingFeatureCount = featureNames.filter((name) => {
    const value = row.features[name]?.value;
    return value === null || value === undefined || !Number.isFinite(value);
  }).length;
  return {
    status: "predicted",
    tokenId: row.tokenId,
    rowId: row.rowId,
    decisionAt: row.decisionAt,
    probability,
    interval: { lower, upper, method: "model-ensemble-p10-p90" },
    ensembleAgreement: Math.max(0, 1 - (upper - lower)),
    memberProbabilities,
    missingFeatureCount,
    featureCount: featureNames.length,
    modelVersion: artifact.modelVersion,
    target: artifact.target,
  };
}

export function serializeModelArtifact(artifact: ModelArtifact): string {
  return JSON.stringify(artifact);
}

export function deserializeModelArtifact(value: string): ModelArtifact {
  const parsed = JSON.parse(value) as Partial<ModelArtifact>;
  if (
    parsed.schemaVersion !== "memetrace-model-artifact/v1" ||
    !Array.isArray(parsed.members) ||
    !parsed.target ||
    !parsed.featureDefinitions
  ) {
    throw new Error("Invalid MemeTrace model artifact.");
  }
  return parsed as ModelArtifact;
}

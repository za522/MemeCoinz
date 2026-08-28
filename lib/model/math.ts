import type {
  LogisticMember,
  PlattCalibrator,
  PointInTimeExample,
  PredictionExample,
  ResearchMetrics,
  Standardizer,
  WalkForwardPolicy,
} from "./types";

export const clampProbability = (value: number): number =>
  Math.min(1 - 1e-9, Math.max(1e-9, value));

export const sigmoid = (value: number): number => {
  if (value >= 0) {
    const exp = Math.exp(-Math.min(value, 35));
    return 1 / (1 + exp);
  }
  const exp = Math.exp(Math.max(value, -35));
  return exp / (1 + exp);
};

export function buildStandardizer(
  rows: readonly PredictionExample[],
  featureNames: readonly string[],
): Standardizer {
  const means = featureNames.map((name) => {
    const values = rows
      .map((row) => row.features[name]?.value)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    return values.length
      ? values.reduce((total, value) => total + value, 0) / values.length
      : 0;
  });
  const standardDeviations = featureNames.map((name, index) => {
    const values = rows
      .map((row) => row.features[name]?.value)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (values.length < 2) return 1;
    const variance =
      values.reduce((total, value) => total + (value - means[index]) ** 2, 0) /
      values.length;
    const standardDeviation = Math.sqrt(variance);
    return standardDeviation > 1e-12 ? standardDeviation : 1;
  });
  return { featureNames: [...featureNames], means, standardDeviations };
}

export function vectorize(
  row: PredictionExample,
  standardizer: Standardizer,
): { standardized: number[]; missing: number[] } {
  const standardized: number[] = [];
  const missing: number[] = [];
  standardizer.featureNames.forEach((name, index) => {
    const value = row.features[name]?.value;
    const isMissing = value === null || value === undefined || !Number.isFinite(value);
    standardized.push(
      isMissing
        ? 0
        : (value - standardizer.means[index]) /
            standardizer.standardDeviations[index],
    );
    missing.push(isMissing ? 1 : 0);
  });
  return { standardized, missing };
}

function rawLogit(member: LogisticMember, row: PredictionExample): number {
  const vector = vectorize(row, member.standardizer);
  let value = member.intercept;
  for (let index = 0; index < member.coefficients.length; index += 1) {
    value += member.coefficients[index] * vector.standardized[index];
    value += member.missingnessCoefficients[index] * vector.missing[index];
  }
  return value;
}

export function predictMember(
  member: LogisticMember,
  row: PredictionExample,
): number {
  const score = rawLogit(member, row);
  const calibrated =
    member.calibrator.slope * score + member.calibrator.intercept;
  return clampProbability(sigmoid(calibrated));
}

function fitPlatt(
  logits: readonly number[],
  labels: readonly number[],
  iterations: number,
): PlattCalibrator {
  if (
    logits.length < 4 ||
    !labels.some((label) => label === 1) ||
    !labels.some((label) => label === 0)
  ) {
    return { slope: 1, intercept: 0, fitted: false };
  }
  let slope = 1;
  let intercept = 0;
  const learningRate = 0.03;
  for (let iteration = 0; iteration < Math.max(200, iterations / 2); iteration += 1) {
    let slopeGradient = 0;
    let interceptGradient = 0;
    for (let index = 0; index < logits.length; index += 1) {
      const error = sigmoid(slope * logits[index] + intercept) - labels[index];
      slopeGradient += error * logits[index];
      interceptGradient += error;
    }
    slope -= learningRate * slopeGradient / logits.length;
    intercept -= learningRate * interceptGradient / logits.length;
  }
  return { slope, intercept, fitted: true };
}

export function fitLogisticMember(
  memberId: string,
  fitRows: readonly PointInTimeExample[],
  calibrationRows: readonly PointInTimeExample[],
  featureNames: readonly string[],
  policy: WalkForwardPolicy,
): LogisticMember {
  if (!fitRows.length) throw new Error("Cannot fit a model without training rows.");
  const standardizer = buildStandardizer(fitRows, featureNames);
  const coefficients = featureNames.map(() => 0);
  const missingnessCoefficients = featureNames.map(() => 0);
  const prevalence =
    fitRows.reduce((sum, row) => sum + row.outcome.value, 0) / fitRows.length;
  let intercept = Math.log(clampProbability(prevalence) / clampProbability(1 - prevalence));

  for (let iteration = 0; iteration < policy.iterations; iteration += 1) {
    const coefficientGradient = featureNames.map(() => 0);
    const missingGradient = featureNames.map(() => 0);
    let interceptGradient = 0;
    for (const row of fitRows) {
      const vector = vectorize(row, standardizer);
      let logit = intercept;
      for (let index = 0; index < featureNames.length; index += 1) {
        logit += coefficients[index] * vector.standardized[index];
        logit += missingnessCoefficients[index] * vector.missing[index];
      }
      const error = sigmoid(logit) - row.outcome.value;
      interceptGradient += error;
      for (let index = 0; index < featureNames.length; index += 1) {
        coefficientGradient[index] += error * vector.standardized[index];
        missingGradient[index] += error * vector.missing[index];
      }
    }
    intercept -= policy.learningRate * interceptGradient / fitRows.length;
    for (let index = 0; index < featureNames.length; index += 1) {
      coefficients[index] -=
        policy.learningRate *
        (coefficientGradient[index] / fitRows.length +
          policy.l2Penalty * coefficients[index]);
      missingnessCoefficients[index] -=
        policy.learningRate *
        (missingGradient[index] / fitRows.length +
          policy.l2Penalty * missingnessCoefficients[index]);
    }
  }

  const uncalibrated: LogisticMember = {
    memberId,
    trainedThrough: fitRows
      .map((row) => row.decisionAt)
      .sort()
      .at(-1)!,
    trainingTokenCount: new Set(fitRows.map((row) => row.tokenId)).size,
    standardizer,
    coefficients,
    missingnessCoefficients,
    intercept,
    calibrator: { slope: 1, intercept: 0, fitted: false },
  };
  const calibrationLogits = calibrationRows.map((row) => rawLogit(uncalibrated, row));
  const calibrationLabels = calibrationRows.map((row) => row.outcome.value);
  return {
    ...uncalibrated,
    calibrator: fitPlatt(calibrationLogits, calibrationLabels, policy.iterations),
  };
}

export function averagePrecision(
  labels: readonly number[],
  probabilities: readonly number[],
): number {
  const positiveCount = labels.filter((label) => label === 1).length;
  if (!positiveCount) return 0;
  const ranked = labels
    .map((label, index) => ({ label, probability: probabilities[index] }))
    .sort((left, right) => right.probability - left.probability);
  let truePositives = 0;
  let sumPrecision = 0;
  ranked.forEach((item, index) => {
    if (item.label === 1) {
      truePositives += 1;
      sumPrecision += truePositives / (index + 1);
    }
  });
  return sumPrecision / positiveCount;
}

export function evaluatePredictions(
  rows: readonly PointInTimeExample[],
  probabilities: readonly number[],
  topFraction: number,
): ResearchMetrics {
  if (rows.length !== probabilities.length || !rows.length) {
    throw new Error("Metrics require one probability for every non-empty row.");
  }
  const labels = rows.map((row) => row.outcome.value);
  const brierScore =
    labels.reduce<number>(
      (total, label, index) => total + (probabilities[index] - label) ** 2,
      0,
    ) / labels.length;
  const ranked = rows
    .map((row, index) => ({ row, probability: probabilities[index] }))
    .sort((left, right) => right.probability - left.probability);
  const selectedCount = Math.min(
    rows.length,
    Math.max(1, Math.ceil(rows.length * topFraction)),
  );
  const selected = ranked.slice(0, selectedCount);
  const returns = selected
    .map(({ row }) => row.outcome.netReturnPct)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  let peak = 1;
  let equity = 1;
  let maximumDrawdown = 0;
  const chronological = [...selected].sort((left, right) =>
    left.row.decisionAt.localeCompare(right.row.decisionAt),
  );
  if (chronological.every(({ row }) => row.outcome.netReturnPct !== undefined)) {
    chronological.forEach(({ row }) => {
      equity *= Math.max(0, 1 + row.outcome.netReturnPct! / 100);
      peak = Math.max(peak, equity);
      maximumDrawdown = Math.max(
        maximumDrawdown,
        peak > 0 ? ((peak - equity) / peak) * 100 : 0,
      );
    });
  }
  return {
    exampleCount: rows.length,
    tokenCount: new Set(rows.map((row) => row.tokenId)).size,
    positiveRate:
      labels.reduce<number>((sum, label) => sum + label, 0) / labels.length,
    brierScore,
    prAuc: averagePrecision(labels, probabilities),
    precisionAtK:
      selected.reduce((sum, item) => sum + item.row.outcome.value, 0) /
      selected.length,
    selectedCount,
    meanNetReturnPctAtK: returns.length
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : null,
    netExpectedValuePctAtK: returns.length
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : null,
    maximumStrategyDrawdownPct:
      returns.length === selected.length ? maximumDrawdown : null,
  };
}

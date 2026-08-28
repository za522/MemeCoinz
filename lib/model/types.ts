/**
 * Point-in-time modelling contracts.
 *
 * One example is one token, observed relative to one lifecycle clock, at one
 * cutoff. Feature timestamps are part of the data rather than optional audit
 * metadata: a value is ineligible when either its event or availability time
 * is later than the decision time.
 */

export type ReferenceClock = "launch" | "graduation";
export type InputTaxonomy = "raw" | "engineered";
export type FeatureTaxonomy = InputTaxonomy | "model-output";

export type FeatureFamily =
  | "lifecycle"
  | "demand"
  | "ownership"
  | "coordination"
  | "narrative"
  | "execution"
  | "market-regime"
  | "source-fidelity"
  | "other";

export interface PointInTimeFeature {
  value: number | null;
  taxonomy: FeatureTaxonomy;
  family: FeatureFamily;
  eventAt: string;
  availableAt: string;
  fidelity?: "exact" | "reconstructed" | "proxy";
  missingReason?: string;
}

export interface MaturedBinaryOutcome {
  name: string;
  version: string;
  value: 0 | 1;
  horizonSeconds: number;
  orderSizeUsd: number;
  labelAvailableAt: string;
  status: "matured";
  /** Net executable return after explicit costs, when the label provides it. */
  netReturnPct?: number;
  maximumDrawdownPct?: number;
}

export interface PointInTimeExample {
  rowId: string;
  tokenId: string;
  referenceClock: ReferenceClock;
  referenceAt: string;
  cutoffSeconds: number;
  decisionAt: string;
  featureSetVersion: string;
  features: Record<string, PointInTimeFeature>;
  outcome: MaturedBinaryOutcome;
}

export type PredictionExample = Omit<PointInTimeExample, "outcome">;

export interface DatasetAuditIssue {
  rowId: string;
  code:
    | "duplicate-row-key"
    | "invalid-time"
    | "invalid-feature-value"
    | "availability-before-event"
    | "invalid-cutoff"
    | "decision-time-mismatch"
    | "future-event"
    | "future-availability"
    | "model-output-as-input"
    | "immature-label"
    | "label-window-not-mature"
    | "mixed-feature-set"
    | "mixed-label";
  detail: string;
}

export interface DatasetAudit {
  accepted: PointInTimeExample[];
  rejectedRowIds: string[];
  issues: DatasetAuditIssue[];
  datasetAsOf: string;
}

export interface WalkForwardPolicy {
  folds: number;
  calibrationFraction: number;
  minimumExamples: number;
  minimumTokens: number;
  minimumPositiveExamples: number;
  minimumNegativeExamples: number;
  minimumTrainTokens: number;
  minimumTestTokens: number;
  topFraction: number;
  l2Penalty: number;
  learningRate: number;
  iterations: number;
}

export interface Standardizer {
  featureNames: string[];
  means: number[];
  standardDeviations: number[];
}

export interface PlattCalibrator {
  slope: number;
  intercept: number;
  fitted: boolean;
}

export interface LogisticMember {
  memberId: string;
  trainedThrough: string;
  trainingTokenCount: number;
  standardizer: Standardizer;
  coefficients: number[];
  missingnessCoefficients: number[];
  intercept: number;
  calibrator: PlattCalibrator;
}

export interface ResearchMetrics {
  exampleCount: number;
  tokenCount: number;
  positiveRate: number;
  brierScore: number;
  prAuc: number;
  precisionAtK: number;
  selectedCount: number;
  meanNetReturnPctAtK: number | null;
  netExpectedValuePctAtK: number | null;
  maximumStrategyDrawdownPct: number | null;
}

export interface FeatureRelationship {
  feature: string;
  family: FeatureFamily;
  taxonomy: InputTaxonomy;
  availablePairs: number;
  pearsonCorrelationWithLabel: number | null;
  meanAbsoluteStandardizedCoefficient: number;
}

export interface FeatureFamilyAblation {
  omittedFamily: FeatureFamily;
  status: "evaluated" | "insufficient-data";
  brierScoreDelta?: number;
  prAucDelta?: number;
  reason?: string;
}

export interface FoldEvaluation {
  fold: number;
  trainTokenCount: number;
  testTokenCount: number;
  trainThrough: string;
  testFrom: string;
  testThrough: string;
  metrics: ResearchMetrics;
}

export interface ModelArtifact {
  schemaVersion: "memetrace-model-artifact/v1";
  modelVersion: string;
  createdAt: string;
  target: {
    name: string;
    version: string;
    horizonSeconds: number;
    orderSizeUsd: number;
  };
  featureSetVersion: string;
  featureDefinitions: Record<
    string,
    { family: FeatureFamily; taxonomy: InputTaxonomy }
  >;
  trainingThrough: string;
  datasetFingerprint: string;
  policy: WalkForwardPolicy;
  members: LogisticMember[];
  outOfFoldMetrics: ResearchMetrics;
  folds: FoldEvaluation[];
  relationships: FeatureRelationship[];
  familyAblations: FeatureFamilyAblation[];
  trainingAudit: Omit<DatasetAudit, "accepted"> & { acceptedCount: number };
}

export interface ModelPrediction {
  status: "predicted";
  tokenId: string;
  rowId: string;
  decisionAt: string;
  probability: number;
  interval: { lower: number; upper: number; method: "model-ensemble-p10-p90" };
  ensembleAgreement: number;
  memberProbabilities: number[];
  missingFeatureCount: number;
  featureCount: number;
  modelVersion: string;
  target: ModelArtifact["target"];
}

export interface InsufficientData {
  status: "insufficient-data";
  reason: string;
  acceptedExamples: number;
  tokenCount: number;
  positiveExamples: number;
  negativeExamples: number;
  requirements: Pick<
    WalkForwardPolicy,
    | "minimumExamples"
    | "minimumTokens"
    | "minimumPositiveExamples"
    | "minimumNegativeExamples"
    | "minimumTrainTokens"
    | "minimumTestTokens"
  >;
  audit: Omit<DatasetAudit, "accepted"> & { acceptedCount: number };
}

export type TrainingResult =
  | { status: "trained"; artifact: ModelArtifact }
  | InsufficientData;

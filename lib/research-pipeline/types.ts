import type {
  CoinDetailResponse,
  CoinObservation,
  StorageState,
} from "@/lib/coins/types";
import type {
  ExecutableOutcomeLabel,
  FeatureCutoffSeconds,
  PointInTimeFeatureVector,
  PointInTimeInput,
} from "@/lib/features";
import type {
  ModelPrediction,
  PointInTimeFeature,
  PredictionExample,
  ReferenceClock,
} from "@/lib/model";

export const RESEARCH_FEATURE_SET_VERSION = "memetrace-point-in-time/v2";

export interface ResearchDecision {
  referenceClock: ReferenceClock;
  referenceAt: string;
  referenceAvailableAt: string;
  referenceCanonical: boolean;
  cutoffSeconds: FeatureCutoffSeconds;
  decisionAt: string;
  evaluatedAt: string;
  cutoffElapsed: boolean;
  leakageRule: string;
}

export interface UnavailableResearchDecision {
  referenceClock: ReferenceClock;
  referenceAt: null;
  referenceAvailableAt: null;
  referenceCanonical: false;
  cutoffSeconds: FeatureCutoffSeconds;
  decisionAt: null;
  evaluatedAt: string;
  cutoffElapsed: false;
  leakageRule: string;
}

export interface ObservationMappingAudit {
  inputObservationCount: number;
  eligibleObservationCount: number;
  excludedFutureEventCount: number;
  excludedFutureAvailabilityCount: number;
  excludedInvalidTimestampCount: number;
  excludedNonCanonicalCount: number;
  mappedCounts: {
    market: number;
    trades: number;
    transfers: number;
    coordinationProxies: number;
    holders: number;
    creators: number;
    quotes: number;
    socialPosts: number;
    socialCounts: number;
    paidAttention: number;
    regimes: number;
  };
  unmappedByType: Record<string, number>;
  notes: string[];
}

export interface AdaptedPointInTimeInput {
  input: PointInTimeInput;
  decision: ResearchDecision;
  audit: ObservationMappingAudit;
  missingPrerequisites: string[];
}

export interface ResearchModelInput {
  featureSetVersion: string;
  example: PredictionExample;
  values: Record<string, PointInTimeFeature>;
}

export interface FeatureSnapshotStorageState {
  state: "written" | "read-only" | "unavailable" | "failed";
  reason: string | null;
  snapshotWritten: boolean;
  snapshotId?: string;
}

export type ResearchCollectionProviderId =
  | "helius"
  | "solanaTracker"
  | "x"
  | "jupiter"
  | "jito";

export interface ResearchCollectionEvidence {
  mode: "not-run" | "safe-current-only";
  attempted: boolean;
  /** Public research reads never authorize credentialed or metered providers. */
  meteredProvidersAllowed: false;
  providers: Partial<Record<ResearchCollectionProviderId, {
    state: "collected" | "partial" | "skipped-disabled" | "skipped-not-configured" | "failed";
    metered: boolean;
    configured: boolean;
    itemsCollected: number;
    errorCode: string | null;
  }>>;
  persistence: StorageState;
  warnings: string[];
}

export type PredictionStatus =
  | (ModelPrediction & {
      artifactStatus: "validated";
      persistence: {
        state: "written" | "unavailable" | "failed";
        predictionId: string;
        mode: "shadow";
        reason: string | null;
      };
    })
  | {
      status: "untrained";
      reason: string;
      prerequisites: string[];
    }
  | {
      status: "insufficient_data";
      reason: string;
      missingPrerequisites: string[];
    };

export interface StoredOutcomeRecord {
  featureSnapshotId: string | null;
  referenceClock: ReferenceClock | null;
  cutoffSeconds: number | null;
  decisionAt: string | null;
  labelName: string;
  labelVersion: string;
  horizonSeconds: number;
  orderSizeUsd: number | null;
  value: number | null;
  status: string;
  labelAvailableAt: string;
  evidence: Record<string, unknown>;
}

export interface CoinResearchResponse {
  schemaVersion: "memetrace-coin-research/v1";
  generatedAt: string;
  status: "ready" | "pending" | "insufficient_data";
  coin: CoinDetailResponse["coin"];
  decision: ResearchDecision | UnavailableResearchDecision;
  features: PointInTimeFeatureVector | null;
  modelInput: ResearchModelInput | null;
  evidence: {
    historyCoverage: CoinDetailResponse["historyCoverage"];
    storage: CoinDetailResponse["storage"];
    collection: ResearchCollectionEvidence;
    featureStorage: FeatureSnapshotStorageState;
    mapping: ObservationMappingAudit;
    sourceIds: string[];
    overallCoveragePct: number;
    missingFieldCount: number;
  };
  outcome: ExecutableOutcomeLabel | {
    status: "pending" | "unavailable" | "available";
    labelAvailableAt: string;
    target: {
      name: string;
      version: string;
      horizonSeconds: number;
      orderSizeUsd: number;
    };
    value: 0 | 1 | null;
    maximumNetReturnPct: number | null;
    maximumDrawdownPct: number | null;
    reason: string;
    source: "persisted-outcome" | "not-observed";
  };
  prediction: PredictionStatus;
  missingPrerequisites: string[];
  caveats: string[];
}

export interface BuildResearchOptions {
  referenceClock: ReferenceClock;
  cutoffSeconds: FeatureCutoffSeconds;
  evaluatedAt?: string;
  orderSizeUsd?: number;
  horizonSeconds?: number;
  storedOutcomes?: StoredOutcomeRecord[];
}

export interface EligibleObservation extends CoinObservation {
  availableAt: string;
}

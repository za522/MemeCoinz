import type { TelegramAlertRun } from "@/lib/alerts";
import type { StorageState } from "@/lib/coins/types";
import type { CollectionProviderState } from "@/lib/collection";
import type {
  ModelArtifactStorageState,
  OutcomeMaterializationResponse,
} from "@/lib/research-pipeline";

export const PIPELINE_LIMITS = {
  maxCoins: 10,
  maxDiscoveryPages: 3,
  maxHistoryTransactions: 200,
  maxCollectionPages: 2,
  maxCollectionWindowHours: 31 * 24,
  maxOrderSizes: 3,
  maxOrderSizeUsd: 10_000,
  maxOutcomeSnapshots: 100,
  maxTelegramAlerts: 25,
} as const;

export type PipelineDiscoverySource = "auto" | "rpc" | "tracker";

export interface ResearchPipelineOptions {
  maxCoins?: number;
  maxDiscoveryPages?: number;
  discoverySource?: PipelineDiscoverySource;
  historyLimit?: number;
  collectAdvanced?: boolean;
  allowMetered?: boolean;
  collectionMaxPages?: number;
  collectionWindowHours?: number;
  orderSizesUsd?: number[];
  slippageBps?: number;
  horizonSeconds?: number;
  orderSizeUsd?: number;
  maxOutcomeSnapshots?: number;
  runTelegramAlerts?: boolean;
  telegramDryRun?: boolean;
  telegramLimit?: number;
  evaluatedAt?: string;
}

export interface NormalizedResearchPipelineOptions {
  maxCoins: number;
  maxDiscoveryPages: number;
  discoverySource: PipelineDiscoverySource;
  historyLimit: number;
  collectAdvanced: boolean;
  allowMetered: boolean;
  collectionMaxPages: number;
  collectionWindowHours: number;
  orderSizesUsd: number[];
  slippageBps: number;
  horizonSeconds: number;
  orderSizeUsd: number;
  maxOutcomeSnapshots: number;
  runTelegramAlerts: boolean;
  telegramDryRun: boolean;
  telegramLimit: number;
  evaluatedAt: string;
}

export interface PipelineTrainingSummary {
  referenceClock: "launch" | "graduation";
  examples: number;
  tokens: number;
  status: "candidate-written" | "candidate-not-written" | "insufficient-data" | "failed";
  modelVersion: string | null;
  reason: string | null;
  persistence: ModelArtifactStorageState | null;
}

export interface ResearchPipelineRun {
  schemaVersion: "memetrace-research-pipeline/v1";
  status: "complete" | "partial" | "failed";
  startedAt: string;
  completedAt: string;
  request: Omit<NormalizedResearchPipelineOptions, "evaluatedAt"> & {
    evaluatedAt: string;
  };
  discovery: {
    pagesRequested: number;
    pagesCompleted: number;
    coinsDiscovered: number;
    coinsSelected: number;
    storage: StorageState[];
  };
  coins: {
    attempted: number;
    detailLoaded: number;
    canonicalTimestamped: number;
    failed: number;
  };
  collection: {
    enabled: boolean;
    meteredRequested: boolean;
    eligibleCoins: number;
    attemptedCoins: number;
    observationsCollected: number;
    observationsPersisted: number;
    providerStates: Record<string, Partial<Record<CollectionProviderState, number>>>;
    skippedCoins: number;
    failedCoins: number;
  };
  snapshots: {
    elapsedComputed: number;
    written: number;
    notWritten: number;
    byClock: Record<"launch" | "graduation", number>;
    byCutoff: Record<string, number>;
  };
  predictions: {
    attempted: number;
    validatedServed: number;
    shadowWritten: number;
    shadowNotWritten: number;
    untrained: number;
    insufficientData: number;
  };
  outcomes: {
    scannedSnapshots: number;
    available: number;
    written: number;
    pending: number;
    unavailable: number;
    invalid: number;
    missingPath: number;
    storageState: OutcomeMaterializationResponse["storage"]["state"];
  };
  training: PipelineTrainingSummary[];
  alerts: {
    attempted: boolean;
    result: TelegramAlertRun | null;
  };
  warnings: string[];
  safety: {
    automaticTrading: false;
    transactionSubmission: false;
    candidateAutoPromotion: false;
    schedulerInstalled: false;
  };
}

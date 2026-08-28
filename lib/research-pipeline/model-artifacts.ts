import { getDb } from "@/db";
import { modelArtifacts, predictions } from "@/db/schema";
import {
  deserializeModelArtifact,
  predictResearchModel,
  serializeModelArtifact,
  type ModelArtifact,
} from "@/lib/model";
import { and, desc, eq } from "drizzle-orm";
import type {
  CoinResearchResponse,
  PredictionStatus,
} from "./types";
import { deterministicFeatureSnapshotId } from "./repository";

export type ModelArtifactStatus = "candidate" | "validated";

export interface ModelArtifactQuery {
  targetName: string;
  targetVersion: string;
  horizonSeconds: number;
  orderSizeUsd: number;
  featureSetVersion: string;
}

export interface ModelArtifactStorageState {
  state: "written" | "unavailable" | "failed";
  status: ModelArtifactStatus;
  modelVersion: string;
  reason: string | null;
}

export interface PredictionStorageState {
  state: "written" | "unavailable" | "failed";
  predictionId: string;
  mode: "shadow";
  reason: string | null;
}

export type ModelArtifactWriter = (
  artifact: ModelArtifact,
  status: ModelArtifactStatus,
) => Promise<void>;

export interface ValidatedArtifactLoad {
  artifact: ModelArtifact | null;
  warning: string | null;
}

export type ValidatedArtifactLoader = (
  query: ModelArtifactQuery,
) => Promise<ValidatedArtifactLoad>;

export type PredictionWriter = (args: {
  response: CoinResearchResponse;
  artifact: ModelArtifact;
  prediction: ReturnType<typeof predictResearchModel>;
  predictionId: string;
  snapshotId: string;
}) => Promise<void>;

function observedFiniteMetric(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}

/** A validated artifact must contain actual calibrated walk-forward evidence. */
export function modelArtifactPassesServingGates(artifact: ModelArtifact): boolean {
  return artifact.schemaVersion === "memetrace-model-artifact/v1" &&
    Boolean(artifact.modelVersion) &&
    Boolean(artifact.datasetFingerprint) &&
    Object.keys(artifact.featureDefinitions).length > 0 &&
    artifact.folds.length > 0 &&
    artifact.members.length > 0 &&
    artifact.members.every((member) =>
      member.calibrator.fitted && member.standardizer.featureNames.length > 0
    ) &&
    artifact.trainingAudit.acceptedCount >= artifact.policy.minimumExamples &&
    artifact.outOfFoldMetrics.tokenCount >= artifact.policy.minimumTokens &&
    observedFiniteMetric(artifact.outOfFoldMetrics.brierScore) &&
    observedFiniteMetric(artifact.outOfFoldMetrics.prAuc) &&
    observedFiniteMetric(artifact.outOfFoldMetrics.precisionAtK);
}

function artifactMatchesQuery(
  artifact: ModelArtifact,
  query: ModelArtifactQuery,
): boolean {
  return artifact.target.name === query.targetName &&
    artifact.target.version === query.targetVersion &&
    artifact.target.horizonSeconds === query.horizonSeconds &&
    artifact.target.orderSizeUsd === query.orderSizeUsd &&
    artifact.featureSetVersion === query.featureSetVersion;
}

async function writeModelArtifact(
  artifact: ModelArtifact,
  requestedStatus: ModelArtifactStatus,
): Promise<void> {
  if (requestedStatus === "validated" && !modelArtifactPassesServingGates(artifact)) {
    throw new Error("Artifact does not pass calibrated walk-forward serving gates.");
  }
  const db = await getDb();
  const serialized = serializeModelArtifact(artifact);
  const [existing] = await db
    .select()
    .from(modelArtifacts)
    .where(eq(modelArtifacts.modelVersion, artifact.modelVersion))
    .limit(1);
  if (existing) {
    if (existing.artifactJson !== serialized) {
      throw new Error("An immutable artifact with this modelVersion already has different bytes.");
    }
    if (existing.status === "validated" || existing.status === requestedStatus) return;
    await db.update(modelArtifacts).set({ status: requestedStatus }).where(
      eq(modelArtifacts.id, existing.id),
    );
    return;
  }
  await db.insert(modelArtifacts).values({
    id: `model:${artifact.modelVersion}`,
    modelVersion: artifact.modelVersion,
    status: requestedStatus,
    targetName: artifact.target.name,
    targetVersion: artifact.target.version,
    horizonSeconds: artifact.target.horizonSeconds,
    orderSizeUsd: artifact.target.orderSizeUsd,
    featureSetVersion: artifact.featureSetVersion,
    trainingThrough: artifact.trainingThrough,
    datasetFingerprint: artifact.datasetFingerprint,
    artifactJson: serialized,
    createdAt: artifact.createdAt,
  });
}

export async function persistModelArtifact(
  artifact: ModelArtifact,
  status: ModelArtifactStatus,
  writer: ModelArtifactWriter = writeModelArtifact,
): Promise<ModelArtifactStorageState> {
  try {
    if (status === "validated" && !modelArtifactPassesServingGates(artifact)) {
      throw new Error("Artifact does not pass calibrated walk-forward serving gates.");
    }
    await writer(artifact, status);
    return {
      state: "written",
      status,
      modelVersion: artifact.modelVersion,
      reason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown artifact storage error.";
    const unavailable = message.includes("binding `DB` is unavailable") ||
      message.includes("cloudflare:");
    return {
      state: unavailable ? "unavailable" : "failed",
      status,
      modelVersion: artifact.modelVersion,
      reason: `Model artifact was not persisted: ${message}`,
    };
  }
}

export async function loadNewestValidatedModelArtifact(
  query: ModelArtifactQuery,
): Promise<ValidatedArtifactLoad> {
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(modelArtifacts)
      .where(and(
        eq(modelArtifacts.status, "validated"),
        eq(modelArtifacts.targetName, query.targetName),
        eq(modelArtifacts.targetVersion, query.targetVersion),
        eq(modelArtifacts.horizonSeconds, query.horizonSeconds),
        eq(modelArtifacts.orderSizeUsd, query.orderSizeUsd),
        eq(modelArtifacts.featureSetVersion, query.featureSetVersion),
      ))
      .orderBy(desc(modelArtifacts.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return { artifact: null, warning: null };
    const artifact = deserializeModelArtifact(row.artifactJson);
    const exactMetadata = artifact.modelVersion === row.modelVersion &&
      artifact.trainingThrough === row.trainingThrough &&
      artifact.datasetFingerprint === row.datasetFingerprint &&
      artifactMatchesQuery(artifact, query);
    if (!exactMetadata || !modelArtifactPassesServingGates(artifact)) {
      return {
        artifact: null,
        warning: "The newest matching validated artifact failed metadata or serving-gate validation.",
      };
    }
    return { artifact, warning: null };
  } catch (error) {
    return {
      artifact: null,
      warning: error instanceof Error
        ? `Validated model storage is unavailable: ${error.message}`
        : "Validated model storage is unavailable.",
    };
  }
}

async function writeShadowPrediction(args: Parameters<PredictionWriter>[0]): Promise<void> {
  const db = await getDb();
  await db.insert(predictions).values({
    id: args.predictionId,
    assetId: `solana:${args.response.coin.mint}`,
    featureSnapshotId: args.snapshotId,
    modelVersion: args.artifact.modelVersion,
    predictionType: "calibrated-probability",
    probability: args.prediction.probability,
    expectedValue: null,
    lowerBound: args.prediction.interval.lower,
    upperBound: args.prediction.interval.upper,
    explanationJson: JSON.stringify({
      ensembleAgreement: args.prediction.ensembleAgreement,
      memberProbabilities: args.prediction.memberProbabilities,
      missingFeatureCount: args.prediction.missingFeatureCount,
      featureCount: args.prediction.featureCount,
      target: args.prediction.target,
      artifactStatus: "validated",
      tradingAction: "none",
    }),
    writtenAt: new Date().toISOString(),
    mode: "shadow",
  }).onConflictDoNothing({ target: predictions.id });
}

async function persistShadowPrediction(
  response: CoinResearchResponse,
  artifact: ModelArtifact,
  prediction: ReturnType<typeof predictResearchModel>,
  writer: PredictionWriter,
): Promise<PredictionStorageState> {
  const decision = response.decision;
  const snapshotId = deterministicFeatureSnapshotId(
    response.coin.mint,
    decision.referenceClock,
    decision.cutoffSeconds,
  );
  const predictionId = `prediction:${snapshotId}:${artifact.modelVersion}`;
  try {
    await writer({ response, artifact, prediction, predictionId, snapshotId });
    return { state: "written", predictionId, mode: "shadow", reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown prediction storage error.";
    const unavailable = message.includes("binding `DB` is unavailable") ||
      message.includes("cloudflare:") ||
      message.includes("FOREIGN KEY");
    return {
      state: unavailable ? "unavailable" : "failed",
      predictionId,
      mode: "shadow",
      reason: `Prediction was computed but not persisted: ${message}`,
    };
  }
}

export async function serveValidatedPrediction(
  response: CoinResearchResponse,
  query: Omit<ModelArtifactQuery, "featureSetVersion">,
  dependencies: {
    load?: ValidatedArtifactLoader;
    writePrediction?: PredictionWriter;
  } = {},
): Promise<{ prediction: PredictionStatus; caveats: string[] }> {
  if (
    !response.modelInput ||
    !response.decision.referenceAt ||
    !response.decision.referenceAvailableAt ||
    !response.decision.referenceCanonical ||
    !response.decision.decisionAt ||
    Date.parse(response.decision.referenceAvailableAt) > Date.parse(response.decision.decisionAt) ||
    response.status === "pending"
  ) {
    return {
      prediction: {
        status: "insufficient_data",
        reason: "A leakage-safe elapsed model row is unavailable.",
        missingPrerequisites: response.missingPrerequisites,
      },
      caveats: [],
    };
  }
  const fullQuery: ModelArtifactQuery = {
    ...query,
    featureSetVersion: response.modelInput.featureSetVersion,
  };
  const loaded = await (dependencies.load ?? loadNewestValidatedModelArtifact)(fullQuery);
  if (!loaded.artifact) {
    return {
      prediction: {
        status: "untrained",
        reason: loaded.warning ??
          "No validated model artifact matches this target, order size, horizon, and feature set.",
        prerequisites: [
          "Materialize cutoff-aligned matured executable outcomes.",
          "Train and validate a calibrated chronological walk-forward artifact.",
          "Persist the validated artifact for this exact feature set and target.",
        ],
      },
      caveats: loaded.warning ? [loaded.warning] : [],
    };
  }
  try {
    const prediction = predictResearchModel(loaded.artifact, response.modelInput.example);
    const persistence = await persistShadowPrediction(
      response,
      loaded.artifact,
      prediction,
      dependencies.writePrediction ?? writeShadowPrediction,
    );
    return {
      prediction: {
        ...prediction,
        artifactStatus: "validated",
        persistence,
      },
      caveats: persistence.reason ? [persistence.reason] : [],
    };
  } catch (error) {
    const reason = error instanceof Error
      ? `Validated artifact could not score this row: ${error.message}`
      : "Validated artifact could not score this row.";
    return {
      prediction: {
        status: "insufficient_data",
        reason,
        missingPrerequisites: ["A compatible, leakage-safe feature row is required."],
      },
      caveats: [reason],
    };
  }
}

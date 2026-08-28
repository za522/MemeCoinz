import { getDb } from "@/db";
import { assets, featureSnapshots, outcomes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type {
  CoinResearchResponse,
  FeatureSnapshotStorageState,
  StoredOutcomeRecord,
} from "./types";

export interface FeatureSnapshotPersistenceRecord {
  id: string;
  assetId: string;
  mint: string;
  cutoffSeconds: number;
  decisionAvailableAt: string;
  featureSetVersion: string;
  featureJson: string;
  fidelityJson: string;
  missingnessJson: string;
  computedAt: string;
}

export interface FeatureSnapshotPersistencePlan {
  record: FeatureSnapshotPersistenceRecord | null;
  reason: string | null;
}

export type FeatureSnapshotWriter = (
  record: FeatureSnapshotPersistenceRecord,
) => Promise<void>;

export function deterministicFeatureSnapshotId(
  mint: string,
  referenceClock: "launch" | "graduation",
  cutoffSeconds: number,
): string {
  return ["feature", mint, referenceClock, cutoffSeconds, "v2"].join(":");
}

function parseEvidence(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

/**
 * Load outcome rows that already exist in the shared D1 research store.
 * Failure is allowed: live coin research remains available with an explicit
 * unavailable outcome rather than fabricating one or failing the whole route.
 */
export async function loadStoredOutcomesForMint(mint: string): Promise<{
  outcomes: StoredOutcomeRecord[];
  storageWarning: string | null;
}> {
  try {
    const db = await getDb();
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.mintAddress, mint))
      .limit(1);
    if (!asset) return { outcomes: [], storageWarning: null };
    const rows = await db.select().from(outcomes).where(eq(outcomes.assetId, asset.id));
    return {
      outcomes: rows.map((row) => ({
        featureSnapshotId: row.featureSnapshotId,
        referenceClock:
          row.referenceClock === "launch" || row.referenceClock === "graduation"
            ? row.referenceClock
            : null,
        cutoffSeconds: row.cutoffSeconds,
        decisionAt: row.decisionAt,
        labelName: row.labelName,
        labelVersion: row.labelVersion,
        horizonSeconds: row.horizonSeconds,
        orderSizeUsd: row.orderSizeUsd,
        value: row.value,
        status: row.status,
        labelAvailableAt: row.labelAvailableAt,
        evidence: parseEvidence(row.evidenceJson),
      })),
      storageWarning: null,
    };
  } catch (error) {
    return {
      outcomes: [],
      storageWarning: error instanceof Error
        ? `Persistent outcome storage is unavailable: ${error.message}`
        : "Persistent outcome storage is unavailable.",
    };
  }
}

/** Build a deterministic persistence row only after point-in-time leakage checks pass. */
export function planFeatureSnapshotPersistence(
  response: CoinResearchResponse,
): FeatureSnapshotPersistencePlan {
  const decision = response.decision;
  if (
    !decision.referenceAt ||
    !decision.referenceAvailableAt ||
    !decision.referenceCanonical ||
    !decision.decisionAt ||
    !decision.cutoffElapsed ||
    response.status === "pending" ||
    !response.modelInput ||
    !response.features
  ) {
    return {
      record: null,
      reason: "Only elapsed feature snapshots with a timestamped reference and model envelope are persisted.",
    };
  }
  const example = response.modelInput.example;
  const aligned =
    example.tokenId === response.coin.mint &&
    example.referenceClock === decision.referenceClock &&
    example.referenceAt === decision.referenceAt &&
    example.cutoffSeconds === decision.cutoffSeconds &&
    example.decisionAt === decision.decisionAt;
  if (!aligned) {
    return {
      record: null,
      reason: "The model envelope does not align exactly with the coin, reference clock, and cutoff.",
    };
  }
  const decisionMs = Date.parse(decision.decisionAt);
  const referenceAtMs = Date.parse(decision.referenceAt);
  const referenceAvailableAtMs = Date.parse(decision.referenceAvailableAt);
  if (
    !Number.isFinite(decisionMs) ||
    !Number.isFinite(referenceAtMs) ||
    !Number.isFinite(referenceAvailableAtMs)
  ) {
    return {
      record: null,
      reason: "The reference or decision timestamp is invalid.",
    };
  }
  if (referenceAvailableAtMs < referenceAtMs) {
    return {
      record: null,
      reason: "The reference availability timestamp precedes the reference event.",
    };
  }
  if (referenceAvailableAtMs > decisionMs) {
    return {
      record: null,
      reason: "The reference event was not available by the decision cutoff.",
    };
  }
  const invalidFeature = Object.values(response.modelInput.values).find((feature) => {
    const eventAtMs = Date.parse(feature.eventAt);
    const availableAtMs = Date.parse(feature.availableAt);
    return !Number.isFinite(eventAtMs) ||
      !Number.isFinite(availableAtMs) ||
      availableAtMs < eventAtMs ||
      eventAtMs > decisionMs ||
      availableAtMs > decisionMs;
  });
  if (invalidFeature) {
    return {
      record: null,
      reason: "At least one feature has an invalid, reversed, or post-decision provenance timestamp.",
    };
  }
  const assetId = `solana:${response.coin.mint}`;
  const snapshotId = deterministicFeatureSnapshotId(
    response.coin.mint,
    decision.referenceClock,
    decision.cutoffSeconds,
  );
  return {
    record: {
      id: snapshotId,
      assetId,
      mint: response.coin.mint,
      cutoffSeconds: decision.cutoffSeconds,
      decisionAvailableAt: decision.decisionAt,
      featureSetVersion: response.modelInput.featureSetVersion,
      featureJson: JSON.stringify({
        referenceClock: decision.referenceClock,
        referenceAt: decision.referenceAt,
        referenceAvailableAt: decision.referenceAvailableAt,
        referenceCanonical: decision.referenceCanonical,
        decisionAt: decision.decisionAt,
        modelInput: response.modelInput.example,
        values: response.modelInput.values,
      }),
      fidelityJson: JSON.stringify(response.features.evidenceQuality),
      missingnessJson: JSON.stringify({
        missingPrerequisites: response.missingPrerequisites,
        missingFieldsByFamily: Object.fromEntries(
          Object.entries(response.features.evidenceQuality.byFamily).map(([family, quality]) => [
            family,
            quality.missingFields,
          ]),
        ),
      }),
      computedAt: response.generatedAt,
    },
    reason: null,
  };
}

async function writeFeatureSnapshot(record: FeatureSnapshotPersistenceRecord): Promise<void> {
  const db = await getDb();
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(eq(assets.id, record.assetId))
    .limit(1);
  if (!asset) {
    throw new Error("The aligned asset row does not exist in persistent storage.");
  }
  await db.insert(featureSnapshots).values({
    id: record.id,
    assetId: record.assetId,
    cutoffSeconds: record.cutoffSeconds,
    decisionAvailableAt: record.decisionAvailableAt,
    featureSetVersion: record.featureSetVersion,
    featureJson: record.featureJson,
    fidelityJson: record.fidelityJson,
    missingnessJson: record.missingnessJson,
    computedAt: record.computedAt,
  }).onConflictDoUpdate({
    target: featureSnapshots.id,
    set: {
      decisionAvailableAt: record.decisionAvailableAt,
      featureJson: record.featureJson,
      fidelityJson: record.fidelityJson,
      missingnessJson: record.missingnessJson,
      computedAt: record.computedAt,
    },
  });
}

/** Persistence failure is explicit and nonfatal to the real-data API response. */
export async function persistFeatureSnapshot(
  response: CoinResearchResponse,
  writer: FeatureSnapshotWriter = writeFeatureSnapshot,
): Promise<FeatureSnapshotStorageState> {
  const plan = planFeatureSnapshotPersistence(response);
  if (!plan.record) {
    return {
      state: "read-only",
      reason: plan.reason,
      snapshotWritten: false,
    };
  }
  try {
    await writer(plan.record);
    return {
      state: "written",
      reason: null,
      snapshotWritten: true,
      snapshotId: plan.record.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown feature storage error.";
    const unavailable =
      message.includes("binding `DB` is unavailable") ||
      message.includes("cloudflare:") ||
      message.includes("does not exist");
    return {
      state: unavailable ? "unavailable" : "failed",
      reason: `Feature snapshot was not persisted: ${message}`,
      snapshotWritten: false,
      snapshotId: plan.record.id,
    };
  }
}

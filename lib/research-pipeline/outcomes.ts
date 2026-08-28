import { getDb } from "@/db";
import { assets, featureSnapshots, observations, outcomes } from "@/db/schema";
import {
  deriveExecutableOutcomeLabel,
  type EvidenceFidelity,
  type ExecutableOutcomeLabel,
  type ExecutablePositionPath,
  type FeatureCutoffSeconds,
  type OutcomeDefinition,
  type PositionExitSample,
} from "@/lib/features";
import { and, desc, eq, inArray, lte } from "drizzle-orm";

type JsonRecord = Record<string, unknown>;

export interface MaterializerSnapshot {
  id: string;
  assetId: string;
  mint: string;
  cutoffSeconds: FeatureCutoffSeconds;
  decisionAt: string;
  referenceClock: "launch" | "graduation";
  referenceAt: string;
}

export interface ExecutionPathObservation {
  id: string;
  assetId: string;
  sourceId: string;
  eventAt: string;
  availableAt: string;
  fidelity: EvidenceFidelity;
  canonical: boolean;
  normalized: JsonRecord;
}

export interface OutcomePersistenceRecord {
  id: string;
  assetId: string;
  featureSnapshotId: string;
  referenceClock: "launch" | "graduation";
  cutoffSeconds: number;
  decisionAt: string;
  labelName: string;
  labelVersion: string;
  horizonSeconds: number;
  orderSizeUsd: number;
  value: 0 | 1;
  status: "matured";
  labelAvailableAt: string;
  evidenceJson: string;
}

export interface OutcomeAssessment {
  featureSnapshotId: string;
  status: "available" | "pending" | "unavailable" | "invalid" | "missing-path";
  reason: string;
  label: ExecutableOutcomeLabel | null;
  record: OutcomePersistenceRecord | null;
}

export interface OutcomeMaterializationResponse {
  startedAt: string;
  completedAt: string;
  request: {
    maxSnapshots: number;
    horizonSeconds: number;
    orderSizeUsd: number;
    dryRun: boolean;
    labelAsOf: string;
    maturedDecisionThrough: string | null;
  };
  scannedSnapshots: number;
  executionPathObservations: number;
  assessed: number;
  available: number;
  pending: number;
  unavailable: number;
  invalid: number;
  missingPath: number;
  outcomesWritten: number;
  storage: {
    state: "written" | "read-only" | "unavailable" | "failed";
    reason: string | null;
  };
  assessments: OutcomeAssessment[];
  caveats: string[];
}

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const validFidelity = (value: unknown): EvidenceFidelity | null => {
  if (value === "exact" || value === "reconstructed" || value === "proxy") return value;
  if (value === "canonical-finalized" || value === "canonical-confirmed") return "exact";
  if (value === "canonical-reconstructed" || value === "indexed") return "reconstructed";
  if (value === "market-derived") return "proxy";
  return null;
};

function parseJson(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseSnapshot(row: {
  id: string;
  assetId: string;
  cutoffSeconds: number;
  decisionAvailableAt: string;
  featureJson: string;
}, mint: string): MaterializerSnapshot | null {
  const envelope = parseJson(row.featureJson);
  if (!envelope) return null;
  const referenceClock = envelope.referenceClock;
  const referenceAt = asString(envelope.referenceAt);
  const decisionAt = asString(envelope.decisionAt) ?? row.decisionAvailableAt;
  if (
    (referenceClock !== "launch" && referenceClock !== "graduation") ||
    !referenceAt ||
    decisionAt !== row.decisionAvailableAt ||
    ![30, 60, 300, 900, 3_600].includes(row.cutoffSeconds)
  ) return null;
  const expectedDecision = Date.parse(referenceAt) + row.cutoffSeconds * 1_000;
  if (
    !Number.isFinite(expectedDecision) ||
    Math.abs(Date.parse(decisionAt) - expectedDecision) > 1_000
  ) return null;
  return {
    id: row.id,
    assetId: row.assetId,
    mint,
    cutoffSeconds: row.cutoffSeconds as FeatureCutoffSeconds,
    decisionAt,
    referenceClock,
    referenceAt,
  };
}

function parseExit(value: unknown): PositionExitSample | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const eventAt = asString(value.eventAt);
  const availableAt = asString(value.availableAt);
  const sourceId = asString(value.sourceId);
  const fidelity = validFidelity(value.fidelity);
  const exitRouteAvailable = asBoolean(value.exitRouteAvailable);
  if (!id || !eventAt || !availableAt || !sourceId || !fidelity || exitRouteAvailable === null) {
    return null;
  }
  const netExitValueUsd = value.netExitValueUsd === null
    ? null
    : asNumber(value.netExitValueUsd);
  const priceImpactPct = value.priceImpactPct === null
    ? null
    : asNumber(value.priceImpactPct);
  if (
    (value.netExitValueUsd !== null && netExitValueUsd === null) ||
    (value.priceImpactPct !== null && priceImpactPct === null)
  ) return null;
  return {
    id,
    eventAt,
    availableAt,
    sourceId,
    fidelity,
    canonical: value.canonical !== false,
    netExitValueUsd,
    exitRouteAvailable,
    priceImpactPct,
  };
}

export function parseExecutionPath(
  snapshot: MaterializerSnapshot,
  observation: ExecutionPathObservation,
  requestedOrderSizeUsd: number,
): ExecutablePositionPath | null {
  const value = observation.normalized;
  const featureSnapshotId = asString(value.featureSnapshotId);
  const referenceClock = value.referenceClock;
  const cutoffSeconds = asNumber(value.cutoffSeconds);
  const decisionAt = asString(value.decisionAt);
  const orderSizeUsd = asNumber(value.orderSizeUsd);
  const entryAt = asString(value.entryAt);
  const entryAvailableAt = asString(value.entryAvailableAt);
  const entryRouteAvailable = asBoolean(value.entryRouteAvailable);
  const totalEntryCostUsd = value.totalEntryCostUsd === null
    ? null
    : asNumber(value.totalEntryCostUsd);
  const coverage = isRecord(value.coverage) ? value.coverage : null;
  if (
    featureSnapshotId !== snapshot.id ||
    referenceClock !== snapshot.referenceClock ||
    cutoffSeconds !== snapshot.cutoffSeconds ||
    decisionAt !== snapshot.decisionAt ||
    orderSizeUsd !== requestedOrderSizeUsd ||
    entryAt !== snapshot.decisionAt ||
    !entryAvailableAt ||
    entryRouteAvailable === null ||
    (value.totalEntryCostUsd !== null && totalEntryCostUsd === null) ||
    !coverage ||
    !Array.isArray(value.exits)
  ) return null;
  const coverageStatus = coverage.status;
  const eventThrough = asString(coverage.eventThrough);
  const coverageAvailableAt = asString(coverage.availableAt);
  const coverageFidelity = validFidelity(coverage.fidelity);
  const sourceIds = Array.isArray(coverage.sourceIds)
    ? coverage.sourceIds.filter((item): item is string => typeof item === "string")
    : [];
  if (
    (coverageStatus !== "complete" && coverageStatus !== "partial" &&
      coverageStatus !== "unavailable") ||
    !eventThrough ||
    !coverageAvailableAt ||
    !coverageFidelity ||
    sourceIds.length === 0
  ) return null;
  const exits = value.exits.map(parseExit);
  if (exits.some((exit) => exit === null)) return null;
  return {
    id: observation.id,
    mint: snapshot.mint,
    cutoffSeconds: snapshot.cutoffSeconds,
    orderSizeUsd,
    entryAt,
    entryAvailableAt,
    entryRouteAvailable,
    totalEntryCostUsd,
    exits: exits as PositionExitSample[],
    coverage: {
      status: coverageStatus,
      eventThrough,
      availableAt: coverageAvailableAt,
      fidelity: coverageFidelity,
      sourceIds,
    },
  };
}

function labelIdentity(definition: OutcomeDefinition): { name: string; version: string } {
  if (definition.targetMultiple === 2 && definition.downsideMultiple === 0.5) {
    return { name: "net-executable-2x-before-minus-50", version: "v1" };
  }
  const target = String(definition.targetMultiple).replace(".", "_");
  const downside = String(Math.round((1 - definition.downsideMultiple) * 100));
  return { name: `net-executable-${target}x-before-minus-${downside}`, version: "v1" };
}

export function assessOutcomeForSnapshot(
  snapshot: MaterializerSnapshot,
  pathObservations: readonly ExecutionPathObservation[],
  definition: OutcomeDefinition,
  orderSizeUsd: number,
  labelAsOf: string,
): OutcomeAssessment {
  const matching = pathObservations
    .filter((observation) => observation.assetId === snapshot.assetId && observation.canonical)
    .sort((left, right) => right.availableAt.localeCompare(left.availableAt));
  if (!matching.length) {
    return {
      featureSnapshotId: snapshot.id,
      status: "missing-path",
      reason: "No cutoff-aligned execution_path observation exists.",
      label: null,
      record: null,
    };
  }
  const parsed = matching.flatMap((observation) => {
    const path = parseExecutionPath(snapshot, observation, orderSizeUsd);
    return path ? [path] : [];
  });
  if (!parsed.length) {
    return {
      featureSnapshotId: snapshot.id,
      status: "invalid",
      reason: "Execution-path observations exist but none align exactly with the snapshot schema.",
      label: null,
      record: null,
    };
  }
  const labels = parsed.map((path) =>
    deriveExecutableOutcomeLabel(path, definition, labelAsOf)
  );
  const label = labels.find((candidate) => candidate.status === "available") ??
    labels.find((candidate) => candidate.status === "pending") ?? labels[0];
  if (label.status !== "available") {
    return {
      featureSnapshotId: snapshot.id,
      status: label.status,
      reason: label.caveats.join(" "),
      label,
      record: null,
    };
  }
  const identity = labelIdentity(definition);
  const outcomeId = [
    "outcome",
    snapshot.id,
    identity.version,
    definition.horizonSeconds,
    orderSizeUsd,
  ].join(":");
  return {
    featureSnapshotId: snapshot.id,
    status: "available",
    reason: "A mature, complete, cutoff-aligned executable path produced this label.",
    label,
    record: {
      id: outcomeId,
      assetId: snapshot.assetId,
      featureSnapshotId: snapshot.id,
      referenceClock: snapshot.referenceClock,
      cutoffSeconds: snapshot.cutoffSeconds,
      decisionAt: snapshot.decisionAt,
      labelName: identity.name,
      labelVersion: identity.version,
      horizonSeconds: definition.horizonSeconds,
      orderSizeUsd,
      value: label.reachedTargetBeforeDownside ? 1 : 0,
      status: "matured",
      labelAvailableAt: label.labelAvailableAt,
      evidenceJson: JSON.stringify({
        featureSnapshotId: snapshot.id,
        referenceClock: snapshot.referenceClock,
        referenceAt: snapshot.referenceAt,
        cutoffSeconds: snapshot.cutoffSeconds,
        decisionAt: snapshot.decisionAt,
        netReturnPct: label.maximumNetReturnPct,
        maximumNetReturnPct: label.maximumNetReturnPct,
        maximumDrawdownPct: label.maximumDrawdownPct,
        exitabilityPct: label.exitabilityPct,
        exitSucceededAtHorizon: label.exitSucceededAtHorizon,
        observedExitSampleCount: label.observedExitSampleCount,
        targetMultiple: label.targetMultiple,
        downsideMultiple: label.downsideMultiple,
        fidelity: label.fidelity,
        sourceIds: label.sourceIds,
        caveats: label.caveats,
      }),
    },
  };
}

function storageFailure(error: unknown): OutcomeMaterializationResponse["storage"] {
  const message = error instanceof Error ? error.message : "Unknown outcome storage error.";
  const unavailable = message.includes("binding `DB` is unavailable") ||
    message.includes("cloudflare:");
  return {
    state: unavailable ? "unavailable" : "failed",
    reason: `Outcome materialization failed: ${message}`,
  };
}

export async function materializeMaturedOutcomes(options: {
  maxSnapshots?: number;
  horizonSeconds?: number;
  orderSizeUsd?: number;
  dryRun?: boolean;
  labelAsOf?: string;
} = {}): Promise<OutcomeMaterializationResponse> {
  const startedAt = new Date().toISOString();
  const maxSnapshots = Math.min(100, Math.max(1, options.maxSnapshots ?? 50));
  const horizonSeconds = Math.max(1, Math.floor(options.horizonSeconds ?? 86_400));
  const orderSizeUsd = Math.max(0.01, options.orderSizeUsd ?? 100);
  const dryRun = options.dryRun === true;
  const labelAsOf = options.labelAsOf ?? startedAt;
  const labelAsOfMs = Date.parse(labelAsOf);
  const maturedDecisionThrough = Number.isFinite(labelAsOfMs)
    ? new Date(labelAsOfMs - horizonSeconds * 1_000).toISOString()
    : null;
  const base = {
    startedAt,
    request: {
      maxSnapshots,
      horizonSeconds,
      orderSizeUsd,
      dryRun,
      labelAsOf,
      maturedDecisionThrough,
    },
  };
  try {
    if (!maturedDecisionThrough) {
      throw new Error("labelAsOf must be a valid ISO-8601 timestamp.");
    }
    const db = await getDb();
    const snapshotRows = await db
      .select()
      .from(featureSnapshots)
      .where(lte(featureSnapshots.decisionAvailableAt, maturedDecisionThrough))
      .orderBy(desc(featureSnapshots.decisionAvailableAt))
      .limit(maxSnapshots);
    const assetIds = [...new Set(snapshotRows.map((row) => row.assetId))];
    const assetRows = assetIds.length
      ? await db.select({ id: assets.id, mint: assets.mintAddress })
          .from(assets)
          .where(inArray(assets.id, assetIds))
      : [];
    const mintByAsset = new Map(assetRows.map((row) => [row.id, row.mint]));
    const pathRows = assetIds.length
      ? await db.select().from(observations).where(and(
          inArray(observations.assetId, assetIds),
          eq(observations.observationType, "execution_path"),
        )).limit(maxSnapshots * 10)
      : [];
    const paths: ExecutionPathObservation[] = pathRows.flatMap((row) => {
      const normalized = parseJson(row.normalizedJson);
      const fidelity = validFidelity(row.fidelity);
      const availableAt = row.availableAt ?? row.observedAt ?? row.retrievedAt;
      if (!row.assetId || !normalized || !fidelity || !availableAt) return [];
      const canonical = !row.canonicalStatus.toLowerCase().includes("failed") &&
        !row.canonicalStatus.toLowerCase().includes("orphaned");
      return [{
        id: row.id,
        assetId: row.assetId,
        sourceId: row.sourceId,
        eventAt: row.eventAt,
        availableAt,
        fidelity,
        canonical,
        normalized,
      }];
    });
    const definition: OutcomeDefinition = {
      horizonSeconds,
      targetMultiple: 2,
      downsideMultiple: 0.5,
    };
    const assessments: OutcomeAssessment[] = [];
    for (const row of snapshotRows) {
      const mint = mintByAsset.get(row.assetId);
      const snapshot = mint ? parseSnapshot(row, mint) : null;
      if (!snapshot) {
        assessments.push({
          featureSnapshotId: row.id,
          status: "invalid",
          reason: "Feature snapshot metadata is missing or not clock-aligned.",
          label: null,
          record: null,
        });
        continue;
      }
      assessments.push(
        assessOutcomeForSnapshot(snapshot, paths, definition, orderSizeUsd, labelAsOf),
      );
    }
    const availableRecords = assessments.flatMap((assessment) =>
      assessment.record ? [assessment.record] : []
    );
    let outcomesWritten = 0;
    if (!dryRun) {
      const candidateIds = availableRecords.map((record) => record.id);
      const existingRows = candidateIds.length
        ? await db.select({ id: outcomes.id }).from(outcomes).where(
            inArray(outcomes.id, candidateIds),
          )
        : [];
      const existingIds = new Set(existingRows.map((row) => row.id));
      for (const record of availableRecords.filter((item) => !existingIds.has(item.id))) {
        await db.insert(outcomes).values(record).onConflictDoNothing({ target: outcomes.id });
        outcomesWritten += 1;
      }
    }
    return {
      ...base,
      completedAt: new Date().toISOString(),
      scannedSnapshots: snapshotRows.length,
      executionPathObservations: paths.length,
      assessed: assessments.length,
      available: assessments.filter((item) => item.status === "available").length,
      pending: assessments.filter((item) => item.status === "pending").length,
      unavailable: assessments.filter((item) => item.status === "unavailable").length,
      invalid: assessments.filter((item) => item.status === "invalid").length,
      missingPath: assessments.filter((item) => item.status === "missing-path").length,
      outcomesWritten: dryRun ? 0 : outcomesWritten,
      storage: dryRun
        ? { state: "read-only", reason: "Dry run: no outcome rows were written." }
        : { state: "written", reason: null },
      assessments,
      caveats: [
        "Only available labels from complete, mature execution paths are persisted.",
        "Pending, unavailable, invalid, and missing paths never become a false zero outcome.",
        "Materialization is bounded and manual; it does not schedule collection or place trades.",
      ],
    };
  } catch (error) {
    return {
      ...base,
      completedAt: new Date().toISOString(),
      scannedSnapshots: 0,
      executionPathObservations: 0,
      assessed: 0,
      available: 0,
      pending: 0,
      unavailable: 0,
      invalid: 0,
      missingPath: 0,
      outcomesWritten: 0,
      storage: storageFailure(error),
      assessments: [],
      caveats: ["No outcome was inferred or written after the materialization failure."],
    };
  }
}

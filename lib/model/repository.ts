import { getDb } from "@/db";
import { assets, featureSnapshots, outcomes } from "@/db/schema";
import type {
  FeatureFamily,
  FeatureTaxonomy,
  PointInTimeExample,
  PointInTimeFeature,
  ReferenceClock,
} from "./types";

interface PersistedFeatureEnvelope {
  referenceClock?: unknown;
  referenceAt?: unknown;
  values?: unknown;
}

export interface LoadedResearchDataset {
  examples: PointInTimeExample[];
  repository: {
    featureSnapshotCount: number;
    outcomeCount: number;
    assetCount: number;
    rejectedSnapshotCount: number;
    rejectionReasons: Record<string, number>;
  };
}

const families = new Set<FeatureFamily>([
  "lifecycle",
  "demand",
  "ownership",
  "coordination",
  "narrative",
  "execution",
  "market-regime",
  "source-fidelity",
  "other",
]);
const taxonomies = new Set<FeatureTaxonomy>([
  "raw",
  "engineered",
  "model-output",
]);

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseFeatures(value: unknown): Record<string, PointInTimeFeature> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const features: Record<string, PointInTimeFeature> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const candidate = raw as Record<string, unknown>;
    const numericValue = candidate.value;
    if (
      numericValue !== null &&
      (typeof numericValue !== "number" || !Number.isFinite(numericValue))
    ) {
      return null;
    }
    if (
      typeof candidate.taxonomy !== "string" ||
      !taxonomies.has(candidate.taxonomy as FeatureTaxonomy) ||
      typeof candidate.family !== "string" ||
      !families.has(candidate.family as FeatureFamily) ||
      typeof candidate.eventAt !== "string" ||
      typeof candidate.availableAt !== "string"
    ) {
      return null;
    }
    features[name] = {
      value: numericValue as number | null,
      taxonomy: candidate.taxonomy as FeatureTaxonomy,
      family: candidate.family as FeatureFamily,
      eventAt: candidate.eventAt,
      availableAt: candidate.availableAt,
      fidelity:
        candidate.fidelity === "exact" ||
        candidate.fidelity === "reconstructed" ||
        candidate.fidelity === "proxy"
          ? candidate.fidelity
          : undefined,
      missingReason:
        typeof candidate.missingReason === "string"
          ? candidate.missingReason
          : undefined,
    };
  }
  return features;
}

export function persistedOutcomeAlignsSnapshot(
  candidate: {
    featureSnapshotId: string | null;
    referenceClock: string | null;
    cutoffSeconds: number | null;
    decisionAt: string | null;
  },
  evidenceRecord: Record<string, unknown>,
  snapshot: { id: string; cutoffSeconds: number; decisionAvailableAt: string },
  referenceClock: ReferenceClock,
): boolean {
  const firstClassAligned =
    candidate.featureSnapshotId === snapshot.id &&
    candidate.referenceClock === referenceClock &&
    candidate.cutoffSeconds === snapshot.cutoffSeconds &&
    candidate.decisionAt === snapshot.decisionAvailableAt;
  const legacyAligned =
    candidate.featureSnapshotId === null &&
    (
      evidenceRecord.featureSnapshotId === snapshot.id ||
      (
        evidenceRecord.decisionAt === snapshot.decisionAvailableAt &&
        (candidate.referenceClock === null || candidate.referenceClock === referenceClock) &&
        (candidate.cutoffSeconds === null || candidate.cutoffSeconds === snapshot.cutoffSeconds)
      )
    );
  return firstClassAligned || legacyAligned;
}

/**
 * Loads only persisted, point-in-time-provenanced snapshots. Legacy flat
 * numeric feature JSON is deliberately rejected because its event and
 * availability timestamps cannot be audited.
 */
export async function loadPersistedResearchDataset(options: {
  targetName?: string;
  featureSetVersion?: string;
  horizonSeconds?: number;
  orderSizeUsd?: number;
} = {}): Promise<LoadedResearchDataset> {
  const db = await getDb();
  const [snapshotRows, outcomeRows, assetRows] = await Promise.all([
    db.select().from(featureSnapshots),
    db.select().from(outcomes),
    db.select().from(assets),
  ]);
  const assetsById = new Map(assetRows.map((asset) => [asset.id, asset]));
  const outcomesByAsset = new Map<string, typeof outcomeRows>();
  outcomeRows.forEach((outcome) => {
    if (options.targetName && outcome.labelName !== options.targetName) return;
    if (
      options.horizonSeconds !== undefined &&
      outcome.horizonSeconds !== options.horizonSeconds
    ) {
      return;
    }
    if (
      options.orderSizeUsd !== undefined &&
      outcome.orderSizeUsd !== options.orderSizeUsd
    ) {
      return;
    }
    const current = outcomesByAsset.get(outcome.assetId) ?? [];
    current.push(outcome);
    outcomesByAsset.set(outcome.assetId, current);
  });
  const rejectionReasons: Record<string, number> = {};
  const reject = (reason: string) => {
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
  };
  const examples: PointInTimeExample[] = [];

  for (const snapshot of snapshotRows) {
    if (
      options.featureSetVersion &&
      snapshot.featureSetVersion !== options.featureSetVersion
    ) {
      continue;
    }
    const asset = assetsById.get(snapshot.assetId);
    if (!asset) {
      reject("missing-asset");
      continue;
    }
    const payload = parseJson(snapshot.featureJson) as PersistedFeatureEnvelope | null;
    if (!payload || typeof payload !== "object") {
      reject("invalid-feature-json");
      continue;
    }
    const referenceClock = payload.referenceClock;
    if (referenceClock !== "launch" && referenceClock !== "graduation") {
      reject("missing-reference-clock");
      continue;
    }
    const referenceAt = payload.referenceAt;
    if (typeof referenceAt !== "string") {
      reject("missing-reference-time");
      continue;
    }
    const parsedFeatures = parseFeatures(payload.values);
    if (!parsedFeatures) {
      reject("missing-per-feature-provenance");
      continue;
    }
    const candidateOutcomes = outcomesByAsset.get(snapshot.assetId) ?? [];
    let selected:
      | {
          outcome: (typeof candidateOutcomes)[number];
          evidenceRecord: Record<string, unknown>;
        }
      | undefined;
    for (const candidate of candidateOutcomes) {
      const evidence = parseJson(candidate.evidenceJson);
      const evidenceRecord =
        evidence && typeof evidence === "object" && !Array.isArray(evidence)
          ? (evidence as Record<string, unknown>)
          : {};
      const aligned = persistedOutcomeAlignsSnapshot(
        candidate,
        evidenceRecord,
        snapshot,
        referenceClock,
      );
      if (
        aligned &&
        (candidate.status === "matured" ||
          candidate.status === "complete" ||
          candidate.status === "observed") &&
        (candidate.value === 0 || candidate.value === 1) &&
        typeof candidate.orderSizeUsd === "number" &&
        Number.isFinite(candidate.orderSizeUsd)
      ) {
        selected = { outcome: candidate, evidenceRecord };
        break;
      }
    }
    if (!selected) {
      reject("missing-cutoff-aligned-matured-binary-outcome");
      continue;
    }
    const { outcome, evidenceRecord } = selected;
    examples.push({
      rowId: snapshot.id,
      tokenId: snapshot.assetId,
      referenceClock: referenceClock as ReferenceClock,
      referenceAt,
      cutoffSeconds: snapshot.cutoffSeconds,
      decisionAt: snapshot.decisionAvailableAt,
      featureSetVersion: snapshot.featureSetVersion,
      features: parsedFeatures,
      outcome: {
        name: outcome.labelName,
        version: outcome.labelVersion,
        value: outcome.value as 0 | 1,
        horizonSeconds: outcome.horizonSeconds,
        orderSizeUsd: outcome.orderSizeUsd!,
        labelAvailableAt: outcome.labelAvailableAt,
        status: "matured",
        netReturnPct:
          typeof evidenceRecord.netReturnPct === "number"
            ? evidenceRecord.netReturnPct
            : undefined,
        maximumDrawdownPct:
          typeof evidenceRecord.maximumDrawdownPct === "number"
            ? evidenceRecord.maximumDrawdownPct
            : undefined,
      },
    });
  }

  return {
    examples,
    repository: {
      featureSnapshotCount: snapshotRows.length,
      outcomeCount: outcomeRows.length,
      assetCount: assetRows.length,
      rejectedSnapshotCount: Object.values(rejectionReasons).reduce(
        (sum, count) => sum + count,
        0,
      ),
      rejectionReasons,
    },
  };
}

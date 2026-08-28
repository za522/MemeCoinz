import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assets,
  featureSnapshots,
  modelArtifacts,
  observations,
  predictions,
  sources,
} from "@/db/schema";
import type {
  CoinListItem,
  CoinMarketSnapshot,
  CoinObservation,
  CoinProvenance,
  CoinResearchSummary,
  StorageState,
} from "@/lib/coins/types";
import type { ProviderId } from "@/lib/providers/types";
import type { LaunchCandidate } from "./types";

const SOURCE_ROWS: Record<ProviderId, {
  displayName: string;
  sourceClass: string;
  licenceStatus: string;
}> = {
  "solana-rpc": { displayName: "Solana RPC", sourceClass: "ledger", licenceStatus: "provider-terms-review-required" },
  "pump-onchain": { displayName: "Pump on-chain programs", sourceClass: "launchpad", licenceStatus: "public-ledger" },
  "dex-screener": { displayName: "DEX Screener", sourceClass: "market-data", licenceStatus: "api-terms-review-required" },
  jupiter: { displayName: "Jupiter", sourceClass: "execution", licenceStatus: "api-terms-review-required" },
  helius: { displayName: "Helius", sourceClass: "indexer", licenceStatus: "commercial-contract-required" },
  "solana-tracker": { displayName: "Solana Tracker", sourceClass: "indexer", licenceStatus: "commercial-contract-required" },
  "x-api": { displayName: "X API", sourceClass: "social", licenceStatus: "commercial-contract-required" },
  jito: { displayName: "Jito", sourceClass: "mev", licenceStatus: "provider-terms-review-required" },
  "pump-fun-ui": { displayName: "Pump.fun UI", sourceClass: "reference-interface", licenceStatus: "no-automated-collection" },
  "fomo-family": { displayName: "Fomo.family", sourceClass: "reference-interface", licenceStatus: "no-automated-collection" },
  photon: { displayName: "Photon", sourceClass: "reference-interface", licenceStatus: "no-automated-collection" },
  "memescope-net": { displayName: "memescope.net", sourceClass: "reference-interface", licenceStatus: "no-automated-collection" },
};

function assetId(mint: string): string {
  return `solana:${mint}`;
}

export function storedAssetLaunchProvenance(row: {
  canonicalConfirmed: boolean;
  creationSignature: string | null;
  createdSlot: number | null;
  createdAt: string;
  updatedAt: string;
}): CoinProvenance {
  const retrievedAt = row.updatedAt || row.createdAt;
  const hasCanonicalCreateEvidence =
    row.canonicalConfirmed &&
    Boolean(row.creationSignature) &&
    row.createdSlot !== null;
  if (!hasCanonicalCreateEvidence) {
    return {
      sourceId: "pump-onchain",
      role: "stored-observation",
      fidelity: "indexed",
      eventAt: row.createdAt,
      observedAt: retrievedAt,
      availableAt: retrievedAt,
      retrievedAt,
      ...(row.creationSignature ? { signature: row.creationSignature } : {}),
      ...(row.createdSlot !== null ? { slot: row.createdSlot } : {}),
      missingReason:
        "The persisted asset lacks the complete confirmed creation-signature and slot evidence required to reconstruct a canonical launch clock.",
    };
  }
  const createdAtMs = Date.parse(row.createdAt);
  const availableAt = Number.isFinite(createdAtMs)
    ? new Date(createdAtMs + 2_000).toISOString()
    : retrievedAt;
  return {
    sourceId: "pump-onchain",
    role: "canonical-launch",
    fidelity: "canonical-reconstructed",
    eventAt: row.createdAt,
    observedAt: retrievedAt,
    availableAt,
    retrievedAt,
    signature: row.creationSignature as string,
    slot: row.createdSlot as number,
    missingReason:
      "The canonical creation signature and slot are persisted; historical availability is conservatively reconstructed as block time plus two seconds because original observation latency is not stored on the asset row.",
  };
}

function storageFailure(error: unknown): StorageState {
  const message = error instanceof Error ? error.message : "";
  const bindingUnavailable =
    message.includes("binding `DB` is unavailable") ||
    message.includes("cloudflare:") ||
    message.includes("Cannot find package 'cloudflare:workers'");
  return {
    state: bindingUnavailable ? "unavailable" : "failed",
    reason: bindingUnavailable
      ? "Cloudflare D1 binding DB is unavailable in this runtime; live provider data is still returned."
      : "D1 write/read failed. Live provider data is still returned; no persistence is claimed.",
  };
}

async function ensureSources(sourceIds: ProviderId[]) {
  const db = await getDb();
  const checkedAt = new Date().toISOString();
  for (const sourceId of [...new Set(sourceIds)]) {
    const definition = SOURCE_ROWS[sourceId];
    await db.insert(sources).values({
      id: sourceId,
      displayName: definition.displayName,
      sourceClass: definition.sourceClass,
      licenceStatus: definition.licenceStatus,
      coverageStart: null,
      checkedAt,
      schemaVersion: "coins-v1",
      healthStatus: "observed",
    }).onConflictDoUpdate({
      target: sources.id,
      set: { checkedAt, healthStatus: "observed", schemaVersion: "coins-v1" },
    });
  }
  return db;
}

export async function persistCoinBatch(
  coins: CoinListItem[],
  observationRows: CoinObservation[],
): Promise<StorageState> {
  const persistable = coins.filter((coin) => coin.createdAt !== null);
  if (persistable.length === 0) {
    return {
      state: "read-only",
      reason: "No row had a defensible creation timestamp, so D1 asset writes were skipped.",
      assetsWritten: 0,
      observationsWritten: 0,
    };
  }
  try {
    const sourceIds = observationRows.map((row) => row.sourceId);
    const db = await ensureSources(sourceIds);
    const now = new Date().toISOString();
    const persistedMints = new Set(persistable.map((coin) => coin.mint));
    for (const coin of persistable) {
      await db.insert(assets).values({
        id: assetId(coin.mint),
        chainId: "solana",
        mintAddress: coin.mint,
        venue: coin.lifecycle.venue,
        name: coin.name ?? "Unknown",
        symbol: coin.symbol ?? "?",
        creatorAddress: coin.creator,
        createdAt: coin.createdAt as string,
        createdSlot: coin.createdSlot,
        programVersion: coin.provenance.some((item) => item.role === "canonical-launch")
          ? "official-idl-create"
          : "indexed",
        metadataObjectKey: null,
        metadataUri: coin.metadataUri,
        imageUri: coin.imageUri,
        creationSignature: coin.creationSignature,
        lifecycleStage: coin.lifecycle.stage,
        graduatedAt: coin.lifecycle.graduatedAt,
        poolAddress: coin.lifecycle.poolAddress,
        canonicalConfirmed: coin.canonicalConfirmed,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: assets.id,
        set: {
          venue: sql<string>`case when excluded.venue = 'unknown' then ${assets.venue} else excluded.venue end`,
          name: sql<string>`case when excluded.name = 'Unknown' then ${assets.name} else excluded.name end`,
          symbol: sql<string>`case when excluded.symbol = '?' then ${assets.symbol} else excluded.symbol end`,
          creatorAddress: sql<string | null>`coalesce(excluded.creator_address, ${assets.creatorAddress})`,
          createdSlot: sql<number | null>`coalesce(excluded.created_slot, ${assets.createdSlot})`,
          metadataUri: sql<string | null>`coalesce(excluded.metadata_uri, ${assets.metadataUri})`,
          imageUri: sql<string | null>`coalesce(excluded.image_uri, ${assets.imageUri})`,
          creationSignature: sql<string | null>`coalesce(excluded.creation_signature, ${assets.creationSignature})`,
          lifecycleStage: sql<string>`case when excluded.lifecycle_stage = 'unknown' then ${assets.lifecycleStage} else excluded.lifecycle_stage end`,
          graduatedAt: sql<string | null>`coalesce(excluded.graduated_at, ${assets.graduatedAt})`,
          poolAddress: sql<string | null>`coalesce(excluded.pool_address, ${assets.poolAddress})`,
          canonicalConfirmed: sql<boolean>`max(${assets.canonicalConfirmed}, excluded.canonical_confirmed)`,
          updatedAt: now,
        },
      });
    }

    let observationsWritten = 0;
    for (const row of observationRows) {
      if (!persistedMints.has(row.mint)) continue;
      const inserted = await db.insert(observations).values({
        id: row.id,
        assetId: assetId(row.mint),
        sourceId: row.sourceId,
        observationType: row.observationType,
        eventAt: row.eventAt,
        observedAt: row.observedAt,
        availableAt: row.availableAt,
        retrievedAt: row.retrievedAt,
        slot: row.slot,
        transactionIndex: row.transactionIndex,
        instructionIndex: row.instructionIndex,
        signature: row.signature,
        commitment: row.commitment,
        canonicalStatus: row.canonicalStatus,
        fidelity: row.fidelity,
        rawObjectKey: null,
        normalizedJson: JSON.stringify(row.normalized),
        nullReason: row.nullReason,
      }).onConflictDoNothing({ target: observations.id }).returning({ id: observations.id });
      observationsWritten += inserted.length;
    }
    return {
      state: "written",
      reason: null,
      assetsWritten: persistable.length,
      observationsWritten,
    };
  } catch (error) {
    return storageFailure(error);
  }
}

export async function readStoredCandidates(
  limit = 100,
): Promise<{ candidates: LaunchCandidate[]; storage: StorageState }> {
  try {
    const db = await getDb();
    const rows = await db.select().from(assets)
      .orderBy(desc(assets.createdAt))
      .limit(Math.min(250, Math.max(1, limit)));
    return {
      candidates: rows.map((row) => ({
        mint: row.mintAddress,
        name: row.name === "Unknown" ? null : row.name,
        symbol: row.symbol === "?" ? null : row.symbol,
        metadataUri: row.metadataUri,
        imageUri: row.imageUri,
        creator: row.creatorAddress,
        createdAt: row.createdAt,
        createdSlot: row.createdSlot,
        creationSignature: row.creationSignature,
        programVersion: row.programVersion === "indexed" ? "indexed" : "create",
        venue: row.venue === "pump" || row.venue === "pump-swap" ? row.venue : "unknown",
        stage:
          row.lifecycleStage === "bonding" ||
          row.lifecycleStage === "graduated" ||
          row.lifecycleStage === "pool"
            ? row.lifecycleStage
            : "unknown",
        graduatedAt: row.graduatedAt,
        poolAddress: row.poolAddress,
        canonicalConfirmed: row.canonicalConfirmed,
        provenance: [storedAssetLaunchProvenance(row)],
      })),
      storage: { state: "read-only", reason: null },
    };
  } catch (error) {
    return { candidates: [], storage: storageFailure(error) };
  }
}

export async function readStoredObservations(
  mint: string,
  limit = 250,
): Promise<{ observations: CoinObservation[]; storage: StorageState }> {
  try {
    const db = await getDb();
    const rows = await db.select().from(observations)
      .where(eq(observations.assetId, assetId(mint)))
      .orderBy(desc(observations.eventAt))
      .limit(Math.min(1_000, Math.max(1, limit)));
    return {
      observations: rows.map((row) => {
        let normalized: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(row.normalizedJson);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            normalized = parsed as Record<string, unknown>;
          }
        } catch {
          normalized = {};
        }
        return {
          id: row.id,
          mint,
          sourceId: row.sourceId as ProviderId,
          observationType: row.observationType,
          eventAt: row.eventAt,
          observedAt: row.observedAt,
          availableAt: row.availableAt,
          retrievedAt: row.retrievedAt,
          slot: row.slot,
          transactionIndex: row.transactionIndex,
          instructionIndex: row.instructionIndex,
          commitment: row.commitment,
          canonicalStatus: row.canonicalStatus,
          fidelity: row.fidelity as CoinObservation["fidelity"],
          signature: row.signature,
          normalized,
          nullReason: row.nullReason,
        };
      }),
      storage: { state: "read-only", reason: null },
    };
  } catch (error) {
    return { observations: [], storage: storageFailure(error) };
  }
}

export async function readStoredMarketSnapshots(
  mints: string[],
): Promise<Map<string, CoinMarketSnapshot>> {
  const uniqueMints = [...new Set(mints)].slice(0, 200);
  if (!uniqueMints.length) return new Map();
  try {
    const db = await getDb();
    const ids = uniqueMints.map(assetId);
    const rows = await db.select({
      assetId: observations.assetId,
      observationType: observations.observationType,
      eventAt: observations.eventAt,
      normalizedJson: observations.normalizedJson,
    }).from(observations)
      .where(inArray(observations.assetId, ids))
      .orderBy(desc(observations.eventAt))
      .limit(Math.min(2_000, ids.length * 10));
    const byMint = new Map<string, CoinMarketSnapshot>();
    const initialized = () => ({
      priceUsd: null,
      marketCapUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      buys24h: null,
      sells24h: null,
      priceChange24hPct: null,
      pairAddress: null,
      dexId: null,
      pairCreatedAt: null,
      observedAt: null,
    } satisfies CoinMarketSnapshot);
    const finite = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const string = (value: unknown): string | null => typeof value === "string" ? value : null;
    for (const row of rows) {
      if (!row.assetId) continue;
      const mint = row.assetId.startsWith("solana:") ? row.assetId.slice(7) : row.assetId;
      const current = byMint.get(mint) ?? initialized();
      const value = parsedObject(row.normalizedJson);
      if (row.observationType === "market_snapshot") {
        current.priceUsd ??= finite(value.priceUsd);
        current.marketCapUsd ??= finite(value.marketCapUsd);
        current.liquidityUsd ??= finite(value.liquidityUsd);
        current.volume24hUsd ??= finite(value.volume24hUsd);
        current.buys24h ??= finite(value.buys24h);
        current.sells24h ??= finite(value.sells24h);
        current.priceChange24hPct ??= finite(value.priceChange24hPct);
        current.pairAddress ??= string(value.pairAddress);
        current.dexId ??= string(value.dexId);
        current.pairCreatedAt ??= string(value.pairCreatedAt);
        current.observedAt ??= row.eventAt;
      } else if (row.observationType === "price_snapshot") {
        current.priceUsd ??= finite(value.priceUsd);
        current.priceChange24hPct ??= finite(value.priceChange24hPct);
        current.observedAt ??= row.eventAt;
      }
      byMint.set(mint, current);
    }
    return byMint;
  } catch {
    return new Map();
  }
}

function parsedObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function numericFeature(
  envelope: Record<string, unknown>,
  name: string,
): number | null {
  const values = envelope.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return null;
  const feature = (values as Record<string, unknown>)[name];
  if (!feature || typeof feature !== "object" || Array.isArray(feature)) return null;
  const value = (feature as Record<string, unknown>).value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Return one latest persisted point-in-time summary per mint for the Coins
 * table. Only predictions backed by a `validated` model artifact are exposed;
 * an audited feature row can still appear as `features-only`.
 */
export async function readLatestResearchSummaries(
  mints: string[],
): Promise<Map<string, CoinResearchSummary>> {
  const uniqueMints = [...new Set(mints)].slice(0, 100);
  if (uniqueMints.length === 0) return new Map();
  try {
    const db = await getDb();
    const rows = await db
      .select({
        mint: assets.mintAddress,
        cutoffSeconds: featureSnapshots.cutoffSeconds,
        decisionAt: featureSnapshots.decisionAvailableAt,
        featureSetVersion: featureSnapshots.featureSetVersion,
        featureJson: featureSnapshots.featureJson,
        fidelityJson: featureSnapshots.fidelityJson,
        probability: predictions.probability,
        lowerBound: predictions.lowerBound,
        upperBound: predictions.upperBound,
        modelVersion: predictions.modelVersion,
        modelStatus: modelArtifacts.status,
        predictionWrittenAt: predictions.writtenAt,
      })
      .from(featureSnapshots)
      .innerJoin(assets, eq(featureSnapshots.assetId, assets.id))
      .leftJoin(predictions, eq(predictions.featureSnapshotId, featureSnapshots.id))
      .leftJoin(modelArtifacts, and(
        eq(modelArtifacts.modelVersion, predictions.modelVersion),
        eq(modelArtifacts.status, "validated"),
      ))
      .where(inArray(assets.mintAddress, uniqueMints))
      .orderBy(
        desc(featureSnapshots.decisionAvailableAt),
        desc(predictions.writtenAt),
      );
    const summaries = new Map<string, CoinResearchSummary>();
    for (const row of rows) {
      if (summaries.has(row.mint)) continue;
      const featureEnvelope = parsedObject(row.featureJson);
      const fidelity = parsedObject(row.fidelityJson);
      const referenceClock = featureEnvelope.referenceClock === "graduation"
        ? "graduation"
        : "launch";
      const validatedPrediction = row.modelStatus === "validated" &&
        typeof row.probability === "number";
      const coverage = fidelity.overallCoveragePct;
      summaries.set(row.mint, {
        status: validatedPrediction ? "predicted" : "features-only",
        referenceClock,
        cutoffSeconds: row.cutoffSeconds,
        decisionAt: row.decisionAt,
        probability: validatedPrediction ? row.probability : null,
        lowerBound: validatedPrediction ? row.lowerBound : null,
        upperBound: validatedPrediction ? row.upperBound : null,
        modelVersion: validatedPrediction ? row.modelVersion : null,
        coordinationEvidence0To100: numericFeature(
          featureEnvelope,
          "coordination.coordinationEvidence0To100",
        ),
        grossRoundTripRetentionPct: numericFeature(
          featureEnvelope,
          "execution.100.grossRoundTripRetentionPct",
        ),
        roundTripRetentionPct: numericFeature(
          featureEnvelope,
          "execution.100.roundTripRetentionPct",
        ),
        evidenceCoveragePct:
          typeof coverage === "number" && Number.isFinite(coverage) ? coverage : null,
      });
    }
    return summaries;
  } catch {
    return new Map();
  }
}

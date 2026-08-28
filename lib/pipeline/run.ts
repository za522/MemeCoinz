import { runTelegramShadowAlerts } from "@/lib/alerts";
import type { CoinDetailResponse, CoinListItem, CoinObservation } from "@/lib/coins/types";
import { collectTokenResearchInputs } from "@/lib/collection";
import { FEATURE_CUTOFF_SECONDS, type FeatureCutoffSeconds } from "@/lib/features";
import {
  decodeCoinsCursor,
  getCoinDetail,
  listCoins,
  type ListCoinsOptions,
} from "@/lib/ingestion/service";
import { loadPersistedResearchDataset } from "@/lib/model/repository";
import { trainResearchModel } from "@/lib/model";
import {
  buildCoinResearchResponse,
  loadStoredOutcomesForMint,
  materializeMaturedOutcomes,
  persistFeatureSnapshot,
  persistModelArtifact,
  serveValidatedPrediction,
} from "@/lib/research-pipeline";
import type { TokenCollectionResponse } from "@/lib/collection";
import type { CoinResearchResponse } from "@/lib/research-pipeline";
import type {
  NormalizedResearchPipelineOptions,
  PipelineTrainingSummary,
  ResearchPipelineOptions,
  ResearchPipelineRun,
} from "./types";
import { PIPELINE_LIMITS } from "./types";

const TARGET_NAME = "net-executable-2x-before-minus-50";
const TARGET_VERSION = "v1";

export interface ResearchPipelineDependencies {
  listCoins: typeof listCoins;
  decodeCoinsCursor: typeof decodeCoinsCursor;
  getCoinDetail: typeof getCoinDetail;
  collectTokenResearchInputs: typeof collectTokenResearchInputs;
  loadStoredOutcomesForMint: typeof loadStoredOutcomesForMint;
  buildCoinResearchResponse: typeof buildCoinResearchResponse;
  persistFeatureSnapshot: typeof persistFeatureSnapshot;
  serveValidatedPrediction: typeof serveValidatedPrediction;
  materializeMaturedOutcomes: typeof materializeMaturedOutcomes;
  loadPersistedResearchDataset: typeof loadPersistedResearchDataset;
  trainResearchModel: typeof trainResearchModel;
  persistModelArtifact: typeof persistModelArtifact;
  runTelegramShadowAlerts: typeof runTelegramShadowAlerts;
  now: () => Date;
}

const defaultDependencies: ResearchPipelineDependencies = {
  listCoins,
  decodeCoinsCursor,
  getCoinDetail,
  collectTokenResearchInputs,
  loadStoredOutcomesForMint,
  buildCoinResearchResponse,
  persistFeatureSnapshot,
  serveValidatedPrediction,
  materializeMaturedOutcomes,
  loadPersistedResearchDataset,
  trainResearchModel,
  persistModelArtifact,
  runTelegramShadowAlerts,
  now: () => new Date(),
};

const finiteDate = (value: string): boolean => Number.isFinite(Date.parse(value));

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value as number)));
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value as number));
}

/** Defense-in-depth bounds. The HTTP route also rejects out-of-range input. */
export function normalizeResearchPipelineOptions(
  options: ResearchPipelineOptions = {},
  now = new Date(),
): NormalizedResearchPipelineOptions {
  const rawSizes = Array.isArray(options.orderSizesUsd) && options.orderSizesUsd.length
    ? options.orderSizesUsd
    : [25, 100, 500];
  const orderSizesUsd = [...new Set(rawSizes
    .filter((value) => Number.isFinite(value))
    .map((value) => boundedNumber(value, 100, 1, PIPELINE_LIMITS.maxOrderSizeUsd)))]
    .slice(0, PIPELINE_LIMITS.maxOrderSizes);
  const requestedEvaluationMs = options.evaluatedAt && finiteDate(options.evaluatedAt)
    ? Date.parse(options.evaluatedAt)
    : now.getTime();
  const evaluatedAt = new Date(Math.min(requestedEvaluationMs, now.getTime())).toISOString();
  return {
    maxCoins: boundedInteger(options.maxCoins, 5, 1, PIPELINE_LIMITS.maxCoins),
    maxDiscoveryPages: boundedInteger(
      options.maxDiscoveryPages,
      1,
      1,
      PIPELINE_LIMITS.maxDiscoveryPages,
    ),
    discoverySource: options.discoverySource === "rpc" || options.discoverySource === "tracker"
      ? options.discoverySource
      : "auto",
    historyLimit: boundedInteger(
      options.historyLimit,
      200,
      1,
      PIPELINE_LIMITS.maxHistoryTransactions,
    ),
    collectAdvanced: options.collectAdvanced !== false,
    allowMetered: options.allowMetered === true,
    collectionMaxPages: boundedInteger(
      options.collectionMaxPages,
      1,
      1,
      PIPELINE_LIMITS.maxCollectionPages,
    ),
    collectionWindowHours: boundedNumber(
      options.collectionWindowHours,
      24,
      1,
      PIPELINE_LIMITS.maxCollectionWindowHours,
    ),
    orderSizesUsd: orderSizesUsd.length ? orderSizesUsd : [100],
    slippageBps: boundedInteger(options.slippageBps, 100, 1, 1_000),
    horizonSeconds: boundedInteger(options.horizonSeconds, 86_400, 1, 31 * 86_400),
    orderSizeUsd: boundedNumber(
      options.orderSizeUsd,
      100,
      1,
      PIPELINE_LIMITS.maxOrderSizeUsd,
    ),
    maxOutcomeSnapshots: boundedInteger(
      options.maxOutcomeSnapshots,
      Math.min(PIPELINE_LIMITS.maxOutcomeSnapshots, 5 * 2 * 5),
      1,
      PIPELINE_LIMITS.maxOutcomeSnapshots,
    ),
    runTelegramAlerts: options.runTelegramAlerts === true,
    telegramDryRun: options.telegramDryRun !== false,
    telegramLimit: boundedInteger(
      options.telegramLimit,
      10,
      1,
      PIPELINE_LIMITS.maxTelegramAlerts,
    ),
    evaluatedAt,
  };
}

function officialUrls(detail: CoinDetailResponse): string[] {
  const values = detail.observations.flatMap((observation) => {
    const websites = observation.normalized.websites;
    return Array.isArray(websites) ? websites : [];
  });
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length > 500) continue;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") continue;
      const normalized = parsed.toString();
      if (!result.includes(normalized)) result.push(normalized);
    } catch {
      // Unparseable provider metadata is not promoted into an exact identity.
    }
    if (result.length === 4) break;
  }
  return result;
}

function mergeObservations(
  detail: CoinDetailResponse,
  additional: readonly CoinObservation[],
): CoinDetailResponse {
  const rows = new Map<string, CoinObservation>();
  for (const observation of [...detail.observations, ...additional]) {
    rows.set(observation.id, observation);
  }
  return {
    ...detail,
    observations: [...rows.values()].sort((left, right) =>
      right.eventAt.localeCompare(left.eventAt)
    ),
  };
}

function canonicalTimestamped(detail: CoinDetailResponse): boolean {
  return Boolean(
    detail.coin.canonicalConfirmed &&
      detail.coin.createdAt &&
      finiteDate(detail.coin.createdAt),
  );
}

function collectionWindow(
  coin: CoinListItem,
  options: NormalizedResearchPipelineOptions,
): { from: string; to: string } | null {
  const toMs = Date.parse(options.evaluatedAt);
  const launchMs = Date.parse(coin.createdAt ?? "");
  if (!Number.isFinite(toMs) || !Number.isFinite(launchMs) || launchMs >= toMs) return null;
  const floorMs = toMs - options.collectionWindowHours * 60 * 60 * 1_000;
  return {
    from: new Date(Math.max(launchMs, floorMs)).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}

function addProviderStates(
  target: ResearchPipelineRun["collection"]["providerStates"],
  response: TokenCollectionResponse,
): void {
  for (const [providerId, provider] of Object.entries(response.providers)) {
    const current = target[providerId] ?? {};
    current[provider.state] = (current[provider.state] ?? 0) + 1;
    target[providerId] = current;
  }
}

function addWarning(warnings: string[], warning: string | null | undefined): void {
  if (warning && !warnings.includes(warning)) warnings.push(warning);
}

function featureReferenceAt(
  detail: CoinDetailResponse,
  clock: "launch" | "graduation",
): string | null {
  return clock === "launch" ? detail.coin.createdAt : detail.coin.lifecycle.graduatedAt;
}

function elapsed(referenceAt: string | null, cutoff: FeatureCutoffSeconds, now: string): boolean {
  const referenceMs = Date.parse(referenceAt ?? "");
  const nowMs = Date.parse(now);
  return Number.isFinite(referenceMs) && Number.isFinite(nowMs) &&
    referenceMs + cutoff * 1_000 <= nowMs;
}

async function discoverCoins(
  options: NormalizedResearchPipelineOptions,
  dependencies: ResearchPipelineDependencies,
  warnings: string[],
): Promise<{
  coins: CoinListItem[];
  pagesRequested: number;
  pagesCompleted: number;
  storage: ResearchPipelineRun["discovery"]["storage"];
}> {
  const byMint = new Map<string, CoinListItem>();
  const storage: ResearchPipelineRun["discovery"]["storage"] = [];
  let cursor: ListCoinsOptions["cursor"] = {};
  let pagesRequested = 0;
  let pagesCompleted = 0;
  for (let page = 0; page < options.maxDiscoveryPages && byMint.size < options.maxCoins; page += 1) {
    pagesRequested += 1;
    try {
      const response = await dependencies.listCoins({
        limit: options.maxCoins - byMint.size,
        cursor,
        source: options.discoverySource,
        enrich: true,
      });
      pagesCompleted += 1;
      response.coins.forEach((coin) => byMint.set(coin.mint, coin));
      storage.push(response.ingestion.storage);
      response.ingestion.warnings.forEach((warning) => addWarning(warnings, warning));
      if (!response.pagination.hasMore || !response.pagination.nextCursor) break;
      const nextCursor = dependencies.decodeCoinsCursor(response.pagination.nextCursor);
      if (!nextCursor) {
        addWarning(warnings, "Discovery returned an invalid continuation cursor; paging stopped.");
        break;
      }
      cursor = nextCursor;
    } catch (error) {
      addWarning(
        warnings,
        error instanceof Error
          ? `Coin discovery page ${page + 1} failed: ${error.message}`
          : `Coin discovery page ${page + 1} failed.`,
      );
      break;
    }
  }
  return {
    coins: [...byMint.values()].slice(0, options.maxCoins),
    pagesRequested,
    pagesCompleted,
    storage,
  };
}

async function trainClockCandidates(
  options: NormalizedResearchPipelineOptions,
  dependencies: ResearchPipelineDependencies,
  warnings: string[],
): Promise<PipelineTrainingSummary[]> {
  let dataset: Awaited<ReturnType<typeof loadPersistedResearchDataset>>;
  try {
    dataset = await dependencies.loadPersistedResearchDataset({
      targetName: TARGET_NAME,
      horizonSeconds: options.horizonSeconds,
      orderSizeUsd: options.orderSizeUsd,
    });
  } catch (error) {
    const reason = error instanceof Error
      ? `Candidate training dataset is unavailable: ${error.message}`
      : "Candidate training dataset is unavailable.";
    addWarning(warnings, reason);
    return (["launch", "graduation"] as const).map((referenceClock) => ({
      referenceClock,
      examples: 0,
      tokens: 0,
      status: "failed",
      modelVersion: null,
      reason,
      persistence: null,
    }));
  }

  const summaries: PipelineTrainingSummary[] = [];
  for (const referenceClock of ["launch", "graduation"] as const) {
    const examples = dataset.examples.filter((example) =>
      example.referenceClock === referenceClock
    );
    const tokens = new Set(examples.map((example) => example.tokenId)).size;
    try {
      const result = dependencies.trainResearchModel(examples, {
        datasetAsOf: options.evaluatedAt,
        createdAt: options.evaluatedAt,
      });
      if (result.status !== "trained") {
        summaries.push({
          referenceClock,
          examples: result.acceptedExamples,
          tokens: result.tokenCount,
          status: "insufficient-data",
          modelVersion: null,
          reason: result.reason,
          persistence: null,
        });
        continue;
      }
      // Candidate is deliberately hard-coded: a pipeline run can never validate/promote.
      const persistence = await dependencies.persistModelArtifact(result.artifact, "candidate");
      if (persistence.reason) addWarning(warnings, persistence.reason);
      summaries.push({
        referenceClock,
        examples: examples.length,
        tokens,
        status: persistence.state === "written"
          ? "candidate-written"
          : "candidate-not-written",
        modelVersion: result.artifact.modelVersion,
        reason: persistence.reason,
        persistence,
      });
    } catch (error) {
      const reason = error instanceof Error
        ? `${referenceClock} candidate training failed: ${error.message}`
        : `${referenceClock} candidate training failed.`;
      addWarning(warnings, reason);
      summaries.push({
        referenceClock,
        examples: examples.length,
        tokens,
        status: "failed",
        modelVersion: null,
        reason,
        persistence: null,
      });
    }
  }
  return summaries;
}

/**
 * Run one bounded research maintenance cycle. It writes observations, audited
 * feature snapshots, validated-artifact shadow predictions, mature executable
 * labels, and candidate model artifacts. It never builds or submits a trade.
 */
export async function runResearchPipeline(
  rawOptions: ResearchPipelineOptions = {},
  dependencyOverrides: Partial<ResearchPipelineDependencies> = {},
): Promise<ResearchPipelineRun> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const startedAt = dependencies.now().toISOString();
  const options = normalizeResearchPipelineOptions(rawOptions, new Date(startedAt));
  const warnings: string[] = [];
  const discovery = await discoverCoins(options, dependencies, warnings);
  const collection: ResearchPipelineRun["collection"] = {
    enabled: options.collectAdvanced,
    meteredRequested: options.allowMetered,
    eligibleCoins: 0,
    attemptedCoins: 0,
    observationsCollected: 0,
    observationsPersisted: 0,
    providerStates: {},
    skippedCoins: 0,
    failedCoins: 0,
  };
  const snapshots: ResearchPipelineRun["snapshots"] = {
    elapsedComputed: 0,
    written: 0,
    notWritten: 0,
    byClock: { launch: 0, graduation: 0 },
    byCutoff: Object.fromEntries(FEATURE_CUTOFF_SECONDS.map((value) => [String(value), 0])),
  };
  const predictions: ResearchPipelineRun["predictions"] = {
    attempted: 0,
    validatedServed: 0,
    shadowWritten: 0,
    shadowNotWritten: 0,
    untrained: 0,
    insufficientData: 0,
  };
  let detailLoaded = 0;
  let canonicalCount = 0;
  let coinFailures = 0;

  for (const discoveredCoin of discovery.coins) {
    try {
      // Exactly one detail load is used; collected observations are merged in memory.
      let detail = await dependencies.getCoinDetail(discoveredCoin.mint, {
        historyLimit: options.historyLimit,
        persist: true,
      });
      detailLoaded += 1;
      const isEligible = canonicalTimestamped(detail);
      if (isEligible) canonicalCount += 1;

      if (options.collectAdvanced && isEligible) {
        const window = collectionWindow(detail.coin, options);
        if (!window) {
          collection.skippedCoins += 1;
          addWarning(warnings, `${detail.coin.mint}: no valid bounded collection window exists.`);
        } else {
          collection.eligibleCoins += 1;
          collection.attemptedCoins += 1;
          try {
            const collected = await dependencies.collectTokenResearchInputs(detail.coin.mint, {
              ...window,
              maxPages: options.collectionMaxPages,
              orderSizesUsd: options.orderSizesUsd,
              slippageBps: options.slippageBps,
              identity: {
                fullName: detail.coin.name,
                officialUrls: officialUrls(detail),
              },
              allowMetered: options.allowMetered,
              persistCoin: detail.coin,
            });
            collection.observationsCollected += collected.coinObservations.length;
            collection.observationsPersisted += collected.persistence.observationsWritten ?? 0;
            addProviderStates(collection.providerStates, collected);
            collected.warnings.forEach((warning) => addWarning(warnings, warning));
            if (collected.persistence.reason) addWarning(warnings, collected.persistence.reason);
            detail = mergeObservations(detail, collected.coinObservations);
          } catch (error) {
            collection.failedCoins += 1;
            addWarning(
              warnings,
              error instanceof Error
                ? `${detail.coin.mint}: advanced collection failed: ${error.message}`
                : `${detail.coin.mint}: advanced collection failed.`,
            );
          }
        }
      } else if (options.collectAdvanced) {
        collection.skippedCoins += 1;
      }

      const stored = await dependencies.loadStoredOutcomesForMint(detail.coin.mint);
      if (stored.storageWarning) addWarning(warnings, stored.storageWarning);
      for (const referenceClock of ["launch", "graduation"] as const) {
        const referenceAt = featureReferenceAt(detail, referenceClock);
        for (const cutoffSeconds of FEATURE_CUTOFF_SECONDS) {
          if (!elapsed(referenceAt, cutoffSeconds, options.evaluatedAt)) continue;
          let response: CoinResearchResponse;
          try {
            response = dependencies.buildCoinResearchResponse(detail, {
              referenceClock,
              cutoffSeconds,
              evaluatedAt: options.evaluatedAt,
              orderSizeUsd: options.orderSizeUsd,
              horizonSeconds: options.horizonSeconds,
              storedOutcomes: stored.outcomes,
            });
          } catch (error) {
            snapshots.notWritten += 1;
            addWarning(
              warnings,
              error instanceof Error
                ? `${detail.coin.mint} ${referenceClock}/${cutoffSeconds}s feature computation failed: ${error.message}`
                : `${detail.coin.mint} ${referenceClock}/${cutoffSeconds}s feature computation failed.`,
            );
            continue;
          }
          snapshots.elapsedComputed += 1;
          snapshots.byClock[referenceClock] += 1;
          snapshots.byCutoff[String(cutoffSeconds)] += 1;
          const featureStorage = await dependencies.persistFeatureSnapshot(response);
          if (featureStorage.snapshotWritten) snapshots.written += 1;
          else snapshots.notWritten += 1;
          if (featureStorage.reason) addWarning(warnings, featureStorage.reason);

          predictions.attempted += 1;
          const served = await dependencies.serveValidatedPrediction(response, {
            targetName: TARGET_NAME,
            targetVersion: TARGET_VERSION,
            horizonSeconds: options.horizonSeconds,
            orderSizeUsd: options.orderSizeUsd,
          });
          served.caveats.forEach((warning) => addWarning(warnings, warning));
          if (served.prediction.status === "predicted") {
            predictions.validatedServed += 1;
            if (served.prediction.persistence.state === "written") predictions.shadowWritten += 1;
            else predictions.shadowNotWritten += 1;
          } else if (served.prediction.status === "untrained") {
            predictions.untrained += 1;
          } else {
            predictions.insufficientData += 1;
          }
        }
      }
    } catch (error) {
      coinFailures += 1;
      addWarning(
        warnings,
        error instanceof Error
          ? `${discoveredCoin.mint}: detail/research processing failed: ${error.message}`
          : `${discoveredCoin.mint}: detail/research processing failed.`,
      );
    }
  }

  const outcomeResult = await dependencies.materializeMaturedOutcomes({
    maxSnapshots: options.maxOutcomeSnapshots,
    horizonSeconds: options.horizonSeconds,
    orderSizeUsd: options.orderSizeUsd,
    dryRun: false,
    labelAsOf: options.evaluatedAt,
  });
  if (outcomeResult.storage.reason) addWarning(warnings, outcomeResult.storage.reason);

  const training = await trainClockCandidates(options, dependencies, warnings);

  let alertResult: Awaited<ReturnType<typeof runTelegramShadowAlerts>> | null = null;
  if (options.runTelegramAlerts) {
    alertResult = await dependencies.runTelegramShadowAlerts({
      dryRun: options.telegramDryRun,
      limit: options.telegramLimit,
    });
    if (alertResult.reason) addWarning(warnings, alertResult.reason);
  }

  const completedAt = dependencies.now().toISOString();
  const fatal = discovery.coins.length === 0 &&
    outcomeResult.storage.state !== "written" &&
    training.every((result) => result.status === "failed");
  const partial = warnings.length > 0 || coinFailures > 0 ||
    discovery.coins.length === 0 ||
    discovery.pagesCompleted < discovery.pagesRequested ||
    snapshots.notWritten > 0 ||
    outcomeResult.storage.state !== "written" ||
    outcomeResult.missingPath > 0 ||
    outcomeResult.invalid > 0;
  return {
    schemaVersion: "memetrace-research-pipeline/v1",
    status: fatal ? "failed" : partial ? "partial" : "complete",
    startedAt,
    completedAt,
    request: options,
    discovery: {
      pagesRequested: discovery.pagesRequested,
      pagesCompleted: discovery.pagesCompleted,
      coinsDiscovered: discovery.coins.length,
      coinsSelected: discovery.coins.length,
      storage: discovery.storage,
    },
    coins: {
      attempted: discovery.coins.length,
      detailLoaded,
      canonicalTimestamped: canonicalCount,
      failed: coinFailures,
    },
    collection,
    snapshots,
    predictions,
    outcomes: {
      scannedSnapshots: outcomeResult.scannedSnapshots,
      available: outcomeResult.available,
      written: outcomeResult.outcomesWritten,
      pending: outcomeResult.pending,
      unavailable: outcomeResult.unavailable,
      invalid: outcomeResult.invalid,
      missingPath: outcomeResult.missingPath,
      storageState: outcomeResult.storage.state,
    },
    training,
    alerts: {
      attempted: options.runTelegramAlerts,
      result: alertResult,
    },
    warnings,
    safety: {
      automaticTrading: false,
      transactionSubmission: false,
      candidateAutoPromotion: false,
      schedulerInstalled: false,
    },
  };
}

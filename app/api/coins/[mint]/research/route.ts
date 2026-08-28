import { FEATURE_CUTOFF_SECONDS, type FeatureCutoffSeconds } from "@/lib/features";
import { collectTokenResearchInputs, type TokenCollectionResponse } from "@/lib/collection";
import type { CoinDetailResponse, CoinObservation } from "@/lib/coins/types";
import { getCoinDetail } from "@/lib/ingestion/service";
import type { ReferenceClock } from "@/lib/model";
import {
  buildCoinResearchResponse,
  buildMissingReferenceResponse,
  loadStoredOutcomesForMint,
  persistFeatureSnapshot,
  serveValidatedPrediction,
  type ResearchCollectionEvidence,
} from "@/lib/research-pipeline";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Data": "real-point-in-time-only",
  "X-Automatic-Trading": "disabled",
};

const base58Mint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface RouteContext {
  params: Promise<{ mint: string }> | { mint: string };
}

function positiveNumber(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function officialUrls(detail: CoinDetailResponse): string[] {
  const candidates = detail.observations.flatMap((observation) => {
    const value = observation.normalized.websites;
    return Array.isArray(value) ? value : [];
  });
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length > 500) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:") continue;
      if (!urls.includes(parsed.toString())) urls.push(parsed.toString());
    } catch {
      // Invalid provider URLs are not used as exact social identities.
    }
    if (urls.length === 4) break;
  }
  return urls;
}

function mergeObservations(
  detail: CoinDetailResponse,
  additional: readonly CoinObservation[],
  storage: CoinDetailResponse["storage"],
): CoinDetailResponse {
  const byId = new Map<string, CoinObservation>();
  for (const observation of [...detail.observations, ...additional]) {
    byId.set(observation.id, observation);
  }
  return {
    ...detail,
    storage,
    observations: [...byId.values()].sort((left, right) =>
      right.eventAt.localeCompare(left.eventAt)
    ),
  };
}

function collectionEvidence(
  result: TokenCollectionResponse,
): ResearchCollectionEvidence {
  const providers = Object.fromEntries(
    Object.entries(result.providers).map(([providerId, provider]) => [providerId, {
      state: provider.state,
      metered: provider.metered,
      configured: provider.configured,
      itemsCollected: provider.itemsCollected,
      errorCode: provider.errorCode,
    }]),
  ) as ResearchCollectionEvidence["providers"];
  return {
    mode: "safe-current-only",
    attempted: true,
    meteredProvidersAllowed: false,
    providers,
    persistence: result.persistence,
    warnings: result.warnings,
  };
}

function failedCollectionEvidence(error: unknown): ResearchCollectionEvidence {
  const reason = error instanceof Error
    ? `Safe current collection failed: ${error.message}`
    : "Safe current collection failed before provider statuses were returned.";
  return {
    mode: "safe-current-only",
    attempted: true,
    meteredProvidersAllowed: false,
    providers: {},
    persistence: { state: "failed", reason },
    warnings: [reason],
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { mint: rawMint } = await context.params;
  const mint = rawMint.trim();
  const url = new URL(request.url);
  const referenceClock = (url.searchParams.get("referenceClock") ?? "launch") as
    ReferenceClock;
  const cutoffNumber = Number(url.searchParams.get("cutoffSeconds") ?? 300);
  const orderSizeUsd = positiveNumber(url.searchParams.get("orderSizeUsd"), 100);
  const horizonSeconds = positiveNumber(url.searchParams.get("horizonSeconds"), 86_400);

  if (!base58Mint.test(mint)) {
    return Response.json(
      {
        status: "invalid_request",
        reason: "mint must be a 32–44 character Solana base58 address.",
      },
      { status: 400, headers: responseHeaders },
    );
  }
  if (referenceClock !== "launch" && referenceClock !== "graduation") {
    return Response.json(
      {
        status: "invalid_request",
        reason: "referenceClock must be launch or graduation.",
      },
      { status: 400, headers: responseHeaders },
    );
  }
  if (!FEATURE_CUTOFF_SECONDS.includes(cutoffNumber as FeatureCutoffSeconds)) {
    return Response.json(
      {
        status: "invalid_request",
        reason: "cutoffSeconds must be one of the supported point-in-time cutoffs.",
        validCutoffSeconds: FEATURE_CUTOFF_SECONDS,
      },
      { status: 400, headers: responseHeaders },
    );
  }
  if (orderSizeUsd === null || horizonSeconds === null || !Number.isInteger(horizonSeconds)) {
    return Response.json(
      {
        status: "invalid_request",
        reason: "orderSizeUsd must be positive and horizonSeconds must be a positive integer.",
      },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const initialDetail = await getCoinDetail(mint, { historyLimit: 200, persist: true });
    const storedPromise = loadStoredOutcomesForMint(mint);
    const collectedObservations: CoinObservation[] = [];
    let collection: ResearchCollectionEvidence;
    let refreshWarning: string | null = null;
    const safeCollectionTo = new Date().toISOString();
    const safeCollectionFrom = new Date(
      Date.parse(safeCollectionTo) - 60 * 60 * 1_000,
    ).toISOString();
    try {
      const result = await collectTokenResearchInputs(mint, {
        from: safeCollectionFrom,
        to: safeCollectionTo,
        maxPages: 1,
        orderSizesUsd: [orderSizeUsd],
        identity: {
          fullName: initialDetail.coin.name,
          officialUrls: officialUrls(initialDetail),
        },
        allowMetered: false,
        persistCoin: initialDetail.coin,
      });
      collectedObservations.push(...result.coinObservations);
      collection = collectionEvidence(result);
    } catch (error) {
      collection = failedCollectionEvidence(error);
    }
    let detail = initialDetail;
    try {
      const refreshed = await getCoinDetail(mint, { historyLimit: 200, persist: false });
      detail = mergeObservations(refreshed, collectedObservations, initialDetail.storage);
    } catch (error) {
      detail = mergeObservations(initialDetail, collectedObservations, initialDetail.storage);
      refreshWarning = error instanceof Error
        ? `Stored-observation refresh failed; the initial detail plus returned safe observations were used: ${error.message}`
        : "Stored-observation refresh failed; the initial detail plus returned safe observations were used.";
    }
    const stored = await storedPromise;
    const options = {
      referenceClock,
      cutoffSeconds: cutoffNumber as FeatureCutoffSeconds,
      orderSizeUsd,
      horizonSeconds,
      storedOutcomes: stored.outcomes,
    };
    const referenceAt = referenceClock === "graduation"
      ? detail.coin.lifecycle.graduatedAt
      : detail.coin.createdAt;
    const response = referenceAt
      ? buildCoinResearchResponse(detail, options)
      : buildMissingReferenceResponse(
          detail,
          options,
          referenceClock === "graduation"
            ? "A timestamped graduation event is unavailable for this coin."
            : "A timestamped launch event is unavailable for this coin.",
        );
    response.evidence.collection = collection;
    response.evidence.featureStorage = await persistFeatureSnapshot(response);
    const servedPrediction = await serveValidatedPrediction(response, {
      targetName: "net-executable-2x-before-minus-50",
      targetVersion: "v1",
      horizonSeconds,
      orderSizeUsd,
    });
    response.prediction = servedPrediction.prediction;
    response.caveats.push(...servedPrediction.caveats);
    if (stored.storageWarning) {
      response.caveats.push(stored.storageWarning);
    }
    if (response.evidence.featureStorage.reason) {
      response.caveats.push(response.evidence.featureStorage.reason);
    }
    if (refreshWarning) response.caveats.push(refreshWarning);
    return Response.json(response, { status: 200, headers: responseHeaders });
  } catch (error) {
    const reason = error instanceof Error
      ? error.message
      : "Live coin detail and stored observation retrieval failed.";
    return Response.json(
      {
        schemaVersion: "memetrace-coin-research/v1",
        generatedAt: new Date().toISOString(),
        status: "insufficient_data",
        coin: null,
        decision: {
          referenceClock,
          referenceAt: null,
          referenceAvailableAt: null,
          referenceCanonical: false,
          cutoffSeconds: cutoffNumber,
          decisionAt: null,
          evaluatedAt: new Date().toISOString(),
          cutoffElapsed: false,
          leakageRule: "No point-in-time row was created because real coin retrieval failed.",
        },
        features: null,
        modelInput: null,
        evidence: {
          historyCoverage: null,
          storage: { state: "failed", reason },
          collection: {
            mode: "not-run",
            attempted: false,
            meteredProvidersAllowed: false,
            providers: {},
            persistence: {
              state: "read-only",
              reason: "Collection did not run because the initial real coin load failed.",
            },
            warnings: [],
          },
          featureStorage: {
            state: "read-only",
            reason: "No real coin row existed to persist a feature snapshot.",
            snapshotWritten: false,
          },
          mapping: {
            inputObservationCount: 0,
            eligibleObservationCount: 0,
            excludedFutureEventCount: 0,
            excludedFutureAvailabilityCount: 0,
            excludedInvalidTimestampCount: 0,
            excludedNonCanonicalCount: 0,
            mappedCounts: {
              market: 0,
              trades: 0,
              transfers: 0,
              coordinationProxies: 0,
              holders: 0,
              creators: 0,
              quotes: 0,
              socialPosts: 0,
              socialCounts: 0,
              paidAttention: 0,
              regimes: 0,
            },
            unmappedByType: {},
            notes: ["No observation mapping ran because the initial real coin load failed."],
          },
          sourceIds: [],
          overallCoveragePct: 0,
          missingFieldCount: 0,
        },
        outcome: {
          status: "unavailable",
          labelAvailableAt: new Date().toISOString(),
          target: {
            name: "net-executable-2x-before-minus-50",
            version: "v1",
            horizonSeconds,
            orderSizeUsd,
          },
          value: null,
          maximumNetReturnPct: null,
          maximumDrawdownPct: null,
          reason: "No real coin history was available to evaluate an outcome.",
          source: "not-observed",
        },
        prediction: {
          status: "insufficient_data",
          reason: "No real point-in-time feature row could be built.",
          missingPrerequisites: [reason],
        },
        missingPrerequisites: [reason],
        caveats: [
          "No current response was backdated and no synthetic score was substituted.",
        ],
      },
      { status: 200, headers: responseHeaders },
    );
  }
}

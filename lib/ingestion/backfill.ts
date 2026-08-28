import type {
  BackfillResponse,
  CoinsCursor,
} from "@/lib/coins/types";
import { discoverFromRpc, mergeLaunchCandidates } from "./discovery";
import { collectCoinHistory } from "./history";
import {
  candidateWithoutEnrichment,
  launchObservations,
} from "./service";
import { persistCoinBatch } from "./storage";
import type { LaunchCandidate } from "./types";

export interface BackfillOptions {
  before?: string;
  until?: string;
  maxPages?: number;
  signaturesPerPage?: number;
  maxAssets?: number;
  historyPerAsset?: number;
  maxHistoryAssets?: number;
  dryRun?: boolean;
}

export async function runBoundedArchiveBackfill(
  options: BackfillOptions = {},
): Promise<BackfillResponse> {
  const startedAt = new Date().toISOString();
  const maxPages = Math.min(20, Math.max(1, options.maxPages ?? 3));
  const signaturesPerPage = Math.min(500, Math.max(20, options.signaturesPerPage ?? 150));
  const maxAssets = Math.min(1_000, Math.max(1, options.maxAssets ?? 100));
  const historyPerAsset = Math.min(200, Math.max(0, options.historyPerAsset ?? 0));
  const maxHistoryAssets = Math.min(25, Math.max(0, options.maxHistoryAssets ?? 10));
  let cursor: CoinsCursor = {
    ...(options.before ? { rpcBefore: options.before, pumpSwapBefore: options.before } : {}),
  };
  const allCandidates: LaunchCandidate[] = [];
  const coverage: BackfillResponse["coverage"] = [];
  const warnings: string[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const result = await discoverFromRpc({
      mode: "archive",
      cursor,
      until: options.until,
      signatureLimit: signaturesPerPage,
    });
    allCandidates.push(...result.candidates);
    coverage.push(...result.coverage);
    warnings.push(...result.warnings);
    const merged = mergeLaunchCandidates(allCandidates);
    const next = result.nextCursor;
    const progressed =
      next.rpcBefore !== cursor.rpcBefore ||
      next.pumpSwapBefore !== cursor.pumpSwapBefore;
    cursor = next;
    if (merged.length >= maxAssets || !progressed || Object.keys(next).length === 0) {
      break;
    }
  }

  const candidates = mergeLaunchCandidates(allCandidates).slice(0, maxAssets);
  const observations = launchObservations(candidates);
  if (historyPerAsset > 0) {
    const historyCandidates = candidates.slice(0, maxHistoryAssets);
    for (const candidate of historyCandidates) {
      const history = await collectCoinHistory(candidate.mint, historyPerAsset, "archive");
      observations.push(...history.observations);
      warnings.push(...history.coverage.missingReasons.map((reason) =>
        `${candidate.mint}: ${reason}`,
      ));
    }
  }
  const coins = candidates.map(candidateWithoutEnrichment);
  const storage = options.dryRun
    ? {
        state: "read-only" as const,
        reason: "Dry run: archive data was fetched and decoded but not written.",
        assetsWritten: 0,
        observationsWritten: 0,
      }
    : await persistCoinBatch(coins, observations);
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    request: {
      before: options.before ?? null,
      until: options.until ?? null,
      maxPages,
      signaturesPerPage,
      maxAssets,
      historyPerAsset,
      maxHistoryAssets,
      dryRun: options.dryRun ?? false,
    },
    assetsDiscovered: candidates.length,
    observationsDiscovered: observations.length,
    nextBefore: cursor.rpcBefore ?? cursor.pumpSwapBefore ?? null,
    coverage,
    storage,
    warnings: [...new Set(warnings)],
  };
}

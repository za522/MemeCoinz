import type {
  CoinDetailResponse,
  CoinListItem,
  CoinObservation,
  CoinsCursor,
  CoinsListResponse,
} from "@/lib/coins/types";
import { discoverFromDexProfiles, discoverFromRpc, discoverFromSolanaTracker, mergeLaunchCandidates } from "./discovery";
import { collectCoinHistory } from "./history";
import { enrichCandidates } from "./market";
import {
  persistCoinBatch,
  readLatestResearchSummaries,
  readStoredCandidates,
  readStoredMarketSnapshots,
  readStoredObservations,
} from "./storage";
import type { LaunchCandidate } from "./types";

export interface ListCoinsOptions {
  limit?: number;
  cursor?: CoinsCursor;
  source?: "auto" | "rpc" | "tracker";
  status?: "all" | "bonding" | "graduated";
  enrich?: boolean;
  minLiquidityUsd?: number;
  minVolume24hUsd?: number;
  query?: string;
}

export function launchObservations(candidates: LaunchCandidate[]): CoinObservation[] {
  return candidates.flatMap((candidate) => candidate.provenance.flatMap((provenance) => {
    if (
      provenance.role !== "canonical-launch" &&
      provenance.role !== "canonical-graduation" &&
      provenance.role !== "accelerated-discovery"
    ) return [];
    const eventAt = provenance.eventAt ?? candidate.createdAt;
    if (!eventAt) return [];
    return [{
      id: `${candidate.mint}:${provenance.role}:${provenance.signature ?? eventAt}`,
      mint: candidate.mint,
      sourceId: provenance.sourceId,
      observationType:
        provenance.role === "canonical-graduation"
          ? "pump_graduation"
          : "pump_launch",
      eventAt,
      observedAt: provenance.observedAt,
      availableAt: provenance.availableAt,
      retrievedAt: provenance.retrievedAt,
      slot: provenance.slot ?? null,
      transactionIndex: null,
      instructionIndex: null,
      commitment: provenance.fidelity.startsWith("canonical") ? "confirmed" : null,
      canonicalStatus: candidate.canonicalConfirmed ? "confirmed" : "vendor-indexed",
      fidelity: provenance.fidelity,
      signature: provenance.signature ?? null,
      normalized: {
        name: candidate.name,
        symbol: candidate.symbol,
        metadataUri: candidate.metadataUri,
        imageUri: candidate.imageUri,
        creator: candidate.creator,
        programVersion: candidate.programVersion,
        venue: candidate.venue,
        stage: candidate.stage,
        poolAddress: candidate.poolAddress,
      },
      nullReason: provenance.missingReason ?? null,
    }];
  }));
}

function emptyMarket(): CoinListItem["market"] {
  return {
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
  };
}

export function mergeStoredMarket(
  current: CoinListItem["market"],
  stored: CoinListItem["market"] | undefined,
): CoinListItem["market"] {
  if (!stored) return current;
  return {
    priceUsd: current.priceUsd ?? stored.priceUsd,
    marketCapUsd: current.marketCapUsd ?? stored.marketCapUsd,
    liquidityUsd: current.liquidityUsd ?? stored.liquidityUsd,
    volume24hUsd: current.volume24hUsd ?? stored.volume24hUsd,
    buys24h: current.buys24h ?? stored.buys24h,
    sells24h: current.sells24h ?? stored.sells24h,
    priceChange24hPct: current.priceChange24hPct ?? stored.priceChange24hPct,
    pairAddress: current.pairAddress ?? stored.pairAddress,
    dexId: current.dexId ?? stored.dexId,
    pairCreatedAt: current.pairCreatedAt ?? stored.pairCreatedAt,
    observedAt: current.observedAt ?? stored.observedAt,
  };
}

export function candidateWithoutEnrichment(candidate: LaunchCandidate): CoinListItem {
  return {
    mint: candidate.mint,
    name: candidate.name,
    symbol: candidate.symbol,
    imageUri: candidate.imageUri,
    metadataUri: candidate.metadataUri,
    creator: candidate.creator,
    createdAt: candidate.createdAt,
    createdSlot: candidate.createdSlot,
    creationSignature: candidate.creationSignature,
    canonicalConfirmed: candidate.canonicalConfirmed,
    lifecycle: {
      venue: candidate.venue,
      stage: candidate.stage,
      graduatedAt: candidate.graduatedAt,
      poolAddress: candidate.poolAddress,
    },
    market: emptyMarket(),
    provenance: candidate.provenance,
    missing: [{
      field: "market",
      reason: "Current market enrichment was disabled for this request.",
    }],
  };
}

function filterCoins(coins: CoinListItem[], options: ListCoinsOptions): CoinListItem[] {
  const query = options.query?.trim().toLowerCase();
  return coins.filter((coin) => {
    if (options.status === "bonding" && coin.lifecycle.stage !== "bonding") return false;
    if (
      options.status === "graduated" &&
      coin.lifecycle.stage !== "graduated" &&
      coin.lifecycle.stage !== "pool"
    ) return false;
    if (
      options.minLiquidityUsd !== undefined &&
      (coin.market.liquidityUsd ?? -1) < options.minLiquidityUsd
    ) return false;
    if (
      options.minVolume24hUsd !== undefined &&
      (coin.market.volume24hUsd ?? -1) < options.minVolume24hUsd
    ) return false;
    if (
      query &&
      !coin.mint.toLowerCase().includes(query) &&
      !coin.name?.toLowerCase().includes(query) &&
      !coin.symbol?.toLowerCase().includes(query)
    ) return false;
    return true;
  });
}

export function encodeCoinsCursor(cursor: CoinsCursor): string | null {
  if (Object.keys(cursor).length === 0) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeCoinsCursor(value: string | null): CoinsCursor | null {
  if (!value) return {};
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const cursor: CoinsCursor = {};
    if (typeof record.rpcBefore === "string") cursor.rpcBefore = record.rpcBefore;
    if (typeof record.pumpSwapBefore === "string") cursor.pumpSwapBefore = record.pumpSwapBefore;
    if (typeof record.trackerPage === "number" && Number.isInteger(record.trackerPage)) {
      cursor.trackerPage = Math.min(10, Math.max(1, record.trackerPage));
    }
    return cursor;
  } catch {
    return null;
  }
}

export async function listCoins(
  options: ListCoinsOptions = {},
): Promise<CoinsListResponse> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 30));
  const source = options.source ?? "auto";
  const cursor = options.cursor ?? {};
  const [stored, rpc, tracker, dexCandidate] = await Promise.all([
    readStoredCandidates(limit * 3),
    source === "tracker"
      ? Promise.resolve(null)
      : discoverFromRpc({ cursor, signatureLimit: Math.max(80, limit * 4) }),
    source === "rpc"
      ? Promise.resolve(null)
      : discoverFromSolanaTracker(cursor.trackerPage ?? 1),
    source === "auto" ? discoverFromDexProfiles() : Promise.resolve(null),
  ]);
  const preliminary = mergeLaunchCandidates([
    ...(rpc?.candidates ?? []),
    ...(tracker?.candidates ?? []),
    ...stored.candidates,
  ]);
  const dexFallback = source === "auto" && preliminary.length < limit
    ? dexCandidate
    : null;
  const candidates = mergeLaunchCandidates([
    ...preliminary,
    ...(dexFallback?.candidates ?? []),
  ]).slice(0, Math.min(200, limit * 3));
  const enrichment = options.enrich === false
    ? {
        coins: candidates.map(candidateWithoutEnrichment),
        observations: [] as CoinObservation[],
        warnings: [] as string[],
      }
    : await enrichCandidates(candidates);
  const storedMarkets = await readStoredMarketSnapshots(candidates.map((candidate) => candidate.mint));
  const hydratedCoins = enrichment.coins.map((coin) => {
    return {
      ...coin,
      market: mergeStoredMarket(coin.market, storedMarkets.get(coin.mint)),
    };
  });
  const filtered = filterCoins(hydratedCoins, options).slice(0, limit);
  const observations = [
    ...launchObservations(candidates),
    ...enrichment.observations,
  ].filter((row) => filtered.some((coin) => coin.mint === row.mint));
  const storage = await persistCoinBatch(filtered, observations);
  const researchSummaries = await readLatestResearchSummaries(
    filtered.map((coin) => coin.mint),
  );
  const coinsWithResearch = filtered.map((coin) => {
    const research = researchSummaries.get(coin.mint);
    return research ? { ...coin, research } : coin;
  });
  const nextCursor = {
    ...(rpc?.nextCursor ?? {}),
    ...(tracker?.nextCursor ?? {}),
  };
  const coverage = [
    ...(rpc?.coverage ?? []),
    ...(tracker?.coverage ?? []),
    ...(dexFallback?.coverage ?? []),
  ];
  return {
    generatedAt: new Date().toISOString(),
    coins: coinsWithResearch,
    pagination: {
      limit,
      nextCursor: encodeCoinsCursor(nextCursor),
      hasMore: Object.keys(nextCursor).length > 0,
    },
    ingestion: {
      requestedSource: source,
      discoverySources: [...new Set([
        ...(rpc?.sources ?? []),
        ...(tracker?.sources ?? []),
        ...(dexFallback?.sources ?? []),
      ])],
      coverage,
      storage,
      warnings: [...new Set([
        ...(rpc?.warnings ?? []),
        ...(tracker?.warnings ?? []),
        ...(dexFallback?.warnings ?? []),
        ...enrichment.warnings,
        ...(rpc && rpc.coverage.every((entry) => entry.exactCreatesFound === 0)
          ? ["The bounded canonical live scan found no exact Pump Create/CreateV2 instructions in decoded transactions. Partial DEX profile rows are shown instead and are not an unbiased launch cohort."]
          : []),
        ...(stored.storage.state === "failed" ? [stored.storage.reason ?? "Stored fallback failed."] : []),
      ])],
    },
  };
}

function unknownCandidate(mint: string): LaunchCandidate {
  const now = new Date().toISOString();
  return {
    mint,
    name: null,
    symbol: null,
    metadataUri: null,
    imageUri: null,
    creator: null,
    createdAt: null,
    createdSlot: null,
    creationSignature: null,
    programVersion: "indexed",
    venue: "unknown",
    stage: "unknown",
    graduatedAt: null,
    poolAddress: null,
    canonicalConfirmed: false,
    provenance: [{
      sourceId: "solana-rpc",
      role: "stored-observation",
      fidelity: "unavailable",
      eventAt: null,
      observedAt: now,
      availableAt: now,
      retrievedAt: now,
      missingReason: "No exact Pump launch instruction has been found in the bounded current-history window.",
    }],
  };
}

export async function getCoinDetail(
  mint: string,
  options: { historyLimit?: number; persist?: boolean } = {},
): Promise<CoinDetailResponse> {
  const [history, storedCandidates, storedObservations] = await Promise.all([
    collectCoinHistory(mint, options.historyLimit ?? 100),
    readStoredCandidates(250),
    readStoredObservations(mint, 500),
  ]);
  const storedCandidate = storedCandidates.candidates.find((candidate) => candidate.mint === mint);
  const merged = mergeLaunchCandidates([
    ...(storedCandidate ? [storedCandidate] : []),
    ...history.launchCandidates,
  ]);
  const candidate = merged[0] ?? unknownCandidate(mint);
  const enrichment = await enrichCandidates([candidate]);
  const coin = enrichment.coins[0] ?? candidateWithoutEnrichment(candidate);
  const liveObservations = [
    ...launchObservations([candidate]),
    ...history.observations,
    ...enrichment.observations,
  ];
  const observations = [...storedObservations.observations, ...liveObservations]
    .filter((row, index, rows) => rows.findIndex((candidateRow) => candidateRow.id === row.id) === index)
    .sort((a, b) => b.eventAt.localeCompare(a.eventAt));
  const storage = options.persist === false
    ? { state: "read-only" as const, reason: "Persistence was disabled for this server-side call." }
    : await persistCoinBatch([coin], liveObservations);
  return {
    generatedAt: new Date().toISOString(),
    coin,
    observations,
    historyCoverage: history.coverage,
    storage,
    warning: "This response contains real point-in-time provider and ledger observations. It is not a validated prediction or trading instruction; missing history is explicit.",
  };
}

import type {
  CoinListItem,
  CoinObservation,
  CoinMissingField,
} from "@/lib/coins/types";
import {
  getDexScreenerTokensBatch,
  getJupiterPricesBatch,
} from "@/lib/providers";
import type { DexPairSnapshot, JupiterPriceData } from "@/lib/providers/types";
import type { LaunchCandidate } from "./types";

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

function bestPair(mint: string, pairs: DexPairSnapshot[]): DexPairSnapshot | null {
  return pairs
    .filter((pair) => pair.chainId === "solana" && pair.baseToken.address === mint)
    .sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1))[0] ?? null;
}

function pairCreatedIso(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function marketObservation(
  mint: string,
  pair: DexPairSnapshot,
  retrievedAt: string,
): CoinObservation {
  return {
    id: `${mint}:dex-market:${retrievedAt}`,
    mint,
    sourceId: "dex-screener",
    observationType: "market_snapshot",
    eventAt: retrievedAt,
    observedAt: retrievedAt,
    availableAt: retrievedAt,
    retrievedAt,
    slot: null,
    transactionIndex: null,
    instructionIndex: null,
    commitment: null,
    canonicalStatus: "vendor-current",
    fidelity: "market-derived",
    signature: null,
    normalized: {
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      pairCreatedAt: pairCreatedIso(pair.pairCreatedAt),
      priceUsd: pair.priceUsd,
      marketCapUsd: pair.marketCapUsd,
      fdvUsd: pair.fdvUsd,
      liquidityUsd: pair.liquidityUsd,
      volume24hUsd: pair.volume.h24 ?? null,
      buys24h: pair.transactions.h24?.buys ?? null,
      sells24h: pair.transactions.h24?.sells ?? null,
      priceChange24hPct: pair.priceChange.h24 ?? null,
      activeBoosts: pair.activeBoosts,
      websites: pair.websites,
      socials: pair.socials,
    },
    nullReason: null,
  };
}

function jupiterObservation(
  mint: string,
  price: JupiterPriceData,
  retrievedAt: string,
): CoinObservation | null {
  if (!price.found) return null;
  return {
    id: `${mint}:jupiter-price:${retrievedAt}`,
    mint,
    sourceId: "jupiter",
    observationType: "price_snapshot",
    eventAt: retrievedAt,
    observedAt: retrievedAt,
    availableAt: retrievedAt,
    retrievedAt,
    slot: price.blockId,
    transactionIndex: null,
    instructionIndex: null,
    commitment: null,
    canonicalStatus: "vendor-current",
    fidelity: "market-derived",
    signature: null,
    normalized: {
      priceUsd: price.usdPrice,
      decimals: price.decimals,
      blockId: price.blockId,
      priceChange24hPct: price.priceChange24hPct,
    },
    nullReason: null,
  };
}

function missingFields(
  candidate: LaunchCandidate,
  resolvedName: string | null,
  resolvedSymbol: string | null,
  pair: DexPairSnapshot | null,
  price: JupiterPriceData | null,
  dexFailure: string | null,
  jupiterFailure: string | null,
): CoinMissingField[] {
  const missing: CoinMissingField[] = [];
  const add = (field: string, reason: string, sourceId?: CoinMissingField["sourceId"]) => {
    missing.push({ field, reason, ...(sourceId ? { sourceId } : {}) });
  };
  if (!resolvedName) add("name", "No decoded canonical metadata, indexed name, or matching base-pair identity was available.");
  if (!resolvedSymbol) add("symbol", "No decoded canonical metadata, indexed symbol, or matching base-pair identity was available.");
  if (!candidate.createdAt) add("createdAt", "No canonical block time or indexed creation time was available.", "pump-onchain");
  if (!candidate.creator) add("creator", "The creator was not decoded by an available source.");
  if (!candidate.canonicalConfirmed) {
    add("canonicalConfirmation", "No exact official Pump Create/CreateV2 or PumpSwap CreatePool instruction has been matched yet.", "pump-onchain");
  }
  if (!pair) {
    add("market", dexFailure ?? "DEX Screener returned no matching base-token pair.", "dex-screener");
  }
  if (!price?.found) {
    add("jupiterPrice", jupiterFailure ?? "Jupiter returned no current price record.", "jupiter");
  }
  return missing;
}

export async function enrichCandidates(
  candidates: LaunchCandidate[],
): Promise<{
  coins: CoinListItem[];
  observations: CoinObservation[];
  warnings: string[];
}> {
  const mints = [...new Set(candidates.map((candidate) => candidate.mint))];
  const [dexResults, jupiterResults] = await Promise.all([
    Promise.all(chunks(mints, 30).map((chunk) => getDexScreenerTokensBatch(chunk))),
    Promise.all(chunks(mints, 50).map((chunk) => getJupiterPricesBatch(chunk))),
  ]);

  const pairs: DexPairSnapshot[] = dexResults.flatMap((result) => result.ok ? result.data : []);
  const prices = Object.assign(
    {},
    ...jupiterResults.map((result) => result.ok ? result.data : {}),
  ) as Record<string, JupiterPriceData>;
  const dexFailure = dexResults.some((result) => !result.ok)
    ? "At least one bounded DEX Screener batch failed; this coin may lack market fields."
    : null;
  const jupiterFailure = jupiterResults.some((result) => !result.ok)
    ? "At least one bounded Jupiter price batch failed; this coin may lack a current route-derived price."
    : null;
  const retrievedAt = new Date().toISOString();
  const observations: CoinObservation[] = [];
  const coins = candidates.map((candidate): CoinListItem => {
    const pair = bestPair(candidate.mint, pairs);
    const price = prices[candidate.mint] ?? null;
    const resolvedName = candidate.name ?? pair?.baseToken.name ?? null;
    const resolvedSymbol = candidate.symbol ?? pair?.baseToken.symbol ?? null;
    if (pair) observations.push(marketObservation(candidate.mint, pair, retrievedAt));
    const jupiter = price ? jupiterObservation(candidate.mint, price, retrievedAt) : null;
    if (jupiter) observations.push(jupiter);
    const dexLooksPump = pair?.dexId.toLowerCase().includes("pump") ?? false;
    return {
      mint: candidate.mint,
      name: resolvedName,
      symbol: resolvedSymbol,
      imageUri: candidate.imageUri,
      metadataUri: candidate.metadataUri,
      creator: candidate.creator,
      createdAt: candidate.createdAt,
      createdSlot: candidate.createdSlot,
      creationSignature: candidate.creationSignature,
      canonicalConfirmed: candidate.canonicalConfirmed,
      lifecycle: {
        venue: candidate.venue === "unknown" && dexLooksPump
          ? "pump-swap"
          : candidate.venue,
        stage: candidate.stage === "unknown" && pair ? "pool" : candidate.stage,
        graduatedAt: candidate.graduatedAt,
        poolAddress: candidate.poolAddress ?? pair?.pairAddress ?? null,
      },
      market: {
        priceUsd: pair?.priceUsd ?? price?.usdPrice ?? null,
        marketCapUsd: pair?.marketCapUsd ?? null,
        liquidityUsd: pair?.liquidityUsd ?? null,
        volume24hUsd: pair?.volume.h24 ?? null,
        buys24h: pair?.transactions.h24?.buys ?? null,
        sells24h: pair?.transactions.h24?.sells ?? null,
        priceChange24hPct: pair?.priceChange.h24 ?? price?.priceChange24hPct ?? null,
        pairAddress: pair?.pairAddress ?? null,
        dexId: pair?.dexId ?? null,
        pairCreatedAt: pairCreatedIso(pair?.pairCreatedAt ?? null),
        observedAt: pair || price?.found ? retrievedAt : null,
      },
      provenance: [
        ...candidate.provenance,
        ...(pair ? [{
          sourceId: "dex-screener" as const,
          role: "market-enrichment" as const,
          fidelity: "market-derived" as const,
          eventAt: retrievedAt,
          observedAt: retrievedAt,
          availableAt: retrievedAt,
          retrievedAt,
        }] : []),
        ...(price?.found ? [{
          sourceId: "jupiter" as const,
          role: "price-enrichment" as const,
          fidelity: "market-derived" as const,
          eventAt: retrievedAt,
          observedAt: retrievedAt,
          availableAt: retrievedAt,
          retrievedAt,
          ...(price.blockId ? { slot: price.blockId } : {}),
        }] : []),
      ],
      missing: missingFields(
        candidate,
        resolvedName,
        resolvedSymbol,
        pair,
        price,
        dexFailure,
        jupiterFailure,
      ),
    };
  });
  return {
    coins,
    observations,
    warnings: [
      ...(dexFailure ? [dexFailure] : []),
      ...(jupiterFailure ? [jupiterFailure] : []),
    ],
  };
}

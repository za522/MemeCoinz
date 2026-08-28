import type {
  CoinListItem,
  CoinsListResponse,
} from "@/lib/coins/types";
import {
  normalizeDexPair,
  normalizeDexTokenProfile,
} from "@/lib/providers/dex-screener";
import type {
  DexPairSnapshot,
  DexTokenProfile,
} from "@/lib/providers/types";
import { decodeBase58 } from "./base58";

const DEX_SCREENER_BASE = "https://api.dexscreener.com";
const MAX_BROWSER_ROWS = 30;

export type BrowserPublicFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface BrowserDexFallbackOptions {
  limit?: number;
  fetcher?: BrowserPublicFetch;
  now?: () => Date;
  serverWarnings?: string[];
}

function validMint(value: string): boolean {
  return value.length >= 32 && value.length <= 44 && decodeBase58(value)?.length === 32;
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value || value.length > 1_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function pairCreatedIso(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function bestPairsByMint(pairs: DexPairSnapshot[]): Map<string, DexPairSnapshot> {
  const result = new Map<string, DexPairSnapshot>();
  for (const pair of pairs) {
    if (pair.chainId !== "solana" || !validMint(pair.baseToken.address)) continue;
    const current = result.get(pair.baseToken.address);
    if (!current || (pair.liquidityUsd ?? -1) > (current.liquidityUsd ?? -1)) {
      result.set(pair.baseToken.address, pair);
    }
  }
  return result;
}

async function readPublicJson(
  fetcher: BrowserPublicFetch,
  url: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
      mode: "cors",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DEX Screener returned HTTP ${response.status}.`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function toCoin(
  profile: DexTokenProfile,
  pair: DexPairSnapshot | null,
  observedAt: string,
): CoinListItem {
  const pairCreatedAt = pairCreatedIso(pair?.pairCreatedAt ?? null);
  const pumpLike = profile.tokenAddress.toLowerCase().endsWith("pump") ||
    pair?.dexId.toLowerCase().includes("pump") === true;
  return {
    mint: profile.tokenAddress,
    name: pair?.baseToken.name ?? null,
    symbol: pair?.baseToken.symbol ?? null,
    imageUri: safeHttpsUrl(profile.icon),
    metadataUri: null,
    creator: null,
    createdAt: null,
    createdSlot: null,
    creationSignature: null,
    canonicalConfirmed: false,
    lifecycle: {
      venue: pumpLike && pair ? "pump-swap" : "unknown",
      stage: pair ? "pool" : "unknown",
      graduatedAt: null,
      poolAddress: pair?.pairAddress ?? null,
    },
    market: {
      priceUsd: pair?.priceUsd ?? null,
      marketCapUsd: pair?.marketCapUsd ?? null,
      liquidityUsd: pair?.liquidityUsd ?? null,
      volume24hUsd: pair?.volume.h24 ?? null,
      buys24h: pair?.transactions.h24?.buys ?? null,
      sells24h: pair?.transactions.h24?.sells ?? null,
      priceChange24hPct: pair?.priceChange.h24 ?? null,
      pairAddress: pair?.pairAddress ?? null,
      dexId: pair?.dexId ?? null,
      pairCreatedAt,
      observedAt,
    },
    provenance: [
      {
        sourceId: "dex-screener",
        role: "paid-profile-discovery",
        fidelity: "market-derived",
        eventAt: null,
        observedAt,
        availableAt: observedAt,
        retrievedAt: observedAt,
        missingReason: "Browser-direct latest profiles are a promoted subset, not a complete launch cohort.",
      },
      ...(pair ? [{
        sourceId: "dex-screener" as const,
        role: "market-enrichment" as const,
        fidelity: "market-derived" as const,
        eventAt: observedAt,
        observedAt,
        availableAt: observedAt,
        retrievedAt: observedAt,
      }] : []),
    ],
    missing: [
      {
        field: "canonicalConfirmation",
        reason: "No exact official Pump create instruction was confirmed by this browser fallback.",
        sourceId: "pump-onchain",
      },
      {
        field: "createdAt",
        reason: "DEX Screener profile time is not a canonical token launch time.",
        sourceId: "dex-screener",
      },
      {
        field: "creator",
        reason: "The browser fallback does not infer a creator from current market data.",
      },
      ...(!pair ? [{
        field: "market",
        reason: "DEX Screener returned no matching Solana base-token pair.",
        sourceId: "dex-screener" as const,
      }] : []),
    ],
  };
}

/**
 * Last-resort public discovery for hosts that cannot make outbound requests.
 * It uses no credential, performs no write, and is never a training cohort.
 */
export async function loadBrowserDexFallback(
  options: BrowserDexFallbackOptions = {},
): Promise<CoinsListResponse> {
  const limit = Math.min(MAX_BROWSER_ROWS, Math.max(1, options.limit ?? 20));
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const profilesJson = await readPublicJson(
    fetcher,
    `${DEX_SCREENER_BASE}/token-profiles/latest/v1`,
  );
  if (!Array.isArray(profilesJson)) throw new Error("DEX Screener returned an invalid profile list.");

  const profiles: DexTokenProfile[] = [];
  const seen = new Set<string>();
  for (const value of profilesJson) {
    const profile = normalizeDexTokenProfile(value);
    if (
      !profile ||
      profile.chainId !== "solana" ||
      !validMint(profile.tokenAddress) ||
      seen.has(profile.tokenAddress)
    ) continue;
    seen.add(profile.tokenAddress);
    profiles.push(profile);
    if (profiles.length === MAX_BROWSER_ROWS) break;
  }
  if (profiles.length === 0) throw new Error("DEX Screener returned no valid Solana profiles.");

  const mintPath = profiles.map((profile) => encodeURIComponent(profile.tokenAddress)).join(",");
  const pairsJson = await readPublicJson(
    fetcher,
    `${DEX_SCREENER_BASE}/tokens/v1/solana/${mintPath}`,
  );
  const pairs = Array.isArray(pairsJson)
    ? pairsJson.flatMap((value) => {
        const pair = normalizeDexPair(value);
        return pair ? [pair] : [];
      })
    : [];
  const bestPairs = bestPairsByMint(pairs);
  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const coins = profiles
    .filter((profile) => {
      const pair = bestPairs.get(profile.tokenAddress);
      return profile.tokenAddress.toLowerCase().endsWith("pump") ||
        pair?.dexId.toLowerCase().includes("pump") === true;
    })
    .map((profile) => toCoin(
      profile,
      bestPairs.get(profile.tokenAddress) ?? null,
      observedAt,
    ))
    .slice(0, limit);
  if (coins.length === 0) throw new Error("DEX Screener returned no Pump-like Solana rows.");

  return {
    generatedAt: observedAt,
    coins,
    pagination: { limit, nextCursor: null, hasMore: false },
    ingestion: {
      requestedSource: "auto",
      discoverySources: ["dex-screener"],
      coverage: [{
        sourceId: "dex-screener",
        signaturesScanned: 0,
        transactionsRequested: 0,
        transactionsDecoded: 0,
        exactCreatesFound: 0,
        exactMigrationsFound: 0,
        newestEventAt: null,
        oldestEventAt: null,
        partial: true,
        missingReason: "Browser-direct DEX profiles and current pairs are a promoted subset, not every Pump launch and not a training cohort.",
      }],
      storage: {
        state: "read-only",
        reason: "Browser-direct public fallback: current rows were not written to server storage.",
        assetsWritten: 0,
        observationsWritten: 0,
      },
      warnings: [...new Set([
        ...(options.serverWarnings ?? []),
        "The server returned no coins, so the browser loaded DEX Screener's public latest-profile and current-pair APIs directly.",
        "These rows are real and current but partial and promoted; they must not be treated as an unbiased launch cohort.",
      ])],
    },
  };
}

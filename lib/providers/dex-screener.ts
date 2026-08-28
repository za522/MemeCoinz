import {
  asNumber,
  asString,
  getArray,
  getRecord,
  isRecord,
  safeFetchJson,
} from "./http";
import type {
  DexComponentAvailability,
  DexPaidOrder,
  DexPairSnapshot,
  DexTokenProfile,
  DexTokenData,
  UpstreamResult,
} from "./types";

const DEX_SCREENER_BASE = "https://api.dexscreener.com";
const SOL_WRAPPED_MINT = "So11111111111111111111111111111111111111112";

function invalidFrom<T>(
  result: UpstreamResult<unknown>,
): UpstreamResult<T> {
  return {
    ok: false,
    code: "invalid_response",
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
  };
}

export function normalizeDexTokenProfile(value: unknown): DexTokenProfile | null {
  if (!isRecord(value)) return null;
  const tokenAddress = asString(value.tokenAddress);
  const chainId = asString(value.chainId);
  if (!tokenAddress || !chainId) return null;
  return {
    tokenAddress,
    chainId,
    url: asString(value.url),
    icon: asString(value.icon),
    header: asString(value.header),
    description: asString(value.description),
    links: getArray(value, "links").flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const url = asString(entry.url);
      return url
        ? [{ type: asString(entry.type), label: asString(entry.label), url }]
        : [];
    }).slice(0, 12),
  };
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, candidate]) => {
      const parsed = asNumber(candidate);
      return parsed === null ? [] : [[key, parsed]];
    }),
  );
}

function transactionRecord(
  value: unknown,
): Record<string, { buys: number; sells: number }> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, candidate]) => {
      if (!isRecord(candidate)) return [];
      const buys = asNumber(candidate.buys);
      const sells = asNumber(candidate.sells);
      return buys === null || sells === null
        ? []
        : [[key, { buys, sells }]];
    }),
  );
}

function tokenIdentity(value: unknown) {
  const record = isRecord(value) ? value : {};
  return {
    address: asString(record.address) ?? "",
    name: asString(record.name) ?? "Unknown",
    symbol: asString(record.symbol) ?? "?",
  };
}

export function normalizeDexPair(value: unknown): DexPairSnapshot | null {
  if (!isRecord(value)) return null;
  const pairAddress = asString(value.pairAddress);
  const chainId = asString(value.chainId);
  const dexId = asString(value.dexId);
  if (!pairAddress || !chainId || !dexId) return null;

  const info = getRecord(value, "info");
  const liquidity = getRecord(value, "liquidity");
  const boosts = getRecord(value, "boosts");

  const websites = info
    ? getArray(info, "websites")
        .flatMap((entry) => {
          const url = isRecord(entry) ? asString(entry.url) : null;
          return url ? [url] : [];
        })
        .slice(0, 8)
    : [];
  const socials = info
    ? getArray(info, "socials")
        .flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const platform = asString(entry.platform) ?? asString(entry.type);
          const handle = asString(entry.handle) ?? asString(entry.url);
          return platform && handle ? [{ platform, handle }] : [];
        })
        .slice(0, 8)
    : [];

  return {
    chainId,
    dexId,
    pairAddress,
    url: asString(value.url),
    baseToken: tokenIdentity(value.baseToken),
    quoteToken: tokenIdentity(value.quoteToken),
    priceUsd: asNumber(value.priceUsd),
    liquidityUsd: liquidity ? asNumber(liquidity.usd) : null,
    marketCapUsd: asNumber(value.marketCap),
    fdvUsd: asNumber(value.fdv),
    pairCreatedAt: asNumber(value.pairCreatedAt),
    activeBoosts: boosts ? asNumber(boosts.active) : null,
    volume: numberRecord(value.volume),
    priceChange: numberRecord(value.priceChange),
    transactions: transactionRecord(value.txns),
    websites,
    socials,
  };
}

function normalizeOrder(value: unknown): DexPaidOrder | null {
  if (!isRecord(value)) return null;
  const type = asString(value.type);
  const status = asString(value.status);
  if (!type || !status) return null;
  return {
    tokenAddress: asString(value.tokenAddress),
    type,
    status,
    paymentTimestamp: asNumber(value.paymentTimestamp),
  };
}

function componentAvailability<T>(
  result: UpstreamResult<T>,
): DexComponentAvailability {
  return result.ok
    ? {
        available: true,
        checkedAt: result.checkedAt,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
      }
    : {
        available: false,
        checkedAt: result.checkedAt,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        errorCode: result.code,
        ...(result.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: result.retryAfterSeconds }),
      };
}

async function getDexPairs(
  mint: string,
): Promise<UpstreamResult<DexPairSnapshot[]>> {
  const url = new URL(
    `/token-pairs/v1/solana/${encodeURIComponent(mint)}`,
    DEX_SCREENER_BASE,
  );
  const result = await safeFetchJson<unknown>(url, { timeoutMs: 5_000 });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return invalidFrom(result);

  return {
    ...result,
    data: result.data.flatMap((pair) => {
      const normalized = normalizeDexPair(pair);
      return normalized ? [normalized] : [];
    }).slice(0, 20),
  };
}

async function getDexPaidOrders(
  mint: string,
): Promise<UpstreamResult<DexPaidOrder[]>> {
  const url = new URL(
    `/orders/v1/solana/${encodeURIComponent(mint)}`,
    DEX_SCREENER_BASE,
  );
  const result = await safeFetchJson<unknown>(url, { timeoutMs: 5_000 });
  if (!result.ok) return result;
  const rawOrders = Array.isArray(result.data)
    ? result.data
    : isRecord(result.data)
      ? getArray(result.data, "orders")
      : null;
  if (!rawOrders) return invalidFrom(result);
  return {
    ...result,
    data: rawOrders.flatMap((order) => {
      const normalized = normalizeOrder(order);
      return normalized ? [normalized] : [];
    }),
  };
}

export async function checkDexScreenerHealth(): Promise<
  UpstreamResult<{ pairCount: number }>
> {
  const result = await getDexPairs(SOL_WRAPPED_MINT);
  if (!result.ok) return result;
  if (result.data.length === 0) return invalidFrom(result);
  return { ...result, data: { pairCount: result.data.length } };
}

export async function getDexScreenerToken(
  mint: string,
): Promise<UpstreamResult<DexTokenData>> {
  const [pairs, orders] = await Promise.all([
    getDexPairs(mint),
    getDexPaidOrders(mint),
  ]);
  if (!pairs.ok && !orders.ok) {
    return {
      ...pairs,
      checkedAt: new Date().toISOString(),
      latencyMs: Math.max(pairs.latencyMs, orders.latencyMs),
      retryAfterSeconds:
        pairs.retryAfterSeconds ?? orders.retryAfterSeconds,
    };
  }

  return {
    ok: true,
    data: {
      pairs: pairs.ok ? pairs.data : [],
      paidOrders: orders.ok ? orders.data : [],
      availability: {
        pairs: componentAvailability(pairs),
        paidOrders: componentAvailability(orders),
      },
    },
    checkedAt: new Date().toISOString(),
    latencyMs: Math.max(pairs.latencyMs, orders.latencyMs),
    // The all-failed branch returned above, so at least one of these is a
    // successful response with a concrete HTTP status.
    httpStatus: pairs.ok
      ? pairs.httpStatus
      : orders.ok
        ? orders.httpStatus
        : 200,
  };
}

/** Current pair snapshots for up to 30 addresses per DEX Screener request. */
export async function getDexScreenerTokensBatch(
  mints: string[],
): Promise<UpstreamResult<DexPairSnapshot[]>> {
  const unique = [...new Set(mints)].slice(0, 30);
  if (unique.length === 0) {
    return {
      ok: true,
      data: [],
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      httpStatus: 200,
    };
  }
  const url = new URL(
    `/tokens/v1/solana/${unique.map(encodeURIComponent).join(",")}`,
    DEX_SCREENER_BASE,
  );
  const result = await safeFetchJson<unknown>(url, { timeoutMs: 6_000 });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return invalidFrom(result);
  return {
    ...result,
    data: result.data.flatMap((pair) => {
      const normalized = normalizeDexPair(pair);
      return normalized ? [normalized] : [];
    }),
  };
}

/**
 * DEX Screener's public latest-profile surface is a partial discovery fallback.
 * It is never described as a complete launch cohort.
 */
export async function getLatestDexTokenProfiles(): Promise<
  UpstreamResult<DexTokenProfile[]>
> {
  const url = new URL("/token-profiles/latest/v1", DEX_SCREENER_BASE);
  const result = await safeFetchJson<unknown>(url, { timeoutMs: 6_000 });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return invalidFrom(result);
  return {
    ...result,
    data: result.data.flatMap((profile) => {
      const normalized = normalizeDexTokenProfile(profile);
      return normalized ? [normalized] : [];
    }),
  };
}

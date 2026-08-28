import { getSolanaTrackerApiKey } from "./config";
import {
  asNumber,
  asString,
  getArray,
  getRecord,
  isRecord,
  safeFetchJson,
} from "./http";
import type { SolanaTrackerTokenData, UpstreamResult } from "./types";

const SOLANA_TRACKER_BASE = "https://data.solanatracker.io";
const SOL_WRAPPED_MINT = "So11111111111111111111111111111111111111112";

function notConfigured<T>(): UpstreamResult<T> {
  return {
    ok: false,
    code: "not_configured",
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    httpStatus: null,
  };
}

export async function getSolanaTrackerToken(
  mint: string,
): Promise<UpstreamResult<SolanaTrackerTokenData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();

  const url = new URL(
    `/tokens/${encodeURIComponent(mint)}`,
    SOLANA_TRACKER_BASE,
  );
  const result = await safeFetchJson<unknown>(url, {
    headers: { "x-api-key": apiKey },
    timeoutMs: 6_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data)) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  const token = getRecord(result.data, "token");
  if (!token) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  const creation = getRecord(token, "creation");
  const risk = getRecord(result.data, "risk");
  const pools = getArray(result.data, "pools")
    .flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const liquidity = getRecord(candidate, "liquidity");
      const price = getRecord(candidate, "price");
      const marketCap = getRecord(candidate, "marketCap");
      const poolAddress =
        asString(candidate.poolId) ?? asString(candidate.poolAddress);
      if (!poolAddress) return [];
      return [
        {
          poolAddress,
          market: asString(candidate.market),
          liquidityUsd: liquidity ? asNumber(liquidity.usd) : null,
          priceUsd: price ? asNumber(price.usd) : null,
          marketCapUsd: marketCap ? asNumber(marketCap.usd) : null,
          lpBurnPct: asNumber(candidate.lpBurn),
        },
      ];
    })
    .slice(0, 20);

  return {
    ...result,
    data: {
      mint: asString(token.mint) ?? mint,
      name: asString(token.name),
      symbol: asString(token.symbol),
      image: asString(token.image),
      description: asString(token.description),
      creator: creation ? asString(creation.creator) : null,
      createdTransaction: creation ? asString(creation.created_tx) : null,
      createdAtUnix: creation ? asNumber(creation.created_time) : null,
      holders: asNumber(result.data.holders),
      buys: asNumber(result.data.buys),
      sells: asNumber(result.data.sells),
      transactions: asNumber(result.data.txns),
      riskScore: risk
        ? asNumber(risk.score) ?? asNumber(risk.rugged)
        : null,
      pools,
    },
  };
}

export async function checkSolanaTrackerHealth(): Promise<
  UpstreamResult<{ priceAvailable: boolean }>
> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const url = new URL("/price", SOLANA_TRACKER_BASE);
  url.searchParams.set("token", SOL_WRAPPED_MINT);
  const result = await safeFetchJson<unknown>(url, {
    headers: { "x-api-key": apiKey },
    timeoutMs: 5_000,
  });
  if (!result.ok) return result;
  const price = isRecord(result.data) ? asNumber(result.data.price) : null;
  if (price === null) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }
  return { ...result, data: { priceAvailable: true } };
}

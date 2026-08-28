import { getJupiterApiKey } from "./config";
import { asNumber, isRecord, safeFetchJson } from "./http";
import type { JupiterPriceData, UpstreamResult } from "./types";

const JUPITER_BASE = "https://api.jup.ag";
const SOL_WRAPPED_MINT = "So11111111111111111111111111111111111111112";

export async function getJupiterPrice(
  mint: string,
): Promise<UpstreamResult<JupiterPriceData>> {
  const url = new URL("/price/v3", JUPITER_BASE);
  url.searchParams.set("ids", mint);
  const apiKey = getJupiterApiKey();
  const result = await safeFetchJson<unknown>(url, {
    timeoutMs: 5_000,
    headers: apiKey ? { "x-api-key": apiKey } : {},
  });
  if (!result.ok) return result;

  const root = isRecord(result.data) ? result.data : null;
  const entry = root && isRecord(root[mint]) ? root[mint] : null;
  if (!entry) {
    if (root) {
      return {
        ...result,
        data: {
          mint,
          usdPrice: null,
          decimals: null,
          blockId: null,
          priceChange24hPct: null,
        },
      };
    }
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  return {
    ...result,
    data: {
      mint,
      usdPrice: asNumber(entry.usdPrice),
      decimals: asNumber(entry.decimals),
      blockId: asNumber(entry.blockId),
      priceChange24hPct:
        asNumber(entry.priceChange24h) ?? asNumber(entry.priceChange24hPct),
    },
  };
}

export async function checkJupiterHealth(): Promise<
  UpstreamResult<{ priceAvailable: boolean }>
> {
  const result = await getJupiterPrice(SOL_WRAPPED_MINT);
  if (!result.ok) return result;
  if (result.data.usdPrice === null) {
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

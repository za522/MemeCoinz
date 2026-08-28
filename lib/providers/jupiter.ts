import {
  getJupiterApiKey,
  isMeteredTokenEnrichmentEnabled,
} from "./config";
import { asNumber, asString, getArray, getRecord, isRecord, safeFetchJson } from "./http";
import type {
  JupiterPriceData,
  JupiterQuoteProbe,
  JupiterQuoteRouteLeg,
  JupiterRoundTripProbe,
  UpstreamResult,
} from "./types";

const JUPITER_BASE = "https://api.jup.ag";
const SOL_WRAPPED_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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
          found: false,
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
      found:
        asNumber(entry.usdPrice) !== null ||
        asNumber(entry.decimals) !== null ||
        asNumber(entry.blockId) !== null,
      usdPrice: asNumber(entry.usdPrice),
      decimals: asNumber(entry.decimals),
      blockId: asNumber(entry.blockId),
      priceChange24hPct:
        asNumber(entry.priceChange24h) ?? asNumber(entry.priceChange24hPct),
    },
  };
}

export async function getJupiterPricesBatch(
  mints: string[],
): Promise<UpstreamResult<Record<string, JupiterPriceData>>> {
  const unique = [...new Set(mints)].slice(0, 50);
  if (unique.length === 0) {
    return {
      ok: true,
      data: {},
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      httpStatus: 200,
    };
  }
  const url = new URL("/price/v3", JUPITER_BASE);
  url.searchParams.set("ids", unique.join(","));
  const apiKey = getJupiterApiKey();
  const result = await safeFetchJson<unknown>(url, {
    timeoutMs: 6_000,
    headers: apiKey ? { "x-api-key": apiKey } : {},
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
  const root = result.data;
  return {
    ...result,
    data: Object.fromEntries(unique.map((mint) => {
      const entry = isRecord(root[mint]) ? root[mint] : null;
      return [mint, {
        mint,
        found: Boolean(entry),
        usdPrice: entry ? asNumber(entry.usdPrice) : null,
        decimals: entry ? asNumber(entry.decimals) : null,
        blockId: entry ? asNumber(entry.blockId) : null,
        priceChange24hPct: entry
          ? asNumber(entry.priceChange24h) ?? asNumber(entry.priceChange24hPct)
          : null,
      }];
    })),
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

export interface JupiterProbeOptions {
  orderSizesUsd?: number[];
  slippageBps?: number;
  /** Keyed calls are allowed only when this and the global metered gate are true. */
  allowMeteredCredential?: boolean;
}

function routeLeg(value: unknown): JupiterQuoteRouteLeg | null {
  if (!isRecord(value)) return null;
  const info = getRecord(value, "swapInfo");
  if (!info) return null;
  return {
    ammKey: asString(info.ammKey),
    label: asString(info.label),
    inputMint: asString(info.inputMint),
    outputMint: asString(info.outputMint),
    inAmount: asString(info.inAmount),
    outAmount: asString(info.outAmount),
    feeAmount: asString(info.feeAmount),
    feeMint: asString(info.feeMint),
    percent: asNumber(value.percent),
  };
}

async function getReadOnlyQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  side: "buy" | "sell",
  slippageBps: number,
  useKeyedEndpoint: boolean,
): Promise<JupiterQuoteProbe> {
  const requestedAt = new Date().toISOString();
  const url = new URL(
    "/swap/v1/quote",
    useKeyedEndpoint ? "https://api.jup.ag" : "https://lite-api.jup.ag",
  );
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount);
  url.searchParams.set("slippageBps", String(slippageBps));
  url.searchParams.set("swapMode", "ExactIn");
  url.searchParams.set("restrictIntermediateTokens", "true");
  url.searchParams.set("instructionVersion", "V2");
  const apiKey = useKeyedEndpoint ? getJupiterApiKey() : null;
  const result = await safeFetchJson<unknown>(url, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    timeoutMs: 8_000,
    maxResponseBytes: 2_000_000,
  });
  const completedAt = result.checkedAt;
  if (!result.ok) {
    return {
      side,
      requestedAt,
      completedAt,
      latencyMs: result.latencyMs,
      routeAvailable: false,
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount: null,
      otherAmountThreshold: null,
      priceImpactPct: null,
      contextSlot: null,
      providerTimeTakenSeconds: null,
      routePlan: [],
      failureCode: result.code,
    };
  }
  if (!isRecord(result.data)) {
    return {
      side,
      requestedAt,
      completedAt,
      latencyMs: result.latencyMs,
      routeAvailable: false,
      inputMint,
      outputMint,
      inAmount: amount,
      outAmount: null,
      otherAmountThreshold: null,
      priceImpactPct: null,
      contextSlot: null,
      providerTimeTakenSeconds: null,
      routePlan: [],
      failureCode: "invalid_response",
    };
  }
  const outAmount = asString(result.data.outAmount);
  return {
    side,
    requestedAt,
    completedAt,
    latencyMs: result.latencyMs,
    routeAvailable: Boolean(outAmount),
    inputMint: asString(result.data.inputMint) ?? inputMint,
    outputMint: asString(result.data.outputMint) ?? outputMint,
    inAmount: asString(result.data.inAmount) ?? amount,
    outAmount,
    otherAmountThreshold: asString(result.data.otherAmountThreshold),
    priceImpactPct: asNumber(result.data.priceImpactPct),
    contextSlot: asNumber(result.data.contextSlot),
    providerTimeTakenSeconds: asNumber(result.data.timeTaken),
    routePlan: getArray(result.data, "routePlan").flatMap((candidate) => {
      const normalized = routeLeg(candidate);
      return normalized ? [normalized] : [];
    }),
    failureCode: outAmount ? null : "no_route",
  };
}

function boundedSizes(values: number[] | undefined): number[] {
  const candidates = values?.length ? values : [25, 100, 500];
  return [...new Set(candidates)]
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 10_000)
    .slice(0, 4);
}

/**
 * Read-only, size-specific USDC -> token -> USDC quote probes. The sell input
 * is exactly the quoted buy output, making the pair an executable round-trip
 * estimate without ever building, signing, or submitting a transaction.
 */
export async function probeJupiterRoundTrips(
  mint: string,
  options: JupiterProbeOptions = {},
): Promise<UpstreamResult<JupiterRoundTripProbe[]>> {
  const sizes = boundedSizes(options.orderSizesUsd);
  const slippageBps = Math.min(1_000, Math.max(1, Math.round(options.slippageBps ?? 100)));
  const useKeyedEndpoint = Boolean(
    options.allowMeteredCredential &&
      isMeteredTokenEnrichmentEnabled() &&
      getJupiterApiKey(),
  );
  const startedAt = Date.now();
  const probes = await Promise.all(sizes.map(async (orderSizeUsd) => {
    const usdcAtomicAmount = String(Math.round(orderSizeUsd * 1_000_000));
    const buy = await getReadOnlyQuote(
      USDC_MINT,
      mint,
      usdcAtomicAmount,
      "buy",
      slippageBps,
      useKeyedEndpoint,
    );
    const sell = buy.routeAvailable && buy.outAmount
      ? await getReadOnlyQuote(
          mint,
          USDC_MINT,
          buy.outAmount,
          "sell",
          slippageBps,
          useKeyedEndpoint,
        )
      : null;
    const expectedRoundTripUsd = sell?.outAmount
      ? Number(sell.outAmount) / 1_000_000
      : null;
    return {
      mint,
      orderSizeUsd,
      slippageBps,
      buy,
      sell,
      expectedRoundTripUsd,
      roundTripRetentionPct:
        expectedRoundTripUsd === null
          ? null
          : (expectedRoundTripUsd / orderSizeUsd) * 100,
      observedAt: sell?.completedAt ?? buy.completedAt,
      endpointMode: useKeyedEndpoint ? "keyed" : "public-lite",
      caveat:
        "Quotes are current, short-lived route estimates. They exclude signing/landing risk and are not trades, transaction submissions, historical quotes, or guaranteed execution prices.",
    } satisfies JupiterRoundTripProbe;
  }));
  return {
    ok: true,
    data: probes,
    checkedAt: new Date().toISOString(),
    latencyMs: Math.max(0, Date.now() - startedAt),
    httpStatus: 200,
  };
}

import {
  getHeliusApiKey,
  getJupiterApiKey,
  getSolanaTrackerApiKey,
  getXBearerToken,
  isMeteredTokenEnrichmentEnabled,
} from "./config";
import { getDexScreenerToken } from "./dex-screener";
import { getHeliusAsset } from "./helius";
import { getJupiterPrice } from "./jupiter";
import { getSolanaTokenSupply } from "./solana";
import { getSolanaTrackerToken } from "./solana-tracker";
import {
  configuredUnverifiedStatus,
  notConfiguredStatus,
  resultToStatus,
} from "./status";
import type {
  DexTokenData,
  HeliusAssetData,
  ProviderId,
  SolanaTrackerTokenData,
  TokenEnrichmentProvider,
  TokenEnrichmentResponse,
  UpstreamResult,
  XRecentCountsData,
} from "./types";
import { getXRecentContractCounts } from "./x";

function providerResult<T>(
  providerId: ProviderId,
  result: UpstreamResult<T>,
  configured: boolean,
  message: string,
): TokenEnrichmentProvider<T> {
  return {
    providerId,
    status: resultToStatus(result, configured, message),
    data: result.ok ? result.data : null,
  };
}

function gatedProvider<T>(
  providerId: ProviderId,
  configured: boolean,
  providerLabel: string,
): TokenEnrichmentProvider<T> {
  return {
    providerId,
    status: configured
      ? configuredUnverifiedStatus(
          `${providerLabel} is configured; metered calls are disabled on this public route.`,
        )
      : notConfiguredStatus(`${providerLabel} server credential is not configured.`),
    data: null,
  };
}

function dexProviderResult(
  result: UpstreamResult<DexTokenData>,
): TokenEnrichmentProvider<DexTokenData> {
  if (!result.ok) {
    return providerResult(
      "dex-screener",
      result,
      true,
      "DEX Screener returned current Solana pools and paid-order status.",
    );
  }

  const pairsAvailable = result.data.availability.pairs.available;
  const paidOrdersAvailable = result.data.availability.paidOrders.available;
  if (pairsAvailable && paidOrdersAvailable) {
    return providerResult(
      "dex-screener",
      result,
      true,
      "DEX Screener returned current Solana pools and paid-order status.",
    );
  }

  const failedComponent = pairsAvailable
    ? result.data.availability.paidOrders
    : result.data.availability.pairs;
  return {
    providerId: "dex-screener",
    status: {
      state: "degraded",
      configured: true,
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      message: pairsAvailable
        ? "Paid-order lookup failed; current pair data was retained."
        : "Pair lookup failed; current paid-order data was retained.",
      ...(failedComponent.errorCode
        ? { errorCode: failedComponent.errorCode }
        : {}),
      ...(failedComponent.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: failedComponent.retryAfterSeconds }),
    },
    data: result.data,
  };
}

function deriveTokenConfirmation(
  mint: string,
  providers: TokenEnrichmentResponse["providers"],
): TokenEnrichmentResponse["confirmation"] {
  const confirmingProviderIds: ProviderId[] = [];
  const add = (providerId: ProviderId) => {
    if (!confirmingProviderIds.includes(providerId)) {
      confirmingProviderIds.push(providerId);
    }
  };

  if (providers.solana.data?.mint === mint) add("solana-rpc");

  const dexData = providers.dexScreener.data;
  if (
    dexData?.pairs.some(
      (pair) =>
        pair.chainId === "solana" &&
        (pair.baseToken.address === mint || pair.quoteToken.address === mint),
    ) ||
    dexData?.paidOrders.some((order) => order.tokenAddress === mint)
  ) {
    add("dex-screener");
  }

  if (
    providers.jupiter.data?.found &&
    providers.jupiter.data.mint === mint
  ) {
    add("jupiter");
  }

  const helius = providers.helius.data;
  if (
    helius?.id === mint &&
    (helius.interface?.toLowerCase().includes("fungible") ||
      (helius.tokenSupply !== null && helius.decimals !== null))
  ) {
    add("helius");
  }

  if (providers.solanaTracker.data?.mint === mint) add("solana-tracker");

  return {
    confirmed: confirmingProviderIds.length > 0,
    confirmingProviderIds,
  };
}

export async function getTokenEnrichment(
  mint: string,
): Promise<TokenEnrichmentResponse> {
  const meteredProvidersEnabled = isMeteredTokenEnrichmentEnabled();
  const [solana, dexScreener, jupiter, helius, solanaTracker, xRecentCounts] =
    await Promise.all([
      getSolanaTokenSupply(mint),
      getDexScreenerToken(mint),
      getJupiterPrice(mint),
      meteredProvidersEnabled
        ? getHeliusAsset(mint)
        : Promise.resolve<UpstreamResult<HeliusAssetData> | null>(null),
      meteredProvidersEnabled
        ? getSolanaTrackerToken(mint)
        : Promise.resolve<UpstreamResult<SolanaTrackerTokenData> | null>(null),
      meteredProvidersEnabled
        ? getXRecentContractCounts(mint, "hour")
        : Promise.resolve<UpstreamResult<XRecentCountsData> | null>(null),
    ]);

  const providers: TokenEnrichmentResponse["providers"] = {
    solana: providerResult(
      "solana-rpc",
      solana,
      true,
      "Solana returned confirmed token supply.",
    ),
    dexScreener: dexProviderResult(dexScreener),
    jupiter: providerResult(
      "jupiter",
      jupiter,
      true,
      jupiter.ok && !jupiter.data.found
        ? "Jupiter responded but returned no price record for this mint."
        : getJupiterApiKey()
          ? "Jupiter returned a current price using the server key."
          : "Jupiter returned a current price in low-rate keyless mode.",
    ),
    helius:
      meteredProvidersEnabled && helius
        ? providerResult(
            "helius",
            helius,
            Boolean(getHeliusApiKey()),
            "Helius DAS returned current indexed asset metadata.",
          )
        : gatedProvider("helius", Boolean(getHeliusApiKey()), "Helius"),
    solanaTracker:
      meteredProvidersEnabled && solanaTracker
        ? providerResult(
            "solana-tracker",
            solanaTracker,
            Boolean(getSolanaTrackerApiKey()),
            "Solana Tracker returned its current token overview.",
          )
        : gatedProvider(
            "solana-tracker",
            Boolean(getSolanaTrackerApiKey()),
            "Solana Tracker",
          ),
    xRecentCounts:
      meteredProvidersEnabled && xRecentCounts
        ? providerResult(
            "x-api",
            xRecentCounts,
            Boolean(getXBearerToken()),
            "X returned recent exact-contract post-count buckets.",
          )
        : gatedProvider("x-api", Boolean(getXBearerToken()), "X API"),
  };

  return {
    mint,
    generatedAt: new Date().toISOString(),
    meteredProvidersEnabled,
    confirmation: deriveTokenConfirmation(mint, providers),
    warning:
      "Live enrichment is point-in-time evidence, not a validated signal or trading instruction.",
    providers,
  };
}

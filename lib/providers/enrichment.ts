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

  return {
    mint,
    generatedAt: new Date().toISOString(),
    meteredProvidersEnabled,
    warning:
      "Live enrichment is point-in-time evidence, not a validated signal or trading instruction.",
    providers: {
      solana: providerResult(
        "solana-rpc",
        solana,
        true,
        "Solana returned confirmed token supply.",
      ),
      dexScreener: providerResult(
        "dex-screener",
        dexScreener,
        true,
        "DEX Screener returned current Solana pools and paid-order status.",
      ),
      jupiter: providerResult(
        "jupiter",
        jupiter,
        true,
        getJupiterApiKey()
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
    },
  };
}

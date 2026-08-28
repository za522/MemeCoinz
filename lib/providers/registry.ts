import {
  getHeliusApiKey,
  getJupiterApiKey,
  getSolanaTrackerApiKey,
  getXBearerToken,
  PROVIDER_ENV,
} from "./config";
import { checkDexScreenerHealth } from "./dex-screener";
import { checkJupiterHealth } from "./jupiter";
import { checkJitoReadOnlyHealth } from "./jito";
import { checkSolanaHealth } from "./solana";
import {
  configuredUnverifiedStatus,
  disabledStatus,
  manualStatus,
  notConfiguredStatus,
  resultToStatus,
} from "./status";
import type {
  ProviderDefinition,
  ProviderId,
  ProviderStatus,
  SourceRegistryResponse,
} from "./types";

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    id: "solana-rpc",
    label: "Solana JSON-RPC",
    category: "ledger",
    access: "public",
    automated: true,
    officialUrl: "https://solana.com",
    documentationUrl: "https://solana.com/docs/rpc/http",
    environmentVariable: PROVIDER_ENV.solanaRpcUrl,
    statusMethod: "live-health-check",
    interfaces: [
      "Implemented: JSON-RPC POST api.mainnet.solana.com methods getHealth, getSlot, getTokenSupply",
      "Collector contract: getSignaturesForAddress, getTransaction, getBlock",
    ],
    historicalCoverage: "canonical-archive",
    capabilities: ["network-health", "canonical-transactions", "token-supply"],
    collects: ["slots", "transactions", "instructions", "balances", "fees", "token supply"],
    limitations: [
      "The public mainnet endpoint is rate limited and is not an archival SLA.",
      "Private intent and dropped transactions are not observable on-chain.",
    ],
    commercialUseNote: "Canonical protocol data; RPC provider terms and capacity still apply.",
  },
  {
    id: "dex-screener",
    label: "DEX Screener API",
    category: "market-data",
    access: "public-rate-limited",
    automated: true,
    officialUrl: "https://dexscreener.com",
    documentationUrl: "https://docs.dexscreener.com/api/reference",
    environmentVariable: null,
    statusMethod: "live-health-check",
    interfaces: [
      "Implemented: GET api.dexscreener.com/token-pairs/v1/solana/{mint}",
      "Implemented: GET api.dexscreener.com/orders/v1/solana/{mint}",
    ],
    historicalCoverage: "live-only",
    capabilities: ["pool-market-data", "paid-attention", "token-metadata"],
    collects: ["current pools", "liquidity", "volume windows", "price changes", "paid-order status"],
    limitations: [
      "Current API responses do not reconstruct every historical trending rank or boost state.",
      "Market cap and liquidity are vendor fields and must carry observation timestamps.",
    ],
    commercialUseNote: "Review DEX Screener API terms before retaining or redistributing vendor data.",
  },
  {
    id: "helius",
    label: "Helius",
    category: "indexer",
    access: "credentialed",
    automated: true,
    officialUrl: "https://www.helius.dev",
    documentationUrl: "https://www.helius.dev/docs/api-reference",
    environmentVariable: PROVIDER_ENV.heliusApiKey,
    statusMethod: "configuration-check",
    interfaces: [
      "Implemented behind metered gate: JSON-RPC POST mainnet.helius-rpc.com method getAsset",
      "Implemented for authenticated bounded collection: JSON-RPC getTransactionsForAddress with time filters and pagination tokens",
    ],
    historicalCoverage: "vendor-archive",
    capabilities: [
      "token-metadata",
      "holder-analytics",
      "historical-address-transactions",
      "creator-history-inputs",
    ],
    collects: ["DAS token metadata", "owner data", "address transaction history", "indexed slot"],
    limitations: [
      "Requires a server-side API key and consumes plan credits.",
      "Indexed or parsed data must retain its source slot and parser version.",
    ],
    commercialUseNote: "Use under the selected Helius plan and retention terms.",
    implementationNote: "DAS and bounded historical transaction adapters are implemented and network-mocked in tests. Live credential verification still requires a project key; public GET routes never spend Helius credits.",
  },
  {
    id: "solana-tracker",
    label: "Solana Tracker Data API",
    category: "indexer",
    access: "credentialed",
    automated: true,
    officialUrl: "https://www.solanatracker.io",
    documentationUrl: "https://docs.solanatracker.io",
    environmentVariable: PROVIDER_ENV.solanaTrackerApiKey,
    statusMethod: "configuration-check",
    interfaces: [
      "Implemented behind metered gate: GET data.solanatracker.io/tokens/{mint}",
      "Implemented adapter probe: GET data.solanatracker.io/price?token={mint}",
      "Implemented for authenticated bounded collection: token trades, paginated holders, holder chart, bundlers, risk, and deployer history endpoints",
      "Implemented for launch discovery: GET data.solanatracker.io/tokens/latest",
    ],
    historicalCoverage: "mixed",
    capabilities: [
      "token-discovery",
      "token-metadata",
      "pool-market-data",
      "holder-analytics",
      "risk-labels",
      "creator-history-inputs",
    ],
    collects: ["token and pool snapshots", "holders", "risk fields", "creation metadata", "launch discovery"],
    limitations: [
      "Requires a server-side API key and consumes plan quota.",
      "Vendor risk labels are evidence inputs, not ground-truth fraud labels.",
    ],
    commercialUseNote: "Review the Data API plan, retention, and redistribution terms.",
    implementationNote: "Discovery and research collectors are implemented and network-mocked in tests. Live credential verification still requires a Data API key; mutable classifications retain retrieval-time availability.",
  },
  {
    id: "x-api",
    label: "X API",
    category: "social",
    access: "credentialed",
    automated: true,
    officialUrl: "https://x.com",
    documentationUrl: "https://docs.x.com/x-api/posts/counts/introduction",
    environmentVariable: PROVIDER_ENV.xBearerToken,
    statusMethod: "configuration-check",
    interfaces: [
      "Implemented behind metered gate: GET api.x.com/2/tweets/counts/recent",
      "Implemented for authenticated bounded collection: recent/full-archive Post search and counts with start/end and pagination",
      "Future collector contract: /2/tweets/search/stream",
    ],
    historicalCoverage: "mixed",
    capabilities: ["recent-social-counts", "full-archive-social-counts", "filtered-social-stream"],
    collects: ["exact-contract post counts", "time buckets", "archived posts when plan permits"],
    limitations: [
      "Recent counts cover the recent window; full archive access depends on the plan.",
      "Raw mentions are manipulable and ticker-only searches are intentionally excluded.",
      "Current engagement must not be backfilled as historical engagement.",
    ],
    commercialUseNote: "An approved X developer plan and compliance with X data-use rules are required.",
    implementationNote: "Recent/full-archive search and count adapters are implemented and network-mocked in tests. Live archive access depends on the X plan; filtered-stream collection is not implemented.",
  },
  {
    id: "jupiter",
    label: "Jupiter API",
    category: "execution",
    access: "public-rate-limited",
    automated: true,
    officialUrl: "https://jup.ag",
    documentationUrl: "https://developers.jup.ag/docs/portal/setup",
    environmentVariable: PROVIDER_ENV.jupiterApiKey,
    statusMethod: "live-health-check",
    interfaces: [
      "Implemented: GET api.jup.ag/price/v3?ids={mint}",
      "Implemented read-only execution probes: GET lite-api.jup.ag/swap/v1/quote, or gated api.jup.ag/swap/v1/quote with a key",
    ],
    historicalCoverage: "live-only",
    capabilities: ["live-price", "execution-quote"],
    collects: ["current price", "current executable routes", "price impact", "quote latency"],
    limitations: [
      "Keyless access is intentionally low-rate; production should configure a key.",
      "A quote observed now cannot reconstruct a quote that was never archived.",
    ],
    commercialUseNote: "Use under the Jupiter Developer Platform terms and rate plan.",
    implementationNote: "Price v3 and size-specific USDC→token→USDC quote probes are implemented. Probes can be stored as current execution_quote observations; no swap transaction is built or submitted.",
  },
  {
    id: "pump-onchain",
    label: "Pump and PumpSwap on-chain programs",
    category: "launchpad",
    access: "public",
    automated: true,
    officialUrl: "https://github.com/pump-fun/pump-public-docs",
    documentationUrl: "https://github.com/pump-fun/pump-public-docs/tree/main/docs",
    environmentVariable: PROVIDER_ENV.solanaRpcUrl,
    statusMethod: "configuration-check",
    interfaces: [
      "Solana program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P (Pump bonding curve)",
      "Solana program pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA (PumpSwap AMM)",
      "Implemented exact discriminator decoder: Pump Create/CreateV2/Migrate and PumpSwap CreatePool",
      "Protected bounded archive backfill: POST /api/coins/backfill",
    ],
    historicalCoverage: "canonical-archive",
    capabilities: ["launch-program-events", "canonical-transactions", "creator-history-inputs"],
    collects: ["coin creation", "bonding-curve trades and state", "graduation", "PumpSwap pools and swaps"],
    limitations: [
      "Complete production coverage still requires an archive-capable RPC and a continuously scheduled collector.",
      "The collector must not call or scrape the Pump.fun consumer website.",
      "Decoder and IDL versions must be stored with every derived record.",
    ],
    commercialUseNote: "On-chain facts come through the Solana provider; official SDK and IDL license terms still apply.",
    implementationNote: "Exact official instruction decoding, bounded live discovery, continuation cursors, and protected archive backfill are implemented. No continuous scheduler or complete archive RPC is configured in this deployment.",
  },
  {
    id: "jito",
    label: "Jito Block Engine read-only evidence",
    category: "mev",
    access: "public-rate-limited",
    automated: true,
    officialUrl: "https://www.jito.wtf",
    documentationUrl: "https://docs.jito.wtf/lowlatencytxnsend/",
    environmentVariable: null,
    statusMethod: "live-health-check",
    interfaces: [
      "Implemented read-only probe: JSON-RPC POST mainnet.block-engine.jito.wtf/api/v1/getTipAccounts",
      "Implemented read-only current context: GET bundles.jito.wtf/api/v1/bundles/tip_floor",
      "Evidence collector contract: getBundleStatuses and getInflightBundleStatuses when a bundle ID is already known",
    ],
    historicalCoverage: "live-only",
    capabilities: ["bundle-evidence"],
    collects: ["read-only endpoint health", "known bundle status", "tip-account and tip-floor context"],
    limitations: [
      "Historical bundle IDs cannot generally be recovered from arbitrary old on-chain transactions.",
      "Same-slot ordering and tip transfers are clues, not proof of bundle membership.",
      "All submission and trading methods remain disabled.",
    ],
    commercialUseNote: "Read-only use is rate limited; review Jito terms before production collection.",
    implementationNote: "Current tip-account and tip-floor collection is implemented and network-mocked. Known-bundle lookup is not implemented, and complete historical bundle membership is not claimed.",
  },
  {
    id: "pump-fun-ui",
    label: "Pump.fun website surfaces",
    category: "reference-interface",
    access: "manual-only",
    automated: false,
    officialUrl: "https://pump.fun",
    documentationUrl: null,
    environmentVariable: null,
    statusMethod: "policy-disabled",
    interfaces: ["No automated interface; manual website reference only"],
    historicalCoverage: "none",
    capabilities: ["manual-cross-check"],
    collects: [],
    limitations: ["No licensed public data contract for the UI surfaces was verified; scraping is disabled."],
    commercialUseNote: "Use only as a manual reference until an official licensed API contract is approved.",
  },
  {
    id: "fomo-family",
    label: "Fomo.family",
    category: "reference-interface",
    access: "manual-only",
    automated: false,
    officialUrl: "https://fomo.family",
    documentationUrl: null,
    environmentVariable: null,
    statusMethod: "policy-disabled",
    interfaces: ["No automated interface; manual website reference only"],
    historicalCoverage: "none",
    capabilities: ["manual-cross-check"],
    collects: [],
    limitations: ["No licensed public API contract was verified; automated collection is disabled."],
    commercialUseNote: "Manual comparison only unless the provider grants API and redistribution rights.",
  },
  {
    id: "photon",
    label: "Photon",
    category: "reference-interface",
    access: "manual-only",
    automated: false,
    officialUrl: "https://photon-sol.tinyastro.io",
    documentationUrl: null,
    environmentVariable: null,
    statusMethod: "policy-disabled",
    interfaces: ["No automated interface; manual website reference only"],
    historicalCoverage: "none",
    capabilities: ["manual-cross-check"],
    collects: [],
    limitations: ["No licensed public API contract was verified; automated collection is disabled."],
    commercialUseNote: "Manual comparison only unless the provider grants API and redistribution rights.",
  },
  {
    id: "memescope-net",
    label: "memescope.net",
    category: "reference-interface",
    access: "manual-only",
    automated: false,
    officialUrl: "https://memescope.net/meme-coin-trends.html",
    documentationUrl: null,
    environmentVariable: null,
    statusMethod: "policy-disabled",
    interfaces: ["No automated interface; manual website reference only"],
    historicalCoverage: "none",
    capabilities: ["manual-cross-check"],
    collects: [],
    limitations: ["No licensed public API contract was verified; automated collection is disabled."],
    commercialUseNote: "Manual comparison only unless the provider grants API and redistribution rights.",
  },
] as const;

function credentialStatus(
  configured: boolean,
  configuredMessage: string,
): ProviderStatus {
  return configured
    ? configuredUnverifiedStatus(configuredMessage)
    : notConfiguredStatus("Add the named server environment variable to enable this adapter.");
}

export async function getSourceRegistry(): Promise<SourceRegistryResponse> {
  const [solana, dexScreener, jupiter, jito] = await Promise.all([
    checkSolanaHealth(),
    checkDexScreenerHealth(),
    checkJupiterHealth(),
    checkJitoReadOnlyHealth(),
  ]);
  const statuses: Record<ProviderId, ProviderStatus> = {
    "solana-rpc": resultToStatus(
      solana,
      true,
      solana.ok
        ? `RPC responded at confirmed slot ${solana.data.slot}.`
        : "RPC health check failed.",
    ),
    "dex-screener": resultToStatus(
      dexScreener,
      true,
      dexScreener.ok
        ? `Public API responded with ${dexScreener.data.pairCount} SOL pools.`
        : "DEX Screener health check failed.",
    ),
    helius: credentialStatus(
      Boolean(getHeliusApiKey()),
      "Server key is installed; the public status route does not spend Helius credits.",
    ),
    "solana-tracker": credentialStatus(
      Boolean(getSolanaTrackerApiKey()),
      "Server key is installed; the public status route does not spend Data API quota.",
    ),
    "x-api": credentialStatus(
      Boolean(getXBearerToken()),
      "Server token is installed; the public status route does not spend X API quota.",
    ),
    jupiter: resultToStatus(
      jupiter,
      true,
      getJupiterApiKey()
        ? "Jupiter Price v3 responded using the server key."
        : "Jupiter Price v3 responded in low-rate keyless mode.",
    ),
    "pump-onchain": configuredUnverifiedStatus(
      solana.ok
        ? "Official Pump/PumpSwap decoding and bounded backfill are implemented; the Solana endpoint is reachable, but no continuous collector is claimed."
        : "The decoder and bounded backfill are implemented; the configured Solana endpoint is currently unreachable.",
    ),
    jito: resultToStatus(
      jito,
      true,
      jito.ok
        ? `Jito read-only API returned ${jito.data.tipAccountCount} tip accounts.`
        : "Jito read-only health check failed.",
    ),
    "pump-fun-ui": manualStatus("Manual reference only. No scraper or unofficial UI endpoint is used."),
    "fomo-family": disabledStatus("Automated adapter disabled pending a licensed API contract."),
    photon: disabledStatus("Automated adapter disabled pending a licensed API contract."),
    "memescope-net": disabledStatus("Automated adapter disabled pending a licensed API contract."),
  };

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      scraping: "disabled",
      secrets: "server-only",
      liveTrading: "disabled",
      note: "Provider status describes data connectivity, not signal validity or permission to redistribute data.",
    },
    sources: PROVIDER_DEFINITIONS.map((definition) => ({
      ...definition,
      status: statuses[definition.id],
    })),
  };
}

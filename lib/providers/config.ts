export const PROVIDER_ENV = {
  solanaRpcUrl: "SOLANA_RPC_URL",
  heliusApiKey: "HELIUS_API_KEY",
  solanaTrackerApiKey: "SOLANA_TRACKER_API_KEY",
  xBearerToken: "X_BEARER_TOKEN",
  jupiterApiKey: "JUPITER_API_KEY",
  meteredTokenEnrichment: "TOKEN_ENRICHMENT_METERED_ENABLED",
} as const;

function readSecret(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getHeliusApiKey(): string | null {
  return readSecret(PROVIDER_ENV.heliusApiKey);
}

export function getSolanaTrackerApiKey(): string | null {
  return readSecret(PROVIDER_ENV.solanaTrackerApiKey);
}

export function getXBearerToken(): string | null {
  return readSecret(PROVIDER_ENV.xBearerToken);
}

export function getJupiterApiKey(): string | null {
  return readSecret(PROVIDER_ENV.jupiterApiKey);
}

export function isMeteredTokenEnrichmentEnabled(): boolean {
  return process.env[PROVIDER_ENV.meteredTokenEnrichment]?.trim().toLowerCase() === "true";
}

export function getSolanaRpcConfiguration(): {
  url: URL;
  configured: boolean;
  valid: boolean;
} {
  const configuredValue = readSecret(PROVIDER_ENV.solanaRpcUrl);
  if (!configuredValue) {
    return {
      url: new URL("https://api.mainnet.solana.com"),
      configured: false,
      valid: true,
    };
  }

  try {
    const url = new URL(configuredValue);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return { url, configured: true, valid: true };
  } catch {
    return {
      url: new URL("https://api.mainnet.solana.com"),
      configured: true,
      valid: false,
    };
  }
}

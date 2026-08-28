export const PROVIDER_ENV = {
  solanaRpcUrl: "SOLANA_RPC_URL",
  solanaArchiveRpcUrl: "SOLANA_ARCHIVE_RPC_URL",
  heliusApiKey: "HELIUS_API_KEY",
  solanaTrackerApiKey: "SOLANA_TRACKER_API_KEY",
  xBearerToken: "X_BEARER_TOKEN",
  jupiterApiKey: "JUPITER_API_KEY",
  meteredTokenEnrichment: "TOKEN_ENRICHMENT_METERED_ENABLED",
  backfillAdminToken: "BACKFILL_ADMIN_TOKEN",
  alertsEnabled: "MEMETRACE_ALERTS_ENABLED",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramChatId: "TELEGRAM_CHAT_ID",
  alertProbabilityThreshold: "ALERT_PROBABILITY_THRESHOLD",
  publicAppUrl: "PUBLIC_APP_URL",
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

export function getSolanaArchiveRpcConfiguration(): {
  url: URL | null;
  configured: boolean;
  valid: boolean;
} {
  const configuredValue = readSecret(PROVIDER_ENV.solanaArchiveRpcUrl);
  if (!configuredValue) {
    return { url: null, configured: false, valid: true };
  }

  try {
    const url = new URL(configuredValue);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return { url, configured: true, valid: true };
  } catch {
    return { url: null, configured: true, valid: false };
  }
}

export function getBackfillAdminToken(): string | null {
  return readSecret(PROVIDER_ENV.backfillAdminToken);
}

export function getAlertConfiguration(): {
  enabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  probabilityThreshold: number;
  publicAppUrl: string | null;
} {
  const configuredThreshold = Number.parseFloat(
    process.env[PROVIDER_ENV.alertProbabilityThreshold]?.trim() ?? "",
  );
  const probabilityThreshold = Number.isFinite(configuredThreshold) &&
      configuredThreshold >= 0 && configuredThreshold <= 1
    ? configuredThreshold
    : 0.8;
  const rawAppUrl = readSecret(PROVIDER_ENV.publicAppUrl);
  let publicAppUrl: string | null = null;
  if (rawAppUrl) {
    try {
      const parsed = new URL(rawAppUrl);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost") {
        publicAppUrl = parsed.toString().replace(/\/$/, "");
      }
    } catch {
      publicAppUrl = null;
    }
  }
  return {
    enabled: process.env[PROVIDER_ENV.alertsEnabled]?.trim().toLowerCase() === "true",
    telegramBotToken: readSecret(PROVIDER_ENV.telegramBotToken),
    telegramChatId: readSecret(PROVIDER_ENV.telegramChatId),
    probabilityThreshold,
    publicAppUrl,
  };
}

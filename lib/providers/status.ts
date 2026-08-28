import type {
  ProviderStatus,
  UpstreamFailure,
  UpstreamResult,
} from "./types";

const ERROR_MESSAGES: Record<UpstreamFailure["code"], string> = {
  timeout: "Provider timed out.",
  network_error: "Provider could not be reached.",
  unauthorized: "Configured credential was rejected.",
  forbidden: "Configured credential lacks access.",
  rate_limited: "Provider rate limit reached.",
  upstream_error: "Provider returned an upstream error.",
  invalid_response: "Provider returned an unexpected response.",
  not_configured: "Server credential is not configured.",
  not_supported: "Automated collection is not supported.",
};

export function resultToStatus<T>(
  result: UpstreamResult<T>,
  configured: boolean,
  connectedMessage: string,
): ProviderStatus {
  if (result.ok) {
    return {
      state: "connected",
      configured,
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      message: connectedMessage,
    };
  }

  return {
    state: "degraded",
    configured,
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    message: ERROR_MESSAGES[result.code],
    errorCode: result.code,
    ...(result.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: result.retryAfterSeconds }),
  };
}

export function notConfiguredStatus(message: string): ProviderStatus {
  return {
    state: "not-configured",
    configured: false,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    message,
    errorCode: "not_configured",
  };
}

export function configuredUnverifiedStatus(message: string): ProviderStatus {
  return {
    state: "configured-unverified",
    configured: true,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    message,
  };
}

export function manualStatus(message: string): ProviderStatus {
  return {
    state: "manual-only",
    configured: false,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    message,
    errorCode: "not_supported",
  };
}

export function disabledStatus(message: string): ProviderStatus {
  return {
    state: "disabled",
    configured: false,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    message,
    errorCode: "not_supported",
  };
}

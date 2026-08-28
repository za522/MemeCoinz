import type {
  ProviderErrorCode,
  UpstreamFailure,
  UpstreamResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;

interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, Math.round((retryAt - Date.now()) / 1_000));
}

function statusCodeToError(status: number): ProviderErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}

function failure(
  code: ProviderErrorCode,
  startedAt: number,
  httpStatus: number | null,
  retryAfterSeconds?: number,
): UpstreamFailure {
  return {
    ok: false,
    code,
    checkedAt: new Date().toISOString(),
    latencyMs: Math.max(0, Date.now() - startedAt),
    httpStatus,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

/**
 * Fetch JSON from a provider-owned, server-selected URL.
 *
 * Errors are deliberately reduced to stable codes. Upstream bodies, request
 * URLs, authorization headers, and thrown messages never cross this boundary.
 */
export async function safeFetchJson<T>(
  url: URL,
  options: SafeFetchOptions = {},
): Promise<UpstreamResult<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    ...requestOptions
  } = options;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(url, {
      ...requestOptions,
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...requestOptions.headers,
      },
    });

    if (!response.ok) {
      return failure(
        statusCodeToError(response.status),
        startedAt,
        response.status,
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }

    const declaredLength = Number(response.headers.get("content-length"));
    const maxBytes = maxResponseBytes;
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return failure("invalid_response", startedAt, response.status);
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) {
      return failure("invalid_response", startedAt, response.status);
    }

    try {
      return {
        ok: true,
        data: JSON.parse(body) as T,
        checkedAt: new Date().toISOString(),
        latencyMs: Math.max(0, Date.now() - startedAt),
        httpStatus: response.status,
      };
    } catch {
      return failure("invalid_response", startedAt, response.status);
    }
  } catch (error) {
    return failure(
      error instanceof DOMException && error.name === "AbortError"
        ? "timeout"
        : "network_error",
      startedAt,
      null,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function getRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

export function getArray(value: Record<string, unknown>, key: string): unknown[] {
  const nested = value[key];
  return Array.isArray(nested) ? nested : [];
}

export function isSolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

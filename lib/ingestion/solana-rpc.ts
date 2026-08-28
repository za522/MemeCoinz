import {
  getSolanaArchiveRpcConfiguration,
  getSolanaRpcConfiguration,
} from "@/lib/providers/config";
import { isRecord, safeFetchJson } from "@/lib/providers/http";
import type {
  ProviderErrorCode,
  UpstreamResult,
} from "@/lib/providers/types";
import type { SignatureInfo } from "./types";

interface RpcEnvelope<T = unknown> {
  id?: string | number;
  result?: T;
  error?: { code?: number; message?: string };
}

export interface RpcContext {
  mode: "live" | "archive";
  url: URL;
}

export function getRpcContext(mode: "live" | "archive"): RpcContext | null {
  if (mode === "archive") {
    const archive = getSolanaArchiveRpcConfiguration();
    return archive.valid && archive.url
      ? { mode: "archive", url: archive.url }
      : null;
  }
  const live = getSolanaRpcConfiguration();
  return live.valid ? { mode: "live", url: live.url } : null;
}

function rpcErrorCode(error: RpcEnvelope["error"]): ProviderErrorCode {
  const message = error?.message?.toLowerCase() ?? "";
  if (error?.code === 429 || message.includes("rate limit")) return "rate_limited";
  if (error?.code === -32602 || message.includes("invalid param")) {
    return "invalid_response";
  }
  return "upstream_error";
}

function failure<T>(
  code: ProviderErrorCode,
  checkedAt = new Date().toISOString(),
  latencyMs = 0,
  httpStatus: number | null = null,
): UpstreamResult<T> {
  return { ok: false, code, checkedAt, latencyMs, httpStatus };
}

export async function rpcCall<T>(
  context: RpcContext,
  method: string,
  params: unknown[],
  timeoutMs = 8_000,
): Promise<UpstreamResult<T>> {
  const result = await safeFetchJson<RpcEnvelope<T>>(context.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "memetrace", method, params }),
    timeoutMs,
    maxResponseBytes: 8_000_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data)) {
    return failure(
      "invalid_response",
      result.checkedAt,
      result.latencyMs,
      result.httpStatus,
    );
  }
  const envelope = result.data as RpcEnvelope<T>;
  if (envelope.error || !("result" in envelope)) {
    return failure(
      rpcErrorCode(envelope.error),
      result.checkedAt,
      result.latencyMs,
      result.httpStatus,
    );
  }
  return { ...result, data: envelope.result as T };
}

export async function getSignatures(
  context: RpcContext,
  address: string,
  options: { before?: string; until?: string; limit: number },
): Promise<UpstreamResult<SignatureInfo[]>> {
  const result = await rpcCall<unknown[]>(context, "getSignaturesForAddress", [
    address,
    {
      commitment: "confirmed",
      limit: Math.min(1_000, Math.max(1, options.limit)),
      ...(options.before ? { before: options.before } : {}),
      ...(options.until ? { until: options.until } : {}),
    },
  ]);
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return failure(
      "invalid_response",
      result.checkedAt,
      result.latencyMs,
      result.httpStatus,
    );
  }

  const signatures = result.data.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const signature = typeof entry.signature === "string" ? entry.signature : null;
    const slot = typeof entry.slot === "number" ? entry.slot : null;
    if (!signature || slot === null) return [];
    return [{
      signature,
      slot,
      blockTime: typeof entry.blockTime === "number" ? entry.blockTime : null,
      err: entry.err ?? null,
      confirmationStatus:
        typeof entry.confirmationStatus === "string"
          ? entry.confirmationStatus
          : null,
    }];
  });
  return { ...result, data: signatures };
}

export async function getTransactions(
  context: RpcContext,
  signatures: string[],
): Promise<UpstreamResult<Array<Record<string, unknown> | null>>> {
  if (signatures.length === 0) {
    return {
      ok: true,
      data: [],
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      httpStatus: 200,
    };
  }

  const requests = signatures.map((signature, index) => ({
    jsonrpc: "2.0",
    id: index,
    method: "getTransaction",
    params: [
      signature,
      {
        commitment: "confirmed",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
      },
    ],
  }));
  const result = await safeFetchJson<RpcEnvelope[]>(context.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requests),
    timeoutMs: 15_000,
    maxResponseBytes: 24_000_000,
  });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) {
    return failure(
      "invalid_response",
      result.checkedAt,
      result.latencyMs,
      result.httpStatus,
    );
  }

  const byId = new Map<number, Record<string, unknown> | null>();
  let rpcFailure: ProviderErrorCode | null = null;
  for (const raw of result.data) {
    if (!isRecord(raw) || typeof raw.id !== "number") continue;
    const envelope = raw as RpcEnvelope;
    if (envelope.error) {
      rpcFailure ??= rpcErrorCode(envelope.error);
      byId.set(raw.id, null);
    } else {
      byId.set(raw.id, isRecord(envelope.result) ? envelope.result : null);
    }
  }
  const data = signatures.map((_, index) => byId.get(index) ?? null);
  if (data.every((entry) => entry === null) && rpcFailure) {
    return failure(
      rpcFailure,
      result.checkedAt,
      result.latencyMs,
      result.httpStatus,
    );
  }
  return { ...result, data };
}

export async function getTransactionsChunked(
  context: RpcContext,
  signatures: string[],
  chunkSize = 20,
): Promise<{
  transactions: Array<Record<string, unknown> | null>;
  partial: boolean;
  errorCode?: ProviderErrorCode;
}> {
  const transactions: Array<Record<string, unknown> | null> = [];
  let partial = false;
  let errorCode: ProviderErrorCode | undefined;
  for (let offset = 0; offset < signatures.length; offset += chunkSize) {
    const chunk = signatures.slice(offset, offset + chunkSize);
    const result = await getTransactions(context, chunk);
    if (!result.ok) {
      partial = true;
      errorCode ??= result.code;
      transactions.push(...chunk.map(() => null));
    } else {
      transactions.push(...result.data);
      if (result.data.some((entry) => entry === null)) partial = true;
    }
  }
  return {
    transactions,
    partial,
    ...(errorCode ? { errorCode } : {}),
  };
}

export async function getTokenLargestAccounts(context: RpcContext, mint: string) {
  return rpcCall<unknown>(context, "getTokenLargestAccounts", [
    mint,
    { commitment: "confirmed" },
  ]);
}

export async function getTokenSupplyRpc(context: RpcContext, mint: string) {
  return rpcCall<unknown>(context, "getTokenSupply", [
    mint,
    { commitment: "confirmed" },
  ]);
}

export async function getRecentPrioritizationFeesRpc(
  context: RpcContext,
  writableAccounts: string[],
) {
  return rpcCall<unknown>(context, "getRecentPrioritizationFees", [
    writableAccounts.slice(0, 128),
  ]);
}

import { getSolanaRpcConfiguration } from "./config";
import { asNumber, asString, getRecord, isRecord, safeFetchJson } from "./http";
import type {
  SolanaHealthData,
  SolanaTokenSupply,
  UpstreamResult,
} from "./types";

interface SolanaRpcEnvelope {
  result?: unknown;
  error?: unknown;
}

async function solanaRpc(
  method: string,
  params: unknown[] = [],
): Promise<UpstreamResult<SolanaRpcEnvelope>> {
  const { url } = getSolanaRpcConfiguration();
  return safeFetchJson<SolanaRpcEnvelope>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "memetrace", method, params }),
    timeoutMs: 5_000,
  });
}

function invalidFrom<T>(
  result: UpstreamResult<unknown>,
): UpstreamResult<T> {
  return {
    ok: false,
    code: "invalid_response",
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
  };
}

export async function checkSolanaHealth(): Promise<
  UpstreamResult<SolanaHealthData>
> {
  const configuration = getSolanaRpcConfiguration();
  if (!configuration.valid) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      httpStatus: null,
    };
  }

  const [health, slot] = await Promise.all([
    solanaRpc("getHealth"),
    solanaRpc("getSlot", [{ commitment: "confirmed" }]),
  ]);
  if (!health.ok) return health;
  if (!slot.ok) return slot;

  const healthValue = isRecord(health.data)
    ? asString(health.data.result)
    : null;
  const slotValue = isRecord(slot.data) ? asNumber(slot.data.result) : null;
  if (!healthValue || slotValue === null) return invalidFrom(health);

  return {
    ok: true,
    data: {
      health: healthValue,
      slot: slotValue,
      rpcMode: configuration.configured
        ? "configured-mainnet"
        : "public-mainnet",
    },
    checkedAt: new Date().toISOString(),
    latencyMs: Math.max(health.latencyMs, slot.latencyMs),
    httpStatus: 200,
  };
}

export async function getSolanaTokenSupply(
  mint: string,
): Promise<UpstreamResult<SolanaTokenSupply>> {
  const result = await solanaRpc("getTokenSupply", [
    mint,
    { commitment: "confirmed" },
  ]);
  if (!result.ok) return result;
  if (!isRecord(result.data) || !isRecord(result.data.result)) {
    return invalidFrom(result);
  }

  const context = getRecord(result.data.result, "context");
  const value = getRecord(result.data.result, "value");
  const amount = value ? asString(value.amount) : null;
  const decimals = value ? asNumber(value.decimals) : null;
  const uiAmountString = value ? asString(value.uiAmountString) : null;
  const contextSlot = context ? asNumber(context.slot) : null;

  if (
    amount === null ||
    decimals === null ||
    uiAmountString === null ||
    contextSlot === null
  ) {
    return invalidFrom(result);
  }

  return {
    ok: true,
    data: {
      mint,
      amount,
      decimals,
      uiAmount: value ? asNumber(value.uiAmount) : null,
      uiAmountString,
      contextSlot,
    },
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
  };
}

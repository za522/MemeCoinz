import {
  asNumber,
  asString,
  isRecord,
  isSolanaAddress,
  safeFetchJson,
} from "./http";
import type { JitoTipEvidenceData, JitoTipFloorPoint, UpstreamResult } from "./types";

const JITO_TIP_ACCOUNTS_URL = new URL(
  "https://mainnet.block-engine.jito.wtf/api/v1/getTipAccounts",
);

/** Read-only liveness probe. It never submits a transaction or bundle. */
export async function checkJitoReadOnlyHealth(): Promise<
  UpstreamResult<{ tipAccountCount: number }>
> {
  const result = await safeFetchJson<unknown>(JITO_TIP_ACCOUNTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "memetrace-read-only",
      method: "getTipAccounts",
      params: [],
    }),
    timeoutMs: 5_000,
  });
  if (!result.ok) return result;
  const accounts = isRecord(result.data) && Array.isArray(result.data.result)
    ? result.data.result.flatMap((value) => {
        const account = asString(value);
        return account && isSolanaAddress(account) ? [account] : [];
      })
    : [];
  if (accounts.length === 0) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }
  return { ...result, data: { tipAccountCount: accounts.length } };
}

function normalizeTipAccounts(value: unknown): string[] {
  return isRecord(value) && Array.isArray(value.result)
    ? value.result.flatMap((candidate) => {
        const account = asString(candidate);
        return account && isSolanaAddress(account) ? [account] : [];
      })
    : [];
}

function normalizeTipFloor(value: unknown): JitoTipFloorPoint | null {
  const first = Array.isArray(value) ? value.find(isRecord) : null;
  if (!first) return null;
  const eventAt = asString(first.time);
  if (!eventAt || !Number.isFinite(Date.parse(eventAt))) return null;
  return {
    eventAt: new Date(eventAt).toISOString(),
    landedTips25thPercentileSol: asNumber(first.landed_tips_25th_percentile),
    landedTips50thPercentileSol: asNumber(first.landed_tips_50th_percentile),
    landedTips75thPercentileSol: asNumber(first.landed_tips_75th_percentile),
    landedTips95thPercentileSol: asNumber(first.landed_tips_95th_percentile),
    landedTips99thPercentileSol: asNumber(first.landed_tips_99th_percentile),
    emaLandedTips50thPercentileSol: asNumber(first.ema_landed_tips_50th_percentile),
  };
}

/**
 * Public, read-only current Jito evidence. It does not submit bundles and it
 * cannot discover complete historical bundle membership for arbitrary trades.
 */
export async function getJitoCurrentTipEvidence(): Promise<
  UpstreamResult<JitoTipEvidenceData>
> {
  const [accountsResult, floorResult] = await Promise.all([
    safeFetchJson<unknown>(JITO_TIP_ACCOUNTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "memetrace-read-only",
        method: "getTipAccounts",
        params: [],
      }),
      timeoutMs: 5_000,
    }),
    safeFetchJson<unknown>(
      new URL("https://bundles.jito.wtf/api/v1/bundles/tip_floor"),
      { timeoutMs: 5_000 },
    ),
  ]);
  if (!accountsResult.ok && !floorResult.ok) return accountsResult;
  const tipAccounts = accountsResult.ok ? normalizeTipAccounts(accountsResult.data) : [];
  const latestTipFloor = floorResult.ok ? normalizeTipFloor(floorResult.data) : null;
  if (tipAccounts.length === 0 && latestTipFloor === null) {
    const successful = accountsResult.ok ? accountsResult : floorResult;
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: successful.checkedAt,
      latencyMs: successful.latencyMs,
      httpStatus: successful.httpStatus,
    };
  }
  const observedAt = new Date().toISOString();
  return {
    ok: true,
    data: {
      observedAt,
      tipAccounts,
      latestTipFloor,
      availability: {
        tipAccounts: tipAccounts.length > 0,
        tipFloor: latestTipFloor !== null,
      },
      caveat:
        "This is current network-wide tip context. It does not identify whether a token trade was bundled and provides no complete historical bundle archive.",
    },
    checkedAt: observedAt,
    latencyMs: Math.max(accountsResult.latencyMs, floorResult.latencyMs),
    httpStatus:
      (accountsResult.ok ? accountsResult.httpStatus : null) ??
      (floorResult.ok ? floorResult.httpStatus : 200),
  };
}

import { asString, isRecord, isSolanaAddress, safeFetchJson } from "./http";
import type { UpstreamResult } from "./types";

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

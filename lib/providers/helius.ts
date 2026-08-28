import { getHeliusApiKey } from "./config";
import {
  asBoolean,
  asNumber,
  asString,
  getArray,
  getRecord,
  isRecord,
  safeFetchJson,
} from "./http";
import type {
  HeliusAddressHistoryData,
  HeliusAssetData,
  HeliusHistoricalTransaction,
  HeliusTokenBalanceChange,
  UpstreamResult,
} from "./types";

export interface HeliusAddressHistoryOptions {
  from: string;
  to: string;
  commitment?: "confirmed" | "finalized";
  maxPages?: number;
  maxTransactions?: number;
  /** Wallet queries may include owned token accounts. Mint/program queries should use none. */
  tokenAccounts?: "none" | "balanceChanged" | "all";
}

function notConfigured<T>(): UpstreamResult<T> {
  return {
    ok: false,
    code: "not_configured",
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    httpStatus: null,
  };
}

function getHeliusUrl(apiKey: string): URL {
  const url = new URL("https://mainnet.helius-rpc.com/");
  url.searchParams.set("api-key", apiKey);
  return url;
}

export async function getHeliusAsset(
  mint: string,
): Promise<UpstreamResult<HeliusAssetData>> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return notConfigured();

  const result = await safeFetchJson<unknown>(getHeliusUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "memetrace",
      method: "getAsset",
      params: { id: mint },
    }),
    timeoutMs: 6_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data) || !isRecord(result.data.result)) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  const asset = result.data.result;
  const content = getRecord(asset, "content");
  const metadata = content ? getRecord(content, "metadata") : null;
  const ownership = getRecord(asset, "ownership");
  const tokenInfo = getRecord(asset, "token_info");
  const files = content ? getArray(content, "files") : [];
  const firstFile = files.find(isRecord);

  let mintAuthority: string | null = tokenInfo
    ? asString(tokenInfo.mint_authority)
    : null;
  let freezeAuthority: string | null = tokenInfo
    ? asString(tokenInfo.freeze_authority)
    : null;
  for (const authority of getArray(asset, "authorities")) {
    if (!isRecord(authority)) continue;
    const address = asString(authority.address);
    const scopes = Array.isArray(authority.scopes) ? authority.scopes : [];
    if (!mintAuthority && scopes.includes("mint")) mintAuthority = address;
    if (!freezeAuthority && scopes.includes("freeze")) freezeAuthority = address;
  }

  return {
    ...result,
    data: {
      id: asString(asset.id) ?? mint,
      interface: asString(asset.interface),
      name: metadata ? asString(metadata.name) : null,
      symbol: metadata ? asString(metadata.symbol) : null,
      description: metadata ? asString(metadata.description) : null,
      jsonUri: content ? asString(content.json_uri) : null,
      imageUri: firstFile ? asString(firstFile.cdn_uri) ?? asString(firstFile.uri) : null,
      owner: ownership ? asString(ownership.owner) : null,
      frozen: ownership ? asBoolean(ownership.frozen) : null,
      burnt: asBoolean(asset.burnt),
      tokenSupply: tokenInfo
        ? asString(tokenInfo.supply) ??
          (asNumber(tokenInfo.supply) === null ? null : String(tokenInfo.supply))
        : null,
      decimals: tokenInfo ? asNumber(tokenInfo.decimals) : null,
      mintAuthority,
      freezeAuthority,
      lastIndexedSlot: asNumber(asset.last_indexed_slot),
    },
  };
}

export async function checkHeliusHealth(): Promise<
  UpstreamResult<{ health: string }>
> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return notConfigured();
  const result = await safeFetchJson<unknown>(getHeliusUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "memetrace", method: "getHealth" }),
    timeoutMs: 5_000,
  });
  if (!result.ok) return result;
  const health = isRecord(result.data) ? asString(result.data.result) : null;
  if (!health) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }
  return { ...result, data: { health } };
}

function invalidFrom<T>(result: UpstreamResult<unknown>): UpstreamResult<T> {
  return {
    ok: false,
    code: "invalid_response",
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
  };
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.round(value ?? fallback)));
}

function accountKeys(row: Record<string, unknown>): string[] {
  const transaction = getRecord(row, "transaction");
  const message = transaction ? getRecord(transaction, "message") : null;
  return message
    ? getArray(message, "accountKeys").flatMap((candidate) => {
        if (typeof candidate === "string") return [candidate];
        if (!isRecord(candidate)) return [];
        const pubkey = asString(candidate.pubkey);
        return pubkey ? [pubkey] : [];
      })
    : [];
}

function rawTokenBalance(value: Record<string, unknown>) {
  const amount = getRecord(value, "uiTokenAmount");
  return {
    accountIndex: asNumber(value.accountIndex),
    owner: asString(value.owner),
    mint: asString(value.mint),
    rawAmount: amount ? asString(amount.amount) : null,
    decimals: amount ? asNumber(amount.decimals) : null,
    uiAmount: amount
      ? asNumber(amount.uiAmount) ?? asNumber(amount.uiAmountString)
      : null,
  };
}

function rawDelta(pre: string | null, post: string | null): string | null {
  if (pre === null && post === null) return null;
  try {
    return (BigInt(post ?? "0") - BigInt(pre ?? "0")).toString();
  } catch {
    return null;
  }
}

function tokenBalanceChanges(meta: Record<string, unknown>): HeliusTokenBalanceChange[] {
  const before = getArray(meta, "preTokenBalances")
    .filter(isRecord)
    .map(rawTokenBalance);
  const after = getArray(meta, "postTokenBalances")
    .filter(isRecord)
    .map(rawTokenBalance);
  const keys = new Set(
    [...before, ...after].flatMap((entry) =>
      entry.accountIndex === null || !entry.mint
        ? []
        : [`${entry.accountIndex}:${entry.mint}:${entry.owner ?? ""}`],
    ),
  );
  return [...keys].flatMap((key) => {
    const [indexText, mint, ownerText] = key.split(":");
    const accountIndex = Number(indexText);
    const owner = ownerText || null;
    const pre = before.find(
      (entry) => entry.accountIndex === accountIndex && entry.mint === mint && entry.owner === owner,
    );
    const post = after.find(
      (entry) => entry.accountIndex === accountIndex && entry.mint === mint && entry.owner === owner,
    );
    const preUi = pre?.uiAmount;
    const postUi = post?.uiAmount;
    const uiDelta = preUi == null && postUi == null
      ? null
      : (postUi ?? 0) - (preUi ?? 0);
    return [{
      accountIndex,
      owner,
      mint,
      decimals: post?.decimals ?? pre?.decimals ?? null,
      preRawAmount: pre?.rawAmount ?? null,
      postRawAmount: post?.rawAmount ?? null,
      rawDelta: rawDelta(pre?.rawAmount ?? null, post?.rawAmount ?? null),
      uiDelta,
    }];
  });
}

function normalizeHistoricalTransaction(value: unknown): HeliusHistoricalTransaction | null {
  if (!isRecord(value)) return null;
  const slot = asNumber(value.slot);
  const transaction = getRecord(value, "transaction");
  const signatures = transaction ? getArray(transaction, "signatures") : [];
  const signature = asString(signatures[0]) ?? asString(value.signature);
  if (!signature || slot === null) return null;
  const keys = accountKeys(value);
  const meta = getRecord(value, "meta");
  const preBalances = meta ? getArray(meta, "preBalances") : [];
  const postBalances = meta ? getArray(meta, "postBalances") : [];
  const nativeBalanceChanges = keys.flatMap((account, index) => {
    const preLamports = asNumber(preBalances[index]);
    const postLamports = asNumber(postBalances[index]);
    if (preLamports === null || postLamports === null || preLamports === postLamports) {
      return [];
    }
    return [{
      account,
      preLamports,
      postLamports,
      deltaLamports: postLamports - preLamports,
    }];
  });
  return {
    signature,
    slot,
    transactionIndex: asNumber(value.transactionIndex),
    blockTime: asNumber(value.blockTime),
    confirmationStatus: asString(value.confirmationStatus),
    success: Boolean(meta) && meta?.err == null,
    feeLamports: meta ? asNumber(meta.fee) : null,
    feePayer: keys[0] ?? null,
    accountKeys: keys,
    nativeBalanceChanges,
    tokenBalanceChanges: meta ? tokenBalanceChanges(meta) : [],
    raw: value,
  };
}

/**
 * Helius-exclusive canonical history acceleration. The request is always
 * bounded by time, pages, and transaction count and never submits anything.
 */
export async function getHeliusTransactionsForAddress(
  address: string,
  options: HeliusAddressHistoryOptions,
): Promise<UpstreamResult<HeliusAddressHistoryData>> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return notConfigured();
  const maxPages = boundedInteger(options.maxPages, 2, 5);
  const maxTransactions = boundedInteger(options.maxTransactions, 200, 500);
  const commitment = options.commitment ?? "finalized";
  const fromSeconds = Math.floor(Date.parse(options.from) / 1_000);
  const toSeconds = Math.floor(Date.parse(options.to) / 1_000);
  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      httpStatus: null,
    };
  }

  const transactions: HeliusHistoricalTransaction[] = [];
  let paginationToken: string | null = null;
  let pagesFetched = 0;
  let totalLatencyMs = 0;
  let checkedAt = new Date().toISOString();
  let httpStatus = 200;

  for (let page = 0; page < maxPages && transactions.length < maxTransactions; page += 1) {
    const remaining = maxTransactions - transactions.length;
    const configuration: Record<string, unknown> = {
      transactionDetails: "full",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
      sortOrder: "asc",
      commitment,
      limit: Math.min(100, remaining),
      filters: {
        blockTime: { gte: fromSeconds, lt: toSeconds },
        status: "succeeded",
        ...(options.tokenAccounts && options.tokenAccounts !== "none"
          ? { tokenAccounts: options.tokenAccounts }
          : {}),
      },
      ...(paginationToken ? { paginationToken } : {}),
    };
    const result = await safeFetchJson<unknown>(getHeliusUrl(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "memetrace-history",
        method: "getTransactionsForAddress",
        params: [address, configuration],
      }),
      timeoutMs: 15_000,
      maxResponseBytes: 8_000_000,
    });
    if (!result.ok) {
      if (pagesFetched === 0) return result;
      break;
    }
    checkedAt = result.checkedAt;
    httpStatus = result.httpStatus;
    totalLatencyMs += result.latencyMs;
    if (!isRecord(result.data) || !isRecord(result.data.result)) {
      return invalidFrom(result);
    }
    const pageResult = result.data.result;
    pagesFetched += 1;
    for (const candidate of getArray(pageResult, "data")) {
      const transaction = normalizeHistoricalTransaction(candidate);
      if (transaction && transactions.length < maxTransactions) {
        transactions.push(transaction);
      }
    }
    paginationToken = asString(pageResult.paginationToken);
    if (!paginationToken) break;
  }

  return {
    ok: true,
    data: {
      address,
      requestedFrom: options.from,
      requestedTo: options.to,
      commitment,
      transactions,
      pagesFetched,
      nextPaginationToken: paginationToken,
      truncated: Boolean(paginationToken) || transactions.length >= maxTransactions,
      caveat:
        "Transaction content is canonical ledger data accelerated by Helius. Historical availability latency is reconstructed separately and is not an archived measurement of what this application saw live.",
    },
    checkedAt,
    latencyMs: totalLatencyMs,
    httpStatus,
  };
}

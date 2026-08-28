import { getSolanaTrackerApiKey } from "./config";
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
  SolanaTrackerBundlersData,
  SolanaTrackerDeployerHistoryData,
  SolanaTrackerDeployerToken,
  SolanaTrackerHolder,
  SolanaTrackerHolderChartData,
  SolanaTrackerHoldersData,
  SolanaTrackerLatestToken,
  SolanaTrackerRiskSnapshotData,
  SolanaTrackerTrade,
  SolanaTrackerTradesData,
  SolanaTrackerTokenData,
  UpstreamResult,
} from "./types";

export interface SolanaTrackerBoundedOptions {
  maxPages?: number;
  pageSize?: number;
}

export interface SolanaTrackerTimeBoundedOptions extends SolanaTrackerBoundedOptions {
  from: string;
  to: string;
}

const SOLANA_TRACKER_BASE = "https://data.solanatracker.io";
const SOL_WRAPPED_MINT = "So11111111111111111111111111111111111111112";

function notConfigured<T>(): UpstreamResult<T> {
  return {
    ok: false,
    code: "not_configured",
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    httpStatus: null,
  };
}

function unixSeconds(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return parsed > 10_000_000_000 ? Math.floor(parsed / 1_000) : Math.floor(parsed);
}

function normalizeTrackerToken(
  value: Record<string, unknown>,
  mintFallback = "",
): SolanaTrackerLatestToken | null {
  const token = getRecord(value, "token");
  if (!token) return null;
  const mint = asString(token.mint) ?? mintFallback;
  if (!mint) return null;
  const creation = getRecord(token, "creation");
  const risk = getRecord(value, "risk");
  const pools = getArray(value, "pools")
    .flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const liquidity = getRecord(candidate, "liquidity");
      const price = getRecord(candidate, "price");
      const marketCap = getRecord(candidate, "marketCap");
      const poolAddress = asString(candidate.poolId) ?? asString(candidate.poolAddress);
      if (!poolAddress) return [];
      return [{
        poolAddress,
        market: asString(candidate.market),
        liquidityUsd: liquidity ? asNumber(liquidity.usd) : null,
        priceUsd: price ? asNumber(price.usd) : null,
        marketCapUsd: marketCap ? asNumber(marketCap.usd) : null,
        lpBurnPct: asNumber(candidate.lpBurn),
      }];
    })
    .slice(0, 20);
  const firstPoolRaw = getArray(value, "pools").find(isRecord);
  return {
    mint,
    name: asString(token.name),
    symbol: asString(token.symbol),
    image: asString(token.image),
    description: asString(token.description),
    metadataUri: asString(token.uri),
    createdOn: asString(token.createdOn),
    creator: creation ? asString(creation.creator) : null,
    createdTransaction: creation ? asString(creation.created_tx) : null,
    createdAtUnix: creation
      ? unixSeconds(creation.created_time ?? creation.createdAt)
      : null,
    holders: asNumber(value.holders),
    buys: asNumber(value.buys),
    sells: asNumber(value.sells),
    transactions: asNumber(value.txns),
    riskScore: risk ? asNumber(risk.score) ?? asNumber(risk.rugged) : null,
    curvePercentage: isRecord(firstPoolRaw)
      ? asNumber(firstPoolRaw.curvePercentage)
      : null,
    latestPoolMarket: isRecord(firstPoolRaw) ? asString(firstPoolRaw.market) : null,
    pools,
  };
}

export async function getSolanaTrackerToken(
  mint: string,
): Promise<UpstreamResult<SolanaTrackerTokenData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();

  const url = new URL(
    `/tokens/${encodeURIComponent(mint)}`,
    SOLANA_TRACKER_BASE,
  );
  const result = await safeFetchJson<unknown>(url, {
    headers: { "x-api-key": apiKey },
    timeoutMs: 6_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data)) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  const normalized = normalizeTrackerToken(result.data, mint);
  if (!normalized) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  return {
    ...result,
    data: normalized,
  };
}

export async function getLatestSolanaTrackerTokens(
  page = 1,
): Promise<UpstreamResult<SolanaTrackerLatestToken[]>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const url = new URL("/tokens/latest", SOLANA_TRACKER_BASE);
  url.searchParams.set("page", String(Math.min(10, Math.max(1, page))));
  const result = await safeFetchJson<unknown>(url, {
    headers: { "x-api-key": apiKey },
    timeoutMs: 8_000,
    maxResponseBytes: 8_000_000,
  });
  if (!result.ok) return result;
  const root = Array.isArray(result.data)
    ? result.data
    : isRecord(result.data)
      ? getArray(result.data, "data")
      : null;
  if (!root) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }
  return {
    ...result,
    data: root.flatMap((candidate) => {
      const normalized = isRecord(candidate) ? normalizeTrackerToken(candidate) : null;
      return normalized ? [normalized] : [];
    }),
  };
}

export async function checkSolanaTrackerHealth(): Promise<
  UpstreamResult<{ priceAvailable: boolean }>
> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const url = new URL("/price", SOLANA_TRACKER_BASE);
  url.searchParams.set("token", SOL_WRAPPED_MINT);
  const result = await safeFetchJson<unknown>(url, {
    headers: { "x-api-key": apiKey },
    timeoutMs: 5_000,
  });
  if (!result.ok) return result;
  const price = isRecord(result.data) ? asNumber(result.data.price) : null;
  if (price === null) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }
  return { ...result, data: { priceAvailable: true } };
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

function trackerHeaders(apiKey: string) {
  return { "x-api-key": apiKey };
}

function isoFromUnix(value: unknown): string | null {
  const seconds = unixSeconds(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeTrackerTrade(value: unknown): SolanaTrackerTrade | null {
  if (!isRecord(value)) return null;
  const signature = asString(value.tx) ?? asString(value.signature);
  const eventAt = isoFromUnix(value.time);
  if (!signature || !eventAt) return null;
  const sideValue = asString(value.type)?.toLowerCase();
  return {
    signature,
    side: sideValue === "buy" || sideValue === "sell" ? sideValue : null,
    wallet: asString(value.wallet),
    tokenAmount: asNumber(value.amount),
    priceUsd: asNumber(value.priceUsd),
    volumeUsd: asNumber(value.volume),
    volumeSol: asNumber(value.volumeSol),
    eventAt,
    program: asString(value.program),
    pools: getArray(value, "pools").flatMap((pool) => {
      const address = asString(pool);
      return address ? [address] : [];
    }),
    raw: value,
  };
}

/**
 * Cursor-paginates the documented latest-trades endpoint until the requested
 * lower time bound is crossed or the explicit page/item cap is reached.
 */
export async function getSolanaTrackerTokenTrades(
  mint: string,
  options: SolanaTrackerTimeBoundedOptions,
): Promise<UpstreamResult<SolanaTrackerTradesData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const maxPages = boundedInteger(options.maxPages, 2, 5);
  const pageSize = boundedInteger(options.pageSize, 100, 500);
  const fromMs = Date.parse(options.from);
  const toMs = Date.parse(options.to);
  const trades: SolanaTrackerTrade[] = [];
  let cursor: string | null = null;
  let pagesFetched = 0;
  let totalLatencyMs = 0;
  let checkedAt = new Date().toISOString();
  let httpStatus = 200;
  let crossedLowerBound = false;

  for (let page = 0; page < maxPages && trades.length < maxPages * pageSize; page += 1) {
    const url = new URL(`/trades/${encodeURIComponent(mint)}`, SOLANA_TRACKER_BASE);
    url.searchParams.set("showMeta", "true");
    url.searchParams.set("parseJupiter", "true");
    url.searchParams.set("hideArb", "true");
    url.searchParams.set("sortDirection", "DESC");
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await safeFetchJson<unknown>(url, {
      headers: trackerHeaders(apiKey),
      timeoutMs: 12_000,
      maxResponseBytes: 6_000_000,
    });
    if (!result.ok) {
      if (pagesFetched === 0) return result;
      break;
    }
    checkedAt = result.checkedAt;
    httpStatus = result.httpStatus;
    totalLatencyMs += result.latencyMs;
    if (!isRecord(result.data)) return invalidFrom(result);
    pagesFetched += 1;
    const pageTrades = getArray(result.data, "trades")
      .flatMap((candidate) => {
        const normalized = normalizeTrackerTrade(candidate);
        return normalized ? [normalized] : [];
      });
    for (const trade of pageTrades) {
      const eventMs = Date.parse(trade.eventAt);
      if (eventMs < fromMs) crossedLowerBound = true;
      if (eventMs >= fromMs && eventMs < toMs) trades.push(trade);
    }
    const rawCursor = result.data.nextCursor;
    cursor = asString(rawCursor) ?? (asNumber(rawCursor) === null ? null : String(rawCursor));
    const hasNextPage = asBoolean(result.data.hasNextPage);
    if (hasNextPage === false) cursor = null;
    if (crossedLowerBound || !cursor || pageTrades.length === 0) break;
  }

  trades.sort((left, right) => Date.parse(left.eventAt) - Date.parse(right.eventAt));
  return {
    ok: true,
    data: {
      mint,
      requestedFrom: options.from,
      requestedTo: options.to,
      trades,
      pagesFetched,
      nextCursor: cursor,
      truncated: Boolean(cursor) && !crossedLowerBound,
      caveat:
        "Trade event times and at-trade prices are indexed provider fields. Actual Solana Tracker ingestion latency is not archived, so collector availability is recorded at retrieval until the signature is canonically reconciled.",
    },
    checkedAt,
    latencyMs: totalLatencyMs,
    httpStatus,
  };
}

function normalizeHolder(value: unknown): SolanaTrackerHolder | null {
  if (!isRecord(value)) return null;
  const wallet = asString(value.wallet) ?? asString(value.address);
  if (!wallet) return null;
  const holderValue = getRecord(value, "value");
  return {
    wallet,
    tokenAccount: asString(value.account),
    amount: asNumber(value.amount),
    valueUsd: holderValue ? asNumber(holderValue.usd) : asNumber(value.valueUsd),
    percentage: asNumber(value.percentage),
  };
}

/** Current holder distribution. This endpoint is never represented as historical. */
export async function getSolanaTrackerTokenHolders(
  mint: string,
  options: SolanaTrackerBoundedOptions = {},
): Promise<UpstreamResult<SolanaTrackerHoldersData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const maxPages = boundedInteger(options.maxPages, 1, 3);
  const pageSize = boundedInteger(options.pageSize, 100, 500);
  const holders: SolanaTrackerHolder[] = [];
  const asOf = new Date().toISOString();
  let cursor: string | null = null;
  let pagesFetched = 0;
  let totalHolders: number | null = null;
  let totalLatencyMs = 0;
  let checkedAt = asOf;
  let httpStatus = 200;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(
      `/tokens/${encodeURIComponent(mint)}/holders/paginated`,
      SOLANA_TRACKER_BASE,
    );
    url.searchParams.set("limit", String(pageSize));
    if (cursor) url.searchParams.set("cursor", cursor);
    const result = await safeFetchJson<unknown>(url, {
      headers: trackerHeaders(apiKey),
      timeoutMs: 12_000,
      maxResponseBytes: 5_000_000,
    });
    if (!result.ok) {
      if (pagesFetched === 0) return result;
      break;
    }
    checkedAt = result.checkedAt;
    httpStatus = result.httpStatus;
    totalLatencyMs += result.latencyMs;
    if (!isRecord(result.data)) return invalidFrom(result);
    pagesFetched += 1;
    totalHolders = asNumber(result.data.total) ?? totalHolders;
    holders.push(...getArray(result.data, "accounts").flatMap((candidate) => {
      const holder = normalizeHolder(candidate);
      return holder ? [holder] : [];
    }));
    cursor = asString(result.data.cursor);
    if (asBoolean(result.data.hasMore) === false) cursor = null;
    if (!cursor) break;
  }

  return {
    ok: true,
    data: {
      mint,
      totalHolders,
      holders,
      pagesFetched,
      nextCursor: cursor,
      truncated: Boolean(cursor),
      asOf,
      caveat:
        "This is a mutable holder snapshot observed at retrieval. Wallet labels and beneficial ownership are not inferred, and token accounts are not treated as people.",
    },
    checkedAt,
    latencyMs: totalLatencyMs,
    httpStatus,
  };
}

export async function getSolanaTrackerHolderChart(
  mint: string,
  options: SolanaTrackerTimeBoundedOptions & { interval?: string },
): Promise<UpstreamResult<SolanaTrackerHolderChartData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const interval = options.interval ?? "1m";
  const url = new URL(`/holders/chart/${encodeURIComponent(mint)}`, SOLANA_TRACKER_BASE);
  url.searchParams.set("type", interval);
  url.searchParams.set("time_from", String(Math.floor(Date.parse(options.from) / 1_000)));
  url.searchParams.set("time_to", String(Math.floor(Date.parse(options.to) / 1_000)));
  const result = await safeFetchJson<unknown>(url, {
    headers: trackerHeaders(apiKey),
    timeoutMs: 10_000,
    maxResponseBytes: 2_000_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data)) return invalidFrom(result);
  const points = getArray(result.data, "holders").flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const holderCount = asNumber(candidate.holders);
    const eventAt = isoFromUnix(candidate.time);
    return holderCount !== null && eventAt ? [{ holderCount, eventAt }] : [];
  });
  return {
    ...result,
    data: {
      mint,
      requestedFrom: options.from,
      requestedTo: options.to,
      interval,
      points,
      caveat:
        "Historical holder counts are vendor time-series points. They may be revised and do not provide owner-level historical balances or the original publication latency.",
    },
  };
}

export async function getSolanaTrackerTokenBundlers(
  mint: string,
): Promise<UpstreamResult<SolanaTrackerBundlersData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const url = new URL(`/tokens/${encodeURIComponent(mint)}/bundlers`, SOLANA_TRACKER_BASE);
  const result = await safeFetchJson<unknown>(url, {
    headers: trackerHeaders(apiKey),
    timeoutMs: 10_000,
    maxResponseBytes: 4_000_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data)) return invalidFrom(result);
  const root = getRecord(result.data, "bundlers") ?? result.data;
  const wallets = getArray(root, "wallets").flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const wallet = asString(candidate.wallet);
    if (!wallet) return [];
    return [{
      wallet,
      initialBalance: asNumber(candidate.initialBalance),
      initialPercentage: asNumber(candidate.initialPercentage),
      currentBalance: asNumber(candidate.balance) ?? asNumber(candidate.currentBalance),
      currentPercentage: asNumber(candidate.percentage) ?? asNumber(candidate.currentPercentage),
      bundleAt: isoFromUnix(candidate.bundleTime),
    }];
  }).slice(0, 500);
  return {
    ...result,
    data: {
      mint,
      count: asNumber(root.count),
      totalBalance: asNumber(root.totalBalance),
      totalPercentage: asNumber(root.totalPercentage),
      totalInitialBalance: asNumber(root.totalInitialBalance),
      totalInitialPercentage: asNumber(root.totalInitialPercentage),
      wallets,
      asOf: result.checkedAt,
      caveat:
        "Solana Tracker bundler classification is provider analysis, not proof of common control, intent, or wrongdoing. Exchanges and popular bots can create false relationships.",
      raw: result.data,
    },
  };
}

function nestedPercentage(root: Record<string, unknown> | null): number | null {
  return root
    ? asNumber(root.totalPercentage) ?? asNumber(root.percentage)
    : null;
}

/** Current provider risk snapshot; all mutable fields are stamped at retrieval. */
export async function getSolanaTrackerRiskSnapshot(
  mint: string,
): Promise<UpstreamResult<SolanaTrackerRiskSnapshotData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const url = new URL(`/tokens/${encodeURIComponent(mint)}`, SOLANA_TRACKER_BASE);
  const result = await safeFetchJson<unknown>(url, {
    headers: trackerHeaders(apiKey),
    timeoutMs: 10_000,
    maxResponseBytes: 5_000_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data)) return invalidFrom(result);
  const risk = getRecord(result.data, "risk");
  const token = getRecord(result.data, "token");
  const creation = token ? getRecord(token, "creation") : null;
  const firstPool = getArray(result.data, "pools").find(isRecord);
  const security = firstPool ? getRecord(firstPool, "security") : null;
  const developer = risk ? getRecord(risk, "dev") : null;
  const factors = risk
    ? getArray(risk, "risks").flatMap((candidate) => {
        if (!isRecord(candidate)) return [];
        return [{
          name: asString(candidate.name),
          description: asString(candidate.description),
          level: asString(candidate.level),
          score: asNumber(candidate.score),
        }];
      })
    : [];
  const bundlers = risk ? getRecord(risk, "bundlers") : null;
  return {
    ...result,
    data: {
      mint,
      score: risk ? asNumber(risk.score) : null,
      rugged: risk ? asBoolean(risk.rugged) : null,
      deployer:
        (firstPool ? asString(firstPool.deployer) : null) ??
        (creation ? asString(creation.creator) : null),
      mintAuthority: security ? asString(security.mintAuthority) : null,
      freezeAuthority: security ? asString(security.freezeAuthority) : null,
      topTenPercentage: risk ? asNumber(risk.top10) : null,
      developerPercentage: nestedPercentage(developer),
      insiderPercentage: nestedPercentage(risk ? getRecord(risk, "insiders") : null),
      sniperPercentage: nestedPercentage(risk ? getRecord(risk, "snipers") : null),
      bundlerCount: bundlers ? asNumber(bundlers.count) : null,
      bundlerPercentage: nestedPercentage(bundlers),
      factors,
      asOf: result.checkedAt,
      caveat:
        "Risk, insider, sniper, bundler, and developer fields are mutable Solana Tracker classifications observed now. They are probabilistic inputs, not historical facts or proof of misconduct.",
      raw: result.data,
    },
  };
}

function normalizeDeployerToken(value: unknown): SolanaTrackerDeployerToken | null {
  if (!isRecord(value)) return null;
  const mint = asString(value.mint) ?? asString(value.tokenAddress);
  if (!mint) return null;
  const status = asString(value.status)?.toLowerCase();
  return {
    mint,
    name: asString(value.name),
    symbol: asString(value.symbol),
    createdAt: isoFromUnix(value.createdAt),
    graduated:
      status === "graduated" ? true : status === "default" || status === "graduating" ? false : null,
    marketCapUsd: asNumber(value.marketCapUsd),
    liquidityUsd: asNumber(value.liquidityUsd),
  };
}

export async function getSolanaTrackerDeployerTokens(
  wallet: string,
  options: SolanaTrackerBoundedOptions = {},
): Promise<UpstreamResult<SolanaTrackerDeployerHistoryData>> {
  const apiKey = getSolanaTrackerApiKey();
  if (!apiKey) return notConfigured();
  const maxPages = boundedInteger(options.maxPages, 2, 5);
  const pageSize = boundedInteger(options.pageSize, 100, 500);
  const tokens: SolanaTrackerDeployerToken[] = [];
  const asOf = new Date().toISOString();
  let pagesFetched = 0;
  let total: number | null = null;
  let hasMore = true;
  let totalLatencyMs = 0;
  let checkedAt = asOf;
  let httpStatus = 200;

  for (let page = 1; page <= maxPages && hasMore; page += 1) {
    const url = new URL(`/deployer/${encodeURIComponent(wallet)}`, SOLANA_TRACKER_BASE);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(pageSize));
    const result = await safeFetchJson<unknown>(url, {
      headers: trackerHeaders(apiKey),
      timeoutMs: 10_000,
      maxResponseBytes: 5_000_000,
    });
    if (!result.ok) {
      if (pagesFetched === 0) return result;
      break;
    }
    checkedAt = result.checkedAt;
    httpStatus = result.httpStatus;
    totalLatencyMs += result.latencyMs;
    if (!isRecord(result.data)) return invalidFrom(result);
    pagesFetched += 1;
    total = asNumber(result.data.total) ?? total;
    const rawRows = getArray(result.data, "data");
    const rows = (rawRows.length ? rawRows : getArray(result.data, "tokens")).flatMap((candidate) => {
      const token = normalizeDeployerToken(candidate);
      return token ? [token] : [];
    });
    tokens.push(...rows);
    const pages = asNumber(result.data.pages);
    hasMore = asBoolean(result.data.hasMore) ?? (pages !== null && page < pages);
    if (rows.length === 0) hasMore = false;
  }

  return {
    ok: true,
    data: {
      wallet,
      tokens,
      pagesFetched,
      nextPage: hasMore ? pagesFetched + 1 : null,
      truncated: hasMore,
      total,
      asOf,
      caveat:
        "Deployer history is provider-indexed and may omit launches or change as attribution improves. It does not establish beneficial ownership across wallets.",
    },
    checkedAt,
    latencyMs: totalLatencyMs,
    httpStatus,
  };
}

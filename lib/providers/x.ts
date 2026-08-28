import { getXBearerToken } from "./config";
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
  UpstreamResult,
  XArchiveMode,
  XContractCountsData,
  XIdentityQuery,
  XPostPublicMetrics,
  XPostRecord,
  XPostSearchData,
  XRecentCountsData,
} from "./types";

export type XCountGranularity = "minute" | "hour" | "day";

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

export interface XCollectionOptions {
  identity: XIdentityQuery;
  startTime: string;
  endTime: string;
  mode?: XArchiveMode | "auto";
  maxPages?: number;
  maxResults?: number;
}

export interface XCountCollectionOptions extends XCollectionOptions {
  granularity?: XCountGranularity;
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

function quotePhrase(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * X identities are deliberately contract-first. Full names and URLs are only
 * accepted as exact phrases and retain their match class downstream.
 */
export function buildXIdentityQuery(identity: XIdentityQuery): string {
  const clauses = [quotePhrase(identity.contractAddress.trim())];
  const fullName = identity.fullName?.trim();
  if (fullName && fullName.length >= 2) clauses.push(quotePhrase(fullName));
  for (const officialUrl of [...new Set(identity.officialUrls ?? [])].slice(0, 4)) {
    const normalized = officialUrl.trim();
    if (normalized) clauses.push(quotePhrase(normalized));
  }
  return `(${clauses.join(" OR ")}) -is:retweet`;
}

function queryIdentityClasses(
  identity: XIdentityQuery,
): XContractCountsData["identityClasses"] {
  const classes: XContractCountsData["identityClasses"] = ["exact-contract"];
  if ((identity.fullName?.trim().length ?? 0) >= 2) classes.push("full-name");
  if ((identity.officialUrls ?? []).some((value) => value.trim().length > 0)) {
    classes.push("official-url");
  }
  return classes;
}

function chooseMode(startTime: string, requested: XCollectionOptions["mode"]): XArchiveMode {
  if (requested && requested !== "auto") return requested;
  return Date.parse(startTime) >= Date.now() - RECENT_WINDOW_MS
    ? "recent"
    : "full-archive";
}

function metric(record: Record<string, unknown> | null, key: string): number | null {
  return record ? asNumber(record[key]) : null;
}

function publicMetrics(value: unknown): XPostPublicMetrics {
  const record = isRecord(value) ? value : null;
  return {
    retweetCount: metric(record, "retweet_count"),
    replyCount: metric(record, "reply_count"),
    likeCount: metric(record, "like_count"),
    quoteCount: metric(record, "quote_count"),
    bookmarkCount: metric(record, "bookmark_count"),
    impressionCount: metric(record, "impression_count"),
  };
}

function expandedUrls(post: Record<string, unknown>): string[] {
  const entities = getRecord(post, "entities");
  return entities
    ? getArray(entities, "urls").flatMap((candidate) => {
        if (!isRecord(candidate)) return [];
        const url = asString(candidate.expanded_url) ?? asString(candidate.unwound_url);
        return url ? [url] : [];
      })
    : [];
}

function identityMatches(
  post: Record<string, unknown>,
  identity: XIdentityQuery,
): XPostRecord["identityMatches"] {
  const text = asString(post.text) ?? "";
  const lowerText = text.toLowerCase();
  const urls = expandedUrls(post).map((url) => url.toLowerCase());
  const matches: XPostRecord["identityMatches"] = [];
  if (text.includes(identity.contractAddress)) matches.push("exact-contract");
  const fullName = identity.fullName?.trim().toLowerCase();
  if (fullName && lowerText.includes(fullName)) matches.push("full-name");
  const officialUrls = (identity.officialUrls ?? []).map((url) => url.toLowerCase());
  if (
    officialUrls.some(
      (officialUrl) => lowerText.includes(officialUrl) || urls.includes(officialUrl),
    )
  ) {
    matches.push("official-url");
  }
  return matches;
}

function usersById(root: Record<string, unknown>) {
  const includes = getRecord(root, "includes");
  const observedAt = new Date().toISOString();
  return new Map(
    (includes ? getArray(includes, "users") : []).flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const id = asString(candidate.id);
      if (!id) return [];
      const metrics = getRecord(candidate, "public_metrics");
      return [[id, {
        username: asString(candidate.username),
        name: asString(candidate.name),
        verified: asBoolean(candidate.verified),
        followersCount: metrics ? asNumber(metrics.followers_count) : null,
        profileObservedAt: observedAt,
      }] as const];
    }),
  );
}

function normalizePost(
  value: unknown,
  identity: XIdentityQuery,
  authors: ReturnType<typeof usersById>,
  observedAt: string,
): XPostRecord | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const createdAt = asString(value.created_at);
  if (!id || !createdAt || !Number.isFinite(Date.parse(createdAt))) return null;
  const authorId = asString(value.author_id);
  return {
    id,
    authorId,
    createdAt: new Date(createdAt).toISOString(),
    text: asString(value.text),
    lang: asString(value.lang),
    identityMatches: identityMatches(value, identity),
    publicMetrics: publicMetrics(value.public_metrics),
    publicMetricsObservedAt: observedAt,
    author: authorId ? authors.get(authorId) ?? null : null,
  };
}

/** Bounded recent or full-archive Post search with explicit pagination. */
export async function searchXIdentityPosts(
  options: XCollectionOptions,
): Promise<UpstreamResult<XPostSearchData>> {
  const bearerToken = getXBearerToken();
  if (!bearerToken) return notConfigured();
  const mode = chooseMode(options.startTime, options.mode);
  const maxPages = boundedInteger(options.maxPages, 2, 5);
  const maximumResults = boundedInteger(options.maxResults, 200, 500);
  const providerPageMaximum = mode === "full-archive" ? 500 : 100;
  const query = buildXIdentityQuery(options.identity);
  const posts: XPostRecord[] = [];
  let nextToken: string | null = null;
  let pagesFetched = 0;
  let totalLatencyMs = 0;
  let firstStatus = 200;
  let checkedAt = new Date().toISOString();

  for (let page = 0; page < maxPages && posts.length < maximumResults; page += 1) {
    const url = new URL(
      mode === "recent"
        ? "https://api.x.com/2/tweets/search/recent"
        : "https://api.x.com/2/tweets/search/all",
    );
    url.searchParams.set("query", query);
    url.searchParams.set("start_time", options.startTime);
    url.searchParams.set("end_time", options.endTime);
    // X enforces a minimum of 10 even when the caller wants fewer retained
    // records; extra returned rows are discarded by the local item cap.
    url.searchParams.set(
      "max_results",
      String(Math.max(10, Math.min(providerPageMaximum, maximumResults - posts.length))),
    );
    url.searchParams.set(
      "tweet.fields",
      "id,author_id,created_at,lang,public_metrics,entities",
    );
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
    if (nextToken) url.searchParams.set("next_token", nextToken);

    const result = await safeFetchJson<unknown>(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      timeoutMs: 10_000,
      maxResponseBytes: 5_000_000,
    });
    if (!result.ok) {
      if (pagesFetched === 0) return result;
      break;
    }
    checkedAt = result.checkedAt;
    firstStatus = result.httpStatus;
    totalLatencyMs += result.latencyMs;
    if (!isRecord(result.data)) return invalidFrom(result);
    pagesFetched += 1;
    const observedAt = result.checkedAt;
    const authors = usersById(result.data);
    for (const candidate of getArray(result.data, "data")) {
      const post = normalizePost(candidate, options.identity, authors, observedAt);
      if (post && posts.length < maximumResults) posts.push(post);
    }
    const meta = getRecord(result.data, "meta");
    nextToken = meta
      ? asString(meta.next_token) ?? asString(meta.pagination_token)
      : null;
    if (!nextToken) break;
  }

  return {
    ok: true,
    data: {
      query,
      mode,
      requestedStart: options.startTime,
      requestedEnd: options.endTime,
      posts,
      pagesFetched,
      nextToken,
      truncated: Boolean(nextToken) || posts.length >= maximumResults,
      caveat:
        "Post timestamps describe publication time, not when X indexing or this collector first exposed the row. Public engagement and author-profile metrics are mutable current values observed at retrieval, not historical snapshots at publication.",
    },
    checkedAt,
    latencyMs: totalLatencyMs,
    httpStatus: firstStatus,
  };
}

/** Bounded recent or full-archive count collection over the same identity query. */
export async function getXIdentityCounts(
  options: XCountCollectionOptions,
): Promise<UpstreamResult<XContractCountsData>> {
  const bearerToken = getXBearerToken();
  if (!bearerToken) return notConfigured();
  const mode = chooseMode(options.startTime, options.mode);
  const maxPages = boundedInteger(options.maxPages, 2, 5);
  const granularity = options.granularity ?? "hour";
  const query = buildXIdentityQuery(options.identity);
  const buckets: XContractCountsData["buckets"] = [];
  let nextToken: string | null = null;
  let pagesFetched = 0;
  let totalLatencyMs = 0;
  let firstStatus = 200;
  let checkedAt = new Date().toISOString();

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(
      mode === "recent"
        ? "https://api.x.com/2/tweets/counts/recent"
        : "https://api.x.com/2/tweets/counts/all",
    );
    url.searchParams.set("query", query);
    url.searchParams.set("start_time", options.startTime);
    url.searchParams.set("end_time", options.endTime);
    url.searchParams.set("granularity", granularity);
    if (nextToken) url.searchParams.set("next_token", nextToken);

    const result = await safeFetchJson<unknown>(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      timeoutMs: 10_000,
      maxResponseBytes: 2_000_000,
    });
    if (!result.ok) {
      if (pagesFetched === 0) return result;
      break;
    }
    checkedAt = result.checkedAt;
    firstStatus = result.httpStatus;
    totalLatencyMs += result.latencyMs;
    if (!isRecord(result.data)) return invalidFrom(result);
    pagesFetched += 1;
    for (const candidate of getArray(result.data, "data")) {
      if (!isRecord(candidate)) continue;
      const start = asString(candidate.start);
      const end = asString(candidate.end);
      const postCount = asNumber(candidate.post_count) ?? asNumber(candidate.tweet_count);
      if (start && end && postCount !== null) buckets.push({ start, end, postCount });
    }
    const meta = getRecord(result.data, "meta");
    nextToken = meta
      ? asString(meta.next_token) ?? asString(meta.pagination_token)
      : null;
    if (!nextToken || mode === "recent") break;
  }

  buckets.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  return {
    ok: true,
    data: {
      query,
      mode,
      requestedStart: options.startTime,
      requestedEnd: options.endTime,
      identityClasses: queryIdentityClasses(options.identity),
      totalPostCount: buckets.reduce((sum, bucket) => sum + bucket.postCount, 0),
      granularity,
      buckets,
      pagesFetched,
      nextToken,
      truncated: Boolean(nextToken),
    },
    checkedAt,
    latencyMs: totalLatencyMs,
    httpStatus: firstStatus,
  };
}

/** Backwards-compatible recent seven-day exact-contract count helper. */
export async function getXRecentContractCounts(
  mint: string,
  granularity: XCountGranularity = "hour",
): Promise<UpstreamResult<XRecentCountsData>> {
  const endTime = new Date(Date.now() - 30_000).toISOString();
  const startTime = new Date(Date.parse(endTime) - RECENT_WINDOW_MS + 60_000).toISOString();
  const result = await getXIdentityCounts({
    identity: { contractAddress: mint },
    startTime,
    endTime,
    mode: "recent",
    maxPages: 1,
    granularity,
  });
  if (!result.ok) return result;
  return {
    ...result,
    data: {
      query: result.data.query,
      totalPostCount: result.data.totalPostCount,
      granularity: result.data.granularity,
      buckets: result.data.buckets,
    },
  };
}

import { getXBearerToken } from "./config";
import {
  asNumber,
  asString,
  getArray,
  getRecord,
  isRecord,
  safeFetchJson,
} from "./http";
import type { UpstreamResult, XRecentCountsData } from "./types";

export type XCountGranularity = "minute" | "hour" | "day";

function notConfigured<T>(): UpstreamResult<T> {
  return {
    ok: false,
    code: "not_configured",
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    httpStatus: null,
  };
}

/** Recent seven-day counts. The exact contract address is always included. */
export async function getXRecentContractCounts(
  mint: string,
  granularity: XCountGranularity = "hour",
): Promise<UpstreamResult<XRecentCountsData>> {
  const bearerToken = getXBearerToken();
  if (!bearerToken) return notConfigured();

  const query = `"${mint}" -is:retweet`;
  const url = new URL("https://api.x.com/2/tweets/counts/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("granularity", granularity);

  const result = await safeFetchJson<unknown>(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
    timeoutMs: 7_000,
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

  const buckets = getArray(result.data, "data").flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const start = asString(candidate.start);
    const end = asString(candidate.end);
    const postCount =
      asNumber(candidate.post_count) ?? asNumber(candidate.tweet_count);
    return start && end && postCount !== null ? [{ start, end, postCount }] : [];
  });
  const meta = getRecord(result.data, "meta");
  const totalFromMeta = meta
    ? asNumber(meta.total_post_count) ?? asNumber(meta.total_tweet_count)
    : null;

  return {
    ...result,
    data: {
      query,
      granularity,
      totalPostCount:
        totalFromMeta ?? buckets.reduce((sum, bucket) => sum + bucket.postCount, 0),
      buckets,
    },
  };
}

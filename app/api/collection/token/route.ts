import { collectTokenResearchInputs } from "@/lib/collection";
import type { CoinListItem } from "@/lib/coins/types";
import { getCoinDetail } from "@/lib/ingestion/service";
import { isSolanaAddress } from "@/lib/providers";
import { getBackfillAdminToken } from "@/lib/providers/config";

const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1_000;
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Data": "bounded-real-provider-observations",
  "X-Automatic-Trading": "disabled",
};

function invalid(message: string) {
  return Response.json(
    { error: "invalid_request", message },
    { status: 400, headers },
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function parseIso(value: unknown, fallback: Date): string | null {
  if (value === undefined || value === null) return fallback.toISOString();
  if (typeof value !== "string" || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseSizes(value: unknown): number[] | null {
  if (value === undefined || value === null) return [25, 100, 500];
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return null;
  const values = value.map(Number);
  if (values.some((size) => !Number.isFinite(size) || size < 1 || size > 10_000)) {
    return null;
  }
  return [...new Set(values)];
}

function officialUrls(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 4 || value.some((item) => typeof item !== "string")) {
    return null;
  }
  try {
    return value.map((candidate) => {
      if (candidate.length > 500) throw new Error("URL too long");
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
      return parsed.toString();
    });
  } catch {
    return null;
  }
}

/** Status-only: a GET never invokes providers, consumes quota, or writes D1. */
export async function GET() {
  return Response.json(
    {
      schemaVersion: "memetrace-token-collection-control/v1",
      executionMethod: "POST",
      authentication: "x-backfill-token",
      configured: Boolean(getBackfillAdminToken()),
      meteredCallsOnGet: false,
      persistenceOnGet: false,
      trading: "disabled",
      note:
        "Use an authenticated bounded POST to execute collection. This status endpoint performs no upstream requests.",
    },
    { status: 200, headers },
  );
}

/**
 * Authenticated, bounded, read-only provider collection. The only write is the
 * normalized observation archive; no transaction is built, signed, or sent.
 */
export async function POST(request: Request) {
  const configuredToken = getBackfillAdminToken();
  if (!configuredToken) {
    return Response.json(
      {
        error: "collection_not_configured",
        message: "Set BACKFILL_ADMIN_TOKEN before invoking metered collection.",
      },
      { status: 503, headers },
    );
  }
  const providedToken = request.headers.get("x-backfill-token") ?? "";
  if (!constantTimeEqual(configuredToken, providedToken)) {
    return Response.json(
      { error: "unauthorized", message: "A valid x-backfill-token header is required." },
      { status: 401, headers },
    );
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return invalid("Request body must be one JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return invalid("Request body must be valid JSON.");
  }
  const mint = typeof body.mint === "string" ? body.mint.trim() : "";
  if (!isSolanaAddress(mint)) {
    return invalid("mint must be one 32–44 character base58 Solana address.");
  }
  const to = parseIso(body.to, new Date());
  const from = parseIso(
    body.from,
    new Date(Date.parse(to ?? new Date().toISOString()) - 60 * 60 * 1_000),
  );
  if (!from || !to) return invalid("from and to must be ISO-8601 timestamps.");
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (fromMs >= toMs) return invalid("from must be earlier than to; to is exclusive.");
  if (toMs - fromMs > MAX_WINDOW_MS) {
    return invalid("One collection request may cover at most 31 days; page longer studies by time window.");
  }
  if (toMs > Date.now() + 60_000) return invalid("to cannot be in the future.");
  const maxPages = body.maxPages === undefined ? 2 : Number(body.maxPages);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) {
    return invalid("maxPages must be an integer from 1 to 5.");
  }
  const sizes = parseSizes(body.orderSizesUsd);
  if (!sizes) return invalid("orderSizesUsd must contain 1–4 numeric values from 1 to 10000.");
  const slippageBps = body.slippageBps === undefined ? 100 : Number(body.slippageBps);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1_000) {
    return invalid("slippageBps must be an integer from 1 to 1000.");
  }
  const fullName = body.fullName === undefined || body.fullName === null
    ? null
    : typeof body.fullName === "string"
      ? body.fullName.trim()
      : null;
  if (body.fullName !== undefined && body.fullName !== null && fullName === null) {
    return invalid("fullName must be a string.");
  }
  if (fullName && fullName.length > 100) return invalid("fullName must be at most 100 characters.");
  const urls = officialUrls(body.officialUrls);
  if (!urls) return invalid("officialUrls accepts at most four HTTPS URL strings.");
  if (body.persist !== undefined && typeof body.persist !== "boolean") {
    return invalid("persist must be a boolean when supplied.");
  }
  let persistCoin: CoinListItem | null = null;
  if (body.persist !== false) {
    try {
      const detail = await getCoinDetail(mint, { historyLimit: 1, persist: true });
      persistCoin = detail.coin;
    } catch {
      // Collection remains nonfatal and returns an explicit persistence state.
    }
  }
  const response = await collectTokenResearchInputs(mint, {
    from,
    to,
    maxPages,
    orderSizesUsd: sizes,
    slippageBps,
    identity: { fullName, officialUrls: urls },
    allowMetered: true,
    persistCoin,
  });
  return Response.json(response, { status: 200, headers });
}

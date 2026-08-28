import {
  PIPELINE_LIMITS,
  runResearchPipeline,
  type PipelineDiscoverySource,
  type ResearchPipelineOptions,
} from "@/lib/pipeline";
import { getBackfillAdminToken } from "@/lib/providers/config";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Research-Pipeline": "bounded-protected-manual-run",
  "X-Automatic-Trading": "disabled",
  "X-Transaction-Submission": "disabled",
};

const knownFields = new Set([
  "maxCoins",
  "maxDiscoveryPages",
  "discoverySource",
  "historyLimit",
  "collectAdvanced",
  "allowMetered",
  "collectionMaxPages",
  "collectionWindowHours",
  "orderSizesUsd",
  "slippageBps",
  "horizonSeconds",
  "orderSizeUsd",
  "maxOutcomeSnapshots",
  "runTelegramAlerts",
  "telegramDryRun",
  "telegramLimit",
  "evaluatedAt",
]);

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

function invalid(reason: string, status = 400): Response {
  return Response.json(
    { status: "invalid-request", reason },
    { status, headers },
  );
}

function integer(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value as number;
}

function finite(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function boolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}

function parseOptions(body: Record<string, unknown>): ResearchPipelineOptions {
  const unknownFields = Object.keys(body).filter((field) => !knownFields.has(field));
  if (unknownFields.length) {
    throw new Error(`Unknown request field${unknownFields.length === 1 ? "" : "s"}: ${unknownFields.join(", ")}.`);
  }
  const discoverySource = body.discoverySource;
  if (
    discoverySource !== undefined &&
    discoverySource !== "auto" &&
    discoverySource !== "rpc" &&
    discoverySource !== "tracker"
  ) {
    throw new Error("discoverySource must be auto, rpc, or tracker.");
  }
  let orderSizesUsd: number[] | undefined;
  if (body.orderSizesUsd !== undefined) {
    if (
      !Array.isArray(body.orderSizesUsd) ||
      body.orderSizesUsd.length < 1 ||
      body.orderSizesUsd.length > PIPELINE_LIMITS.maxOrderSizes ||
      body.orderSizesUsd.some((value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 1 ||
        value > PIPELINE_LIMITS.maxOrderSizeUsd
      )
    ) {
      throw new Error(
        `orderSizesUsd must contain 1–${PIPELINE_LIMITS.maxOrderSizes} numbers from 1 to ${PIPELINE_LIMITS.maxOrderSizeUsd}.`,
      );
    }
    orderSizesUsd = [...new Set(body.orderSizesUsd as number[])];
  }
  let evaluatedAt: string | undefined;
  if (body.evaluatedAt !== undefined) {
    if (typeof body.evaluatedAt !== "string" || body.evaluatedAt.length > 64) {
      throw new Error("evaluatedAt must be an ISO-8601 timestamp.");
    }
    const timestamp = Date.parse(body.evaluatedAt);
    if (!Number.isFinite(timestamp)) throw new Error("evaluatedAt must be an ISO-8601 timestamp.");
    if (timestamp > Date.now()) throw new Error("evaluatedAt cannot be in the future.");
    evaluatedAt = new Date(timestamp).toISOString();
  }
  return {
    maxCoins: integer(body.maxCoins, "maxCoins", 1, PIPELINE_LIMITS.maxCoins),
    maxDiscoveryPages: integer(
      body.maxDiscoveryPages,
      "maxDiscoveryPages",
      1,
      PIPELINE_LIMITS.maxDiscoveryPages,
    ),
    discoverySource: discoverySource as PipelineDiscoverySource | undefined,
    historyLimit: integer(
      body.historyLimit,
      "historyLimit",
      1,
      PIPELINE_LIMITS.maxHistoryTransactions,
    ),
    collectAdvanced: boolean(body.collectAdvanced, "collectAdvanced"),
    allowMetered: boolean(body.allowMetered, "allowMetered"),
    collectionMaxPages: integer(
      body.collectionMaxPages,
      "collectionMaxPages",
      1,
      PIPELINE_LIMITS.maxCollectionPages,
    ),
    collectionWindowHours: finite(
      body.collectionWindowHours,
      "collectionWindowHours",
      1,
      PIPELINE_LIMITS.maxCollectionWindowHours,
    ),
    orderSizesUsd,
    slippageBps: integer(body.slippageBps, "slippageBps", 1, 1_000),
    horizonSeconds: integer(body.horizonSeconds, "horizonSeconds", 1, 31 * 86_400),
    orderSizeUsd: finite(
      body.orderSizeUsd,
      "orderSizeUsd",
      1,
      PIPELINE_LIMITS.maxOrderSizeUsd,
    ),
    maxOutcomeSnapshots: integer(
      body.maxOutcomeSnapshots,
      "maxOutcomeSnapshots",
      1,
      PIPELINE_LIMITS.maxOutcomeSnapshots,
    ),
    runTelegramAlerts: boolean(body.runTelegramAlerts, "runTelegramAlerts"),
    telegramDryRun: boolean(body.telegramDryRun, "telegramDryRun"),
    telegramLimit: integer(
      body.telegramLimit,
      "telegramLimit",
      1,
      PIPELINE_LIMITS.maxTelegramAlerts,
    ),
    evaluatedAt,
  };
}

/** Protected manual/scheduler entry point. No GET execution surface is exported. */
export async function POST(request: Request) {
  const configuredToken = getBackfillAdminToken();
  if (!configuredToken) {
    return Response.json(
      {
        status: "not-configured",
        reason: "Set BACKFILL_ADMIN_TOKEN before running the research pipeline.",
      },
      { status: 503, headers },
    );
  }
  const providedToken = request.headers.get("x-backfill-token") ?? "";
  if (!constantTimeEqual(configuredToken, providedToken)) {
    return Response.json(
      { status: "unauthorized", reason: "A valid x-backfill-token header is required." },
      { status: 401, headers },
    );
  }
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return invalid("Request exceeds the 16 KB pipeline limit.", 413);
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return invalid("Body must be one JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return invalid("Body must be valid JSON.");
  }
  let options: ResearchPipelineOptions;
  try {
    options = parseOptions(body);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Invalid pipeline options.");
  }

  const result = await runResearchPipeline(options);
  return Response.json(result, {
    status: result.status === "failed" ? 503 : 200,
    headers,
  });
}

import { getBackfillAdminToken } from "@/lib/providers/config";
import { runBoundedArchiveBackfill } from "@/lib/ingestion/backfill";

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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function POST(request: Request) {
  const configuredToken = getBackfillAdminToken();
  if (!configuredToken) {
    return Response.json(
      {
        error: "backfill_not_configured",
        message: "Set BACKFILL_ADMIN_TOKEN and SOLANA_ARCHIVE_RPC_URL on the server before running a backfill.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const providedToken = request.headers.get("x-backfill-token") ?? "";
  if (!constantTimeEqual(configuredToken, providedToken)) {
    return Response.json(
      { error: "unauthorized", message: "A valid x-backfill-token header is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  let body: Record<string, unknown> = {};
  try {
    const value = await request.json();
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      body = value as Record<string, unknown>;
    }
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Request body must be a JSON object." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = await runBoundedArchiveBackfill({
    before: typeof body.before === "string" ? body.before : undefined,
    until: typeof body.until === "string" ? body.until : undefined,
    maxPages: optionalNumber(body.maxPages),
    signaturesPerPage: optionalNumber(body.signaturesPerPage),
    maxAssets: optionalNumber(body.maxAssets),
    historyPerAsset: optionalNumber(body.historyPerAsset),
    maxHistoryAssets: optionalNumber(body.maxHistoryAssets),
    dryRun: body.dryRun === true,
  });
  const unavailable = response.coverage.every((entry) =>
    entry.errorCode === "not_configured",
  );
  return Response.json(response, {
    status: unavailable ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Research-Data": "bounded-archive-backfill",
    },
  });
}
